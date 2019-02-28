const util = require('util')
const EventEmitter = require('eventemitter3')
const { helper, assert } = require('../helper')
const Events = require('../Events')
const BrowserContext = require('./BrowserContext')
const Target = require('../Target')
const { TaskQueue } = require('../TaskQueue')
const {
  adaptChromeRemoteInterfaceClient,
  CRIConnection
} = require('../connection')

async function dummyCloseCB () {}

class Browser extends EventEmitter {
  /**
   * @param {Chrome|CRIConnection|Object} connection
   * @param {BrowserInitOptions} [initOpts = {}]
   * @return {Browser}
   */
  static async create (connection, initOpts = {}) {
    const browser = new Browser(
      connection instanceof CRIConnection
        ? connection
        : adaptChromeRemoteInterfaceClient(connection),
      Object.assign({ contextIds: [] }, initOpts)
    )
    await connection.send('Target.setDiscoverTargets', { discover: true })
    return browser
  }

  /**
   * @param {!Chrome|CRIConnection} connection
   * @param {BrowserInitOptions} initOpts
   */
  constructor (
    connection,
    {
      contextIds,
      ignoreHTTPSErrors,
      defaultViewport,
      closeCallback,
      additionalDomains,
      process
    }
  ) {
    super()
    /**
     * @type {boolean}
     */
    this._ignoreHTTPSErrors = ignoreHTTPSErrors

    /**
     * @type {?Object}
     */
    this._defaultViewport = defaultViewport

    /**
     * @type {?Object}
     */
    this._process = process

    /**
     * @type {TaskQueue}
     * @private
     */
    this._screenshotTaskQueue = new TaskQueue()

    /**
     * @type {!Chrome|CRIConnection}
     * @private
     */
    this._connection = connection

    /**
     * @type {*|dummyCloseCB}
     * @private
     */
    this._closeCallback = closeCallback || dummyCloseCB

    /**
     * @type {?ExtraDomainsConfig}
     */
    this._additionalDomains = additionalDomains

    /**
     * @type {BrowserContext}
     * @private
     */
    this._defaultContext = new BrowserContext(this._connection, this, null)

    /** @type {Map<string, BrowserContext>} */
    this._contexts = new Map()

    for (let i = 0; i < contextIds.length; i++) {
      this._contexts.set(
        contextIds[i],
        new BrowserContext(this._connection, this, contextIds[i])
      )
    }

    /** @type {Map<string, Target>} */
    this._targets = new Map()
    this._connection.on(
      this._connection.$$disconnectEvent || Events.CRIClient.Disconnected,
      () => this.emit(Events.Browser.Disconnected)
    )
    this._connection.on('Target.targetCreated', this._targetCreated.bind(this))
    this._connection.on(
      'Target.targetDestroyed',
      this._targetDestroyed.bind(this)
    )
    this._connection.on(
      'Target.targetInfoChanged',
      this._targetInfoChanged.bind(this)
    )
  }

  /**
   * @return {Array<Target>}
   */
  targets () {
    return Array.from(this._targets.values()).filter(
      target => target._isInitialized
    )
  }

  /**
   * @return {!Target}
   */
  target () {
    return this.targets().find(target => target.type() === 'browser')
  }

  /**
   * @desc Disconnect from the browser
   */
  disconnect () {
    this._connection.dispose()
  }

  /**
   * @return {Array<BrowserContext>}
   */
  browserContexts () {
    return [this._defaultContext, ...Array.from(this._contexts.values())]
  }

  /**
   * @return {!BrowserContext}
   */
  defaultBrowserContext () {
    return this._defaultContext
  }

  /**
   * @return {string}
   */
  wsEndpoint () {
    return this._connection.webSocketUrl
  }

  /**
   * @desc Returns version information
   * @return {Promise<{protocolVersion: string, product: string, revision: string, userAgent: string, jsVersion: string}>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Browser#method-getVersion
   */
  versionInfo () {
    return this._connection.send('Browser.getVersion', {})
  }

  /**
   * Returns all browser contexts created with Target.createBrowserContext method.
   * EXPERIMENTAL
   * @return {Promise<Array<string>>} An array of browser context ids
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Target/#method-getBrowserContexts
   */
  async listBrowserContexts () {
    const { browserContextIds } = await this._connection.send(
      'Target.getBrowserContexts',
      {}
    )
    return browserContextIds
  }

  /**
   * @desc Retrieves a list of available targets
   * @return {Promise<Array<Object>>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Target#method-getTargets
   */
  async listTargets () {
    const { targetInfos } = await this._connection.send('Target.getTargets')
    return targetInfos
  }

  /**
   * @return {Promise<BrowserContext>}
   */
  async createIncognitoBrowserContext () {
    const { browserContextId } = await this._connection.send(
      'Target.createBrowserContext'
    )
    const context = new BrowserContext(this._connection, this, browserContextId)
    this._contexts.set(browserContextId, context)
    return context
  }

