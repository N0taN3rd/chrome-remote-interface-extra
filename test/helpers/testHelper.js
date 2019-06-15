const path = require('path')
const fs = require('fs-extra')
const { initChrome } = require('./initChrome')
const { initHTTPServer, initHTTPSServer, initServers } = require('./initServer')
const compare = require('./goldenHelper')
const Browser = require('../../lib/browser/Browser')

/**
 * @typedef {Object} TestHelperInit
 * @property {Browser} browser
 * @property {CRIConnection} client
 * @property {fastify.FastifyInstance} server
 * @property {fastify.FastifyInstance} httpsServer
 * @property {*} t
 */

const GOLDEN_DIR = path.join(__dirname, '..', 'fixtures', 'golden')
const OUTPUT_DIR = path.join(__dirname, '..', 'fixtures', 'golden-output')

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

async function ensureCleanOutputDir () {
  const exists = await fs.pathExists(OUTPUT_DIR)
  if (exists) {
    await fs.remove(OUTPUT_DIR)
  }
}

class TestHelper {
  static onlyServer () {
    return initHTTPServer()
  }
  /**
   * @param {*} t
   * @param {boolean} [ignoreHTTPSErrors = false]
   * @return {Promise<TestHelper>}
   */
  static async withHTTP (t, ignoreHTTPSErrors = false) {
    await ensureCleanOutputDir()
    const browser = await initChrome(
      ignoreHTTPSErrors,
      defaultViewport,
      testDomains
    )
    const server = await initHTTPServer()
    return new TestHelper({ server, client: browser.connection(), browser, t })
  }

  /**
   * @param {*} t
   * @param {boolean} [ignoreHTTPSErrors = false]
   * @return {Promise<TestHelper>}
   */
  static async withHTTPS (t, ignoreHTTPSErrors = false) {
    await ensureCleanOutputDir()
    const browser = await initChrome(
      ignoreHTTPSErrors,
      defaultViewport,
      testDomains
    )
    const httpsServer = await initHTTPSServer()
    return new TestHelper({
      httpsServer,
      client: browser.connection(),
      browser: browser,
      t
    })
  }

  /**
   * @param {*} t
   * @param {boolean} [ignoreHTTPSErrors = false]
   * @return {Promise<TestHelper>}
   */
  static async withHTTPAndHTTPS (t, ignoreHTTPSErrors = false) {
    await ensureCleanOutputDir()
    const browser = await initChrome(
      ignoreHTTPSErrors,
      defaultViewport,
      testDomains
    )
    const { server, httpsServer } = await initServers()
    return new TestHelper({
      httpsServer,
      client: browser.connection(),
      server,
      browser,
      t
    })
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
    /**
     * @type {Browser}
     */
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

  browserContext () {
    return this._browser.defaultBrowserContext()
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
    for (let i = 0; i < this._pages.length; i++) {
      try {
        await this._pages[i].close()
      } catch (e) {}
    }
    this._pages = []
    for (let i = 0; i < this._contexts.length; i++) {
      await this._contexts[i].close()
    }
    this._contexts = []
  }

  async deepClean () {
    this.resetServers()
    for (let i = 0; i < this._pages.length; i++) {
      await cleanUpCookies(this._pages[i])
      await this._pages[i].close()
    }
    this._pages = []

    for (let i = 0; i < this._contexts.length; i++) {
      await this._contexts[i].close()
    }
    this._contexts = []
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

/**
 * @type {TestHelper}
 */
module.exports = TestHelper

/**
 * @type {TestHelper}
 */
module.exports.TestHelper = TestHelper
