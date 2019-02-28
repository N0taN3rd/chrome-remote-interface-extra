const path = require('path')
const url = require('url')
const fastify = require('fastify')
const fs = require('fs-extra')
const WSServer = require('ws').Server

const host = '127.0.0.1'
const timeout = 10 * 1000
const gracefullShutdownTimeout = 50000
const portHttp = 3030
const portHttps = portHttp + 1
const enableLogging = process.env.LOG != null || false
const staticPath = path.join(__dirname, '..', 'assets')
const shutdownOnSignals = ['SIGINT', 'SIGTERM', 'SIGHUP']

const keyCert = {
  key: path.join(__dirname, 'key.pem'),
  cert: path.join(__dirname, 'certificate.pem')
}

async function getCerts () {
  const keyExists = await fs.pathExists(keyCert.key)
  const certExists = await fs.pathExists(keyCert.cert)
  if (!keyExists && !certExists) {
    const { keygen } = require('tls-keygen')
    await keygen(keyCert)
  }
  return {
    key: await fs.readFile(keyCert.key),
    cert: await fs.readFile(keyCert.cert)
  }
}

/**
 * @param {Object} config
 * @return {fastify.FastifyInstance}
 */
function setUpServer (config) {
  const server = fastify(config.fastifyOpts)
  /** @type {Map<string, {username:string, password:string}>} */
  const auths = new Map()
  /** @type {Map<string, string>} */
  const csp = new Map()
  /** @type {Map<string, {resolve: function(value: *): void, reject: function(reason: *): void, promise: Promise<*>}>} */
  const requestSubscribers = new Map()
  /** @type {Map<string, function(request: fastify.FastifyRequest, reply: fastify.FastifyReply, next: function (err: *): void): void>} */
  const routes = new Map()
  let wsServerInstance

  server
    .decorate('config', config)
    .decorate('PORT', config.port)
    .decorate('PREFIX', config.prefix)
    .decorate('CROSS_PROCESS_PREFIX', config.crossProcessPrefix)
    .decorate('EMPTY_PAGE', config.emptyPage)
    .decorate('testURL', pathName => `${config.prefix}${pathName}`)
    .decorate('stop', () => {
      server.reset()
      return server.close()
    })
    .decorate('setAuth', (path, username, password) => {
      auths.set(path, { username, password })
    })
    .decorate('setCSP', (path, csp) => {
      csp.set(path, csp)
    })
    .decorate('setRoute', (path, handler) => {
      routes.set(path, handler)
    })
    .decorate('setRedirect', (from, to) => {
      server.setRoute(from, (request, reply, next) => {
        reply
          .header('location', to)
          .status(302)
          .send()
      })
    })
    .decorate('reset', () => {
      auths.clear()
      csp.clear()
      routes.clear()
      const error = new Error('Static Server has been reset')
      for (const prr of requestSubscribers.values()) {
        prr.reject.call(null, error)
      }
      requestSubscribers.clear()
    })
    .decorate('waitForRequest', path => {
      let prr = requestSubscribers.get(path)
      if (prr) return prr.promise
      prr = { promise: null, resolve: null, reject: null }
      prr.promise = new Promise((resolve, reject) => {
        prr.resolve = resolve
        prr.reject = reject
      })
      requestSubscribers.set(path, prr)
      return prr.promise
    })
    .addHook('onClose', (fastify, done) => wsServerInstance.close(done))
    .addHook('onRequest', (request, reply, next) => {
      const pathName = url.parse(request.raw.url).path
      if (auths.has(pathName)) {
        const auth = auths.get(pathName)
        const credentials = Buffer.from(
          (request.headers.authorization || '').split(' ')[1] || '',
          'base64'
        ).toString()

        if (credentials !== `${auth.username}:${auth.password}`) {
          reply
            .header('WWW-Authenticate', 'Basic realm="Secure Area"')
            .status(401)
            .send('HTTP Error 401 Unauthorized: Access is denied')
          return
        }
      }
      if (requestSubscribers.has(pathName)) {
        requestSubscribers.get(pathName).resolve(request.raw)
        requestSubscribers.delete(pathName)
      }
      const dynamicRouteHandler = routes.get(pathName)
      if (dynamicRouteHandler) {
        // eslint-disable-next-line no-useless-call
        dynamicRouteHandler.call(null, request, reply, next)
        return
      }
      next()
    })
    .addHook('onSend', (request, reply, payload, next) => {
      const path = url.parse(request.raw.url).path
      if (csp.has(path)) {
        reply.header('Content-Security-Policy', csp.get(path))
      }
      next()
    })
    .register(require('fastify-static'), {
      root: config.staticPath
    })

  wsServerInstance = new WSServer({ server: server.server })

  shutdownOnSignals.forEach(signal => {
    process.once(signal, () => {
      setTimeout(() => {
        server.log.error(
          { signal: signal, timeout: gracefullShutdownTimeout },
          'terminate process after timeout'
        )
        server.reset()
        process.exit(1)
      }, gracefullShutdownTimeout).unref()
      server.log.info(
        { signal: signal },
        'received signal triggering close hook'
      )
      server.stop()
    })
  })
  return server
}

async function initHTTPServer () {
  const config = {
    host: host,
    port: portHttp,
    timeout: timeout,
    staticPath,
    prefix: `http://localhost:${portHttp}`,
    crossProcessPrefix: `http://127.0.0.1:${portHttp}`,
    emptyPage: `http://localhost:${portHttp}/empty.html`,
    fastifyOpts: {
      trustProxy: true,
      logger: enableLogging
    }
  }
  const server = setUpServer(config)
  const listeningOn = await server.listen(config.port, config.host)
  console.log(
    `Server listening on\n${
      listeningOn.startsWith('http://127.0.0.1')
        ? listeningOn.replace('http://127.0.0.1', 'http://localhost')
        : listeningOn
    }`
  )
  return server
}

async function initHTTPSServer () {
  const config = {
    host: host,
    port: portHttps,
    timeout: timeout,
    staticPath,
    prefix: `http://localhost:${portHttps}`,
    crossProcessPrefix: `http://127.0.0.1:${portHttps}`,
    emptyPage: `http://localhost:${portHttps}/empty.html`,
    fastifyOpts: {
      trustProxy: true,
      logger: enableLogging,
      http2: true,
      https: await getCerts()
    }
  }
  const server = setUpServer(config)
  const listeningOn = await server.listen(config.port, config.host)
  console.log(
    `Server listening on\n${
      listeningOn.startsWith('https://127.0.0.1')
        ? listeningOn.replace('https://127.0.0.1', 'https://localhost')
        : listeningOn
    }`
  )
  return server
}

/**
 * @return {Promise<{server: fastify.FastifyInstance, httpsServer: fastify.FastifyInstance}>}
 */
module.exports = async function initServer () {
  const server = await initHTTPServer()
  const httpsServer = await initHTTPSServer()
  return { server, httpsServer }
}
