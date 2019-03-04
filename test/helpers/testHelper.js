const path = require('path')
const fs = require('fs-extra')
const { initChrome } = require('./initChrome')
const { initHTTPServer, initHTTPSServer, initServers } = require('./initServer')
const compare = require('./goldenHelper')
const { CRIExtra, Browser } = require('../../index')
const { delay } = require('./utils')

/**
 * @typedef {Object} TestHelperInit
 * @property {Browser} browser
 * @property {CRIConnection} client
 * @property {fastify.FastifyInstance} server
 * @property {fastify.FastifyInstance} httpsServer
 * @property {*} t
 */

const GOLDEN_DIR = path.join(__dirname, '..', '/golden')
const OUTPUT_DIR = path.join(__dirname, '..', '/golden-output')

const testDomains = {
  workers: true,
  coverage: true,
  console: true,
  log: true,
  performance: true
}

const defaultViewport = { width: 800, height: 600 }

async function cleanUpCookies (page) {
  const cookies = await page.cookies()
  for (let i = 0; i < cookies.length; i++) {
    try {
      await cookies[i].deleteCookie()
    } catch (e) {
      console.log(e)
    }
  }
}

/**
 * @type {TestHelper}
 */
exports.TestHelper = class TestHelper {
  static onlyServer () {
    return initHTTPServer()
  }
  /**
   * @param {*} t
   * @return {Promise<TestHelper>}
   */
  static async withHTTP (t) {
    if (fs.pathExistsSync(OUTPUT_DIR)) fs.removeSync(OUTPUT_DIR)
    const { killChrome, chromeProcess } = await initChrome()
    const server = await initHTTPServer()
    const { webSocketDebuggerUrl } = await CRIExtra.Version()
    // aint the chrome-remote-interface by cyrus-and the best <3
    const client = await CRIExtra({ target: webSocketDebuggerUrl })
    const browser = await Browser.create(client, {
      defaultViewport,
      process: chromeProcess,
      additionalDomains: testDomains,
      async closeCallback () {
        killChrome()
      }
    })
    await browser.waitForTarget(t => t.type() === 'page')
    return new TestHelper({ server, client, browser, t })
  }

  /**
   * @param {*} t
   * @return {Promise<TestHelper>}
   */
  static async withHTTPS (t) {
    if (fs.pathExistsSync(OUTPUT_DIR)) fs.removeSync(OUTPUT_DIR)
    const { killChrome, chromeProcess } = await initChrome()
    const httpsServer = await initHTTPSServer()
    const { webSocketDebuggerUrl } = await CRIExtra.Version()
    // aint the chrome-remote-interface by cyrus-and the best <3
    const client = await CRIExtra({ target: webSocketDebuggerUrl })
    const browser = await Browser.create(client, {
      defaultViewport,
      process: chromeProcess,
      additionalDomains: testDomains,
      async closeCallback () {
        killChrome()
      }
    })
    await browser.waitForTarget(t => t.type() === 'page')
    return new TestHelper({ httpsServer, client, browser, t })
  }

  /**
   * @param {*} t
   * @return {Promise<TestHelper>}
   */
  static async withHTTPAndHTTPS (t) {
    if (fs.pathExistsSync(OUTPUT_DIR)) fs.removeSync(OUTPUT_DIR)
    const { killChrome, chromeProcess } = await initChrome()
    const { server, httpsServer } = await initServers()
    const { webSocketDebuggerUrl } = await CRIExtra.Version()
    // aint the chrome-remote-interface by cyrus-and the best <3
    const client = await CRIExtra({ target: webSocketDebuggerUrl })
    const browser = await Browser.create(client, {
      defaultViewport,
      process: chromeProcess,
      additionalDomains: testDomains,
      async closeCallback () {
        killChrome()
      }
    })
    await browser.waitForTarget(t => t.type() === 'page')
    return new TestHelper({ httpsServer, client, server, browser, t })
  }

  /**
   * @param {TestHelperInit} init
   */
  constructor ({ server, httpsServer, client, browser, t }) {
    /** @type {fastify.FastifyInstance} */
    this._server = server
    /** @type {fastify.FastifyInstance} */
    this._httpsServer = httpsServer
    /** @type {CRIConnection} */
    this._client = client
    this._browser = browser

    /** @type {*} */
    this._t = t

    /** @type {Array<Page>} */
    this._pages = []

    /** @type {Array<BrowserContext>} */
    this._contexts = []
  }

  /**
   * @return {fastify.FastifyInstance}
   */
  server () {
    return this._server
  }

  /**
   * @return {fastify.FastifyInstance}
   */
  httpsServer () {
    return this._httpsServer
  }

  /**
   * @return {Browser}
   */
  browser () {
    return this._browser
  }

  toBeGolden (what, filePath) {
    return compare(GOLDEN_DIR, OUTPUT_DIR, what, filePath)
  }

  /**
   * @param {string} target
   * @return {Promise<Browser>}
   */
  newBrowser (target) {
    return Browser.connect(target)
  }

  /**
   * @return {Promise<BrowserContext>}
   */
  async context () {
    const context = await this._browser.createIncognitoBrowserContext()
    this._contexts.push(context)
    return context
  }

  /**
   * @return {Promise<Page>}
   */
  async contextPage () {
    const page = await this._contexts[0].newPage()
    this._pages.push(page)
    return page
  }

  /**
   * @return {Promise<Page>}
   */
  async newPage () {
    const page = await this._browser.newPage()
    this._pages.push(page)
    return page
  }

  resetServers () {
    if (this._server) {
      this._server.reset()
    }

    if (this._httpsServer) {
      this._httpsServer.reset()
    }
  }

  async cleanup () {
    this.resetServers()
    let i
    for (i = 0; i < this._pages.length; i++) {
      try {
        await this._pages[i].close()
      } catch (e) {}
    }
    this._pages.length = 0
    for (i = 0; i < this._contexts.length; i++) {
      await this._contexts[i].close()
    }
    this._contexts.length = 0
  }

  async deepClean () {
    this.resetServers()
    let i
    for (i = 0; i < this._pages.length; i++) {
      await cleanUpCookies(this._pages[i])
      await this._pages[i].close()
    }
    this._pages.length = 0

    for (i = 0; i < this._contexts.length; i++) {
      await this._contexts[i].close()
    }
    this._contexts.length = 0
  }

  async end () {
    await this.cleanup()
    if (this._browser) {
      await this._browser.close()
    }

    if (this._server) {
      await this._server.stop()
    }

    if (this._httpsServer) {
      await this._httpsServer.stop()
    }
  }
}
