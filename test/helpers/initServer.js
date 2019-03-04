const path = require('path')
const fs = require('fs-extra')
const ws = require('ws')
const createServer = require('fastify')
const SlowStream = require('./slowStream')
const { delay } = require('./utils')

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
  cert: path.join(__dirname, 'cert.pem')
}
const decoratingHeaderPaths = {
  emptyFooBar: '/emptyFooBarHeaders.html',
  emptyCSP: '/emptyCSP.html',
  emptyCSPSelf: '/emptyCSPSelf.html',
  jsonGzip: '/simple.json.gz',
  pngGzip: '/pptr.png.gz'
}

const makePaths = (port, https = false) => ({
  PREFIX: `http${https ? 's' : ''}://localhost:${port}`,
  CROSS_PROCESS_PREFIX: `http${https ? '' : 's'}://127.0.0.1:${port}`,
  EMPTY_PAGE: `http${https ? 's' : ''}://localhost:${port}/empty.html`,
  EMPTY_FOO_BAR_HEADERS_PAGE: `http${https ? 's' : ''}://localhost:${port}${
    decoratingHeaderPaths.emptyFooBar
  }`,
  EMPTY_CSP: `http${https ? 's' : ''}://localhost:${port}${
    decoratingHeaderPaths.emptyCSP
  }`,
  EMPTY_CSP_SELF: `http${https ? 's' : ''}://localhost:${port}${
    decoratingHeaderPaths.emptyCSPSelf
  }`,
  AUTH_EMPTY_PAGE: `http${https ? 's' : ''}://localhost:${port}/authEmpty.html`,
  AUTH_EMPTY_PAGE_2: `http${
    https ? 's' : ''
  }://localhost:${port}/authEmpty2.html`,
  AUTH_EMPTY_PAGE_3: `http${
    https ? 's' : ''
  }://localhost:${port}/authEmpty3.html`
})

function promiseResolveReject () {
  const prr = { promise: null, resolve: null, reject: null }
  prr.promise = new Promise((resolve, reject) => {
    prr.resolve = resolve
    prr.reject = reject
  })
  return prr
}

/**
 * @param {Object} config
 * @return {fastify.FastifyInstance}
 */