  /**
   * @param {function(target: Target):boolean} predicate
   * @param {{timeout?: number}} [options = {}]
   * @return {Promise<Target>}
   */
  async waitForTarget (predicate, options = {}) {
    const { timeout = 30000 } = options
    const existingTarget = this.targets().find(predicate)
    if (existingTarget) return existingTarget
    let done
    const targetPromise = new Promise(resolve => (done = resolve))
    this.on(Events.Browser.TargetCreated, check)
    this.on(Events.Browser.TargetChanged, check)
    try {
      if (!timeout) return await targetPromise
      return await helper.waitWithTimeout(targetPromise, 'target', timeout)
    } finally {
      this.removeListener(Events.Browser.TargetCreated, check)
      this.removeListener(Events.Browser.TargetChanged, check)
    }

    /**
     * @param {!Target} target
     */
    function check (target) {
      if (predicate(target)) done(target)
    }
  }

  /**
   * @return {Promise<Array<Page>>}
   */
  async pages () {
    const contextPages = await Promise.all(
      this.browserContexts().map(context => context.pages())
    )
    // Flatten array.
    return contextPages.reduce((acc, x) => acc.concat(x), [])
  }

  /**
   * @return {Promise<string>}
   */
  async version () {
    const version = await this.versionInfo()
    return version.product
  }

  /**
   * @return {Promise<string>}
   */
  async userAgent () {
    const version = await this.versionInfo()
    return version.userAgent
  }

  async close () {
    await this._closeCallback.call(null)
    this.disconnect()
  }

  /**
   * @return {Promise<Page>}
   */
  async newPage () {
    return this._defaultContext.newPage()
  }

  /**
   * @param {?string} contextId
   */
  async _disposeContext (contextId) {
    await this._connection.send('Target.disposeBrowserContext', {
      browserContextId: contextId || undefined
    })
    this._contexts.delete(contextId)
  }

  /**
   * @param {!Object} event
   */
  async _targetCreated (event) {
    const targetInfo = event.targetInfo
    const { browserContextId } = targetInfo
    const context =
      browserContextId && this._contexts.has(browserContextId)
        ? this._contexts.get(browserContextId)
        : this._defaultContext

    const target = new Target(
      targetInfo,
      context,
      () => this._connection.createSession(targetInfo),
      {
        ignoreHTTPSErrors: this._ignoreHTTPSErrors,
        defaultViewport: this._defaultViewport,
        screenshotTaskQueue: this._screenshotTaskQueue,
        additionalDomains: this._additionalDomains
      }
    )
    assert(
      !this._targets.has(event.targetInfo.targetId),
      'Target should not exist before targetCreated'
    )
    this._targets.set(event.targetInfo.targetId, target)

    if (await target._initializedPromise) {
      this.emit(Events.Browser.TargetCreated, target)
      context.emit(Events.BrowserContext.TargetCreated, target)
    }
  }

  /**
   * @param {{targetId: string}} event
   */
  async _targetDestroyed (event) {
    const target = this._targets.get(event.targetId)
    target._initializedCallback(false)
    this._targets.delete(event.targetId)
    target._closedCallback()
    if (await target._initializedPromise) {
      this.emit(Events.Browser.TargetDestroyed, target)
      target
        .browserContext()
        .emit(Events.BrowserContext.TargetDestroyed, target)
    }
  }

  /**
   * @param {?string} contextId
   * @return {Promise<Page>}
   */
  async _createPageInContext (contextId) {
    const { targetId } = await this._connection.send('Target.createTarget', {
      url: 'about:blank',
      browserContextId: contextId || undefined
    })
    const target = await this._targets.get(targetId)
    assert(await target._initializedPromise, 'Failed to create target for page')
    return target.page()
  }

  /**
   * @param {!Object} event
   */
  _targetInfoChanged (event) {
    const target = this._targets.get(event.targetInfo.targetId)
    assert(target, 'target should exist before targetInfoChanged')
    const previousURL = target.url()
    const wasInitialized = target._isInitialized
    target._targetInfoChanged(event.targetInfo)
    if (wasInitialized && previousURL !== target.url()) {
      this.emit(Events.Browser.TargetChanged, target)
      target.browserContext().emit(Events.BrowserContext.TargetChanged, target)
    }
  }

  /** @ignore */
  // eslint-disable-next-line space-before-function-paren
  [util.inspect.custom](depth, options) {
    if (depth < 0) {
      return options.stylize('[Browser]', 'special')
    }

    const newOptions = Object.assign({}, options, {
      depth: options.depth === null ? null : options.depth - 1
    })
    const inner = util.inspect(
      {
        defaultContext: this._defaultContext,
        contexts: this._contexts,
        targets: this._targets,
        ignoreHTTPSErrors: this._ignoreHTTPSErrors,
        defaultViewport: this._defaultViewport
      },
      newOptions
    )
    return `${options.stylize('Browser', 'special')} ${inner}`
  }
}

/**
 * @type {Browser}
 */
module.exports = Browser

/**
 * @typedef {Object} BrowserInitOptions
 * @property {Object} [process]
 * @property {?Array<string>} [contextIds]
 * @property {?boolean} [ignoreHTTPSErrors]
 * @property {?Object} [defaultViewport]
 * @property {?(function():Promise)} [closeCallback]
 * @property {?ExtraDomainsConfig} [additionalDomains]
 */