function setUpServer (config) {
  const fastify = createServer(config.fastifyOpts)
  /** @type {Map<string, {resolve: function(value: *): void, reject: function(reason: *): void, promise: Promise<*>}>} */
  const requestSubscribers = new Map()
  let wsServerInstance
  let slowSteamSpeed = 500

  for (const [pk, pv] of Object.entries(config.paths)) {
    fastify.decorate(pk, pv)
  }

  const checkReqSubscribers = (pathName, request, reply) => {
    const handler = requestSubscribers.get(pathName)
    if (handler) {
      handler.resolve(request)
      requestSubscribers.delete(pathName)
    }
  }

  fastify
    .decorate('config', config)
    .decorate('PORT', config.port)
    .decorate('slowStreamSpeed', howSlow => {
      slowSteamSpeed = howSlow
    })
    .decorate('testURL', pathName => `${config.prefix}${pathName}`)
    .decorate('stop', () => {
      fastify.reset()
      return fastify.close()
    })
    .decorate('reset', () => {
      slowSteamSpeed = 500
      const error = new Error('Static Server has been reset')
      for (const prr of requestSubscribers.values()) {
        prr.reject.call(null, error)
      }
      requestSubscribers.clear()
    })
    .decorate('waitForRequest', route => {
      let prr = requestSubscribers.get(route)
      if (prr) return prr.promise
      prr = promiseResolveReject()
      requestSubscribers.set(route, prr)
      return prr.promise
    })
    .get('/longTimeJack', async (request, reply) => {
      checkReqSubscribers('/longTimeJack', request, reply)
      await delay(5000)
      reply.status(404)
      return 'boooo'
    })
    .get('/longTimeImage.png', async (request, reply) => {
      checkReqSubscribers('/longTimeImage.png', request, reply)
      await delay(5000)
      reply.redirect('/pptr.png')
    })
    .get('/neverImage.png', async (request, reply) => {
      checkReqSubscribers('/neverImage.png', request, reply)
      await delay(5000)
      reply.status(404)
      return 'Not Found'
    })
    .get('/endlessVoid', (request, reply) => {
      checkReqSubscribers('/endlessVoid', request, reply)
      reply.status(204).send()
    })
    .get('/infinite-redir', (request, reply) => {
      reply.redirect('/infinite-redir-1')
    })
    .get('/infinite-redir-1', (request, reply) => {
      reply.redirect('/infinite-redir-2')
    })
    .get('/infinite-redir-2', (request, reply) => {
      reply.redirect('/infinite-redir')
    })
    .get('/fetch-request-:n', (request, reply) => {
      reply.send({ n: request.params.n })
    })
    .get('/some%20nonexisting%20page', (request, reply) => {
      reply.status(404).send('some nonexisting page')
    })
    .get('/malformed', (request, reply) => {
      reply.status(200).send(request.query)
    })
    .get('/foo.html', (request, reply) => {
      reply.redirect('/empty.html')
    })
    .get('/cool', (request, reply) => {
      reply.status(200).send('cool!')
    })
    .get('/get', (request, reply) => {
      checkReqSubscribers('/get', request, reply)
      reply
        .header('Content-Type', 'text/plain; charset=utf-8')
        .status(200)
        .send('hello world')
    })
    .get('/get-slow', async (request, reply) => {
      checkReqSubscribers('/get-slow', request, reply)
      reply.type('text/plain; charset=utf-8')
      return new SlowStream({ contents: 'hello world!', delay: slowSteamSpeed })
    })
    .get('/redirect/1.html', (request, reply) => {
      reply.redirect('/redirect/2.html')
    })
    .get('/redirect/2.html', (request, reply) => {
      reply.redirect('/empty.html')
    })
    .get('/redirect2/1.html', (request, reply) => {
      reply.redirect('/redirect2/2.html')
    })
    .get('/redirect2/2.html', (request, reply) => {
      reply.redirect('/redirect2/3.html')
    })
    .get('/redirect2/3.html', (request, reply) => {
      reply.redirect('/empty.html')
    })
    .get('/rredirect', (request, reply) => {
      reply.redirect('/empty.html')
    })
    .get('/rrredirect', (request, reply) => {
      reply.redirect('/frames/one-frame.html')
    })
    .get('/non-existing-page.html', (request, reply) => {
      reply.redirect('/non-existing-page-2.html')
    })
    .get('/non-existing-page-2.html', (request, reply) => {
      reply.redirect('/non-existing-page-3.html')
    })
    .get('/non-existing-page-3.html', (request, reply) => {
      reply.redirect('/non-existing-page-4.html')
    })
    .get('/non-existing-page-4.html', (request, reply) => {
      reply.redirect('/empty.html')
    })
    .get('/style-redir-1.css', (request, reply) => {
      reply.redirect('/style-redir-2.css')
    })
    .get('/style-redir-2.css', (request, reply) => {
      reply.redirect('/style-redir-3.css')
    })
    .get('/style-redir-3.css', (request, reply) => {
      reply.redirect('/style-redir-4.css')
    })
    .get('/style-redir-4.css', (request, reply) => {
      reply
        .header('Content-Type', 'text/css; charset=utf-8')
        .status(200)
        .send('body {box-sizing: border-box; }')
    })
    .get('/non-existing.json', (request, reply) => {
      reply.redirect('/non-existing-2.json')
    })
    .get('/non-existing-2.json', (request, reply) => {
      reply.redirect('/simple.html')
    })
    .get('/zzz', (request, reply) => {
      reply.status(200).send('zzz')
    })
    .get('/sleep.zzz', (request, reply) => {
      checkReqSubscribers('/get', request, reply)
      reply.status(200).send('zzz')
    })
    .get('/one-style-redir.css', (request, reply) => {
      checkReqSubscribers('/one-style-redir.css', request, reply)
      reply.redirect('/injectedstyle.css')
    })
    .post('/post', (request, reply) => {
      checkReqSubscribers('/post', request, reply)
      reply.status(200).send(request.body)
    })
    .register(require('fastify-favicon'))
    .register(require('fastify-formbody'))
    .register(require('fastify-basic-auth'), {
      authenticate: { realm: 'Secure Area' },
      async validate (username, password, request, reply, done) {
        let valid = false
        switch (request.req.url) {
          case '/authEmpty.html':
            valid = username === 'user' && password === 'pass'
            break
          case '/authEmpty2.html':
            valid = username === 'user2' && password === 'pass2'
            break
          case '/authEmpty3.html':
            valid = username === 'user3' && password === 'pass3'
            break
        }
        if (!valid) {
          reply.status(401)
          return new Error(`HTTP Error 401 Unauthorized: Access is denied`)
        }
      }
    })
    .register(require('fastify-static'), {
      root: config.staticPath,
      etag: false,
      lastModified: false
    })
    .addHook('onClose', (fastify, done) => wsServerInstance.close(done))
    .addHook('onRequest', async function (request, reply, next) {
      const pathName = request.req.url
      switch (pathName) {
        case decoratingHeaderPaths.emptyFooBar:
          reply.header('foo', 'bar')
          break
        case decoratingHeaderPaths.emptyCSP:
          reply.header(
            'Content-Security-Policy',
            `script-src ${fastify.PREFIX}`
          )
          break
        case decoratingHeaderPaths.emptyCSPSelf:
          reply.header('Content-Security-Policy', 'default-src "self"')
          break
        case decoratingHeaderPaths.jsonGzip:
          reply.header('content-encoding', 'gzip')
          break
      }
      checkReqSubscribers(pathName, request, reply)
    })
    .after(() => {
      fastify
        .route({
          method: 'GET',
          url: '/authEmpty.html',
          preHandler: fastify.basicAuth,
          handler (request, reply) {
            reply.redirect('/empty.html')
          }
        })
        .route({
          method: 'GET',
          url: '/authEmpty2.html',
          preHandler: fastify.basicAuth,
          handler (request, reply) {
            reply.redirect('/empty.html')
          }
        })
        .route({
          method: 'GET',
          url: '/authEmpty3.html',
          preHandler: fastify.basicAuth,
          handler (request, reply) {
            reply.redirect('/empty.html')
          }
        })
    })

  wsServerInstance = new ws.Server({ server: fastify.server })

  shutdownOnSignals.forEach(signal => {
    process.once(signal, () => {
      setTimeout(() => {
        fastify.log.error(
          { signal: signal, timeout: gracefullShutdownTimeout },
          'terminate process after timeout'
        )
        fastify.reset()
        process.exit(1)
      }, gracefullShutdownTimeout).unref()
      fastify.log.info(
        { signal: signal },
        'received signal triggering close hook'
      )
      fastify.stop()
    })
  })
  return fastify
}

/**
 * @return {Promise<fastify.FastifyInstance>}
 */
async function initHTTPServer () {
  const config = {
    host: host,
    port: portHttp,
    timeout: timeout,
    staticPath,
    fastifyOpts: {
      trustProxy: true,
      logger: enableLogging,
      ignoreTrailingSlash: true
    },
    paths: makePaths(portHttp)
  }
  const server = setUpServer(config)
  const listeningOn = await server.listen(config.port, config.host)
  server.log.info(
    `Server listening on\n${
      listeningOn.startsWith('http://127.0.0.1')
        ? listeningOn.replace('http://127.0.0.1', 'http://localhost')
        : listeningOn
    }`
  )
  return server
}

/**
 * @return {Promise<fastify.FastifyInstance>}
 */
async function initHTTPSServer () {
  const config = {
    host: host,
    port: portHttps,
    timeout: timeout,
    staticPath,
    fastifyOpts: {
      trustProxy: true,
      logger: enableLogging,
      ignoreTrailingSlash: true,
      https: {
        key: await fs.readFile(keyCert.key),
        cert: await fs.readFile(keyCert.cert),
        passphrase: 'aaaa'
      }
    },
    paths: makePaths(portHttps, true)
  }
  const server = setUpServer(config)
  const listeningOn = await server.listen(config.port, config.host)
  server.log.info(
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
async function initServers () {
  const server = await initHTTPServer()
  const httpsServer = await initHTTPSServer()
  return { server, httpsServer }
}

module.exports = {
  initServers,
  initHTTPServer,
  initHTTPSServer
}
