const util = require('util')
const { URL } = require('url')
const EventEmitter = require('eventemitter3')
const { helper, assert } = require('../helper')
const Events = require('../Events')
const BrowserContext = require('./BrowserContext')
const Target = require('../Target')
const TaskQueue = require('../TaskQueue')
const {
  adaptChromeRemoteInterfaceClient,
  CRIConnection
} = require('../connection')
const CRIExtra = require('../chromeRemoteInterfaceExtra')
const {
  getWindowBounds,
  closeTarget,
  getWindowForTarget,
  setWindowBounds
} = require('../__shared')

async function dummyCloseCB () {}

/**
 * @typedef {Object} BrowserInitOptions
 * @property {Object} [process]
 * @property {?Array<string>} [contextIds]
 * @property {?boolean} [ignoreHTTPSErrors]
 * @property {?Object} [defaultViewport]
 * @property {?(function():Promise)} [closeCallback]
 * @property {?EnabledExtras} [additionalDomains]
 * @property {?string} [browserWSEndpoint]
 * @property {number} [slowMo = 0] - An optional delay to be applied before emitting events
 */

/**
 * @see https://chromedevtools.github.io/devtools-protocol/tot/Browser
 */
class Browser extends EventEmitter {
  /**
   * @param {Chrome|CRIConnection|Object} connection
   * @param {BrowserInitOptions} [initOpts = {}]
   * @returns {Promise<Browser>}
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
   * @param {string} browserWSEndpoint
   * @param {BrowserInitOptions} [initOpts = {}]
   * @return {Promise<Browser>}
   */
  static async connect (browserWSEndpoint, initOpts = {}) {
    const url = new URL(browserWSEndpoint)
    const port = url.port ? parseInt(url.port, 10) : 9222
    const connection = await CRIExtra({
      host: url.host,
      port: port,
      target: browserWSEndpoint,
      delay: initOpts.slowMo || 0
    })
    const { browserContextIds } = await connection.send(
      'Target.getBrowserContexts',
      {}
    )
    return Browser.create(
      connection,
      Object.assign(initOpts, { contextIds: browserContextIds })
    )
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
     * @type {?EnabledExtras}
     */
    this._additionalDomains = additionalDomains

    /**
     * @type {BrowserContext}
     * @private
     */
    this._defaultContext = new BrowserContext(this._connection, this, null)

    /** @type {Map<string, BrowserContext>} */
    this._contexts = new Map()

    /**
     * @type {Map<string, string>}
     * @private
     */
    this._webPermissionToProtocol = new Map([
      ['geolocation', 'geolocation'],
      ['midi', 'midi'],
      ['notifications', 'notifications'],
      ['push', 'push'],
      ['camera', 'videoCapture'],
      ['videoCapture', 'videoCapture'],
      ['microphone', 'audioCapture'],
      ['audioCapture', 'audioCapture'],
      ['background-sync', 'backgroundSync'],
      ['backgroundSync', 'backgroundSync'],
      ['background-fetch', 'backgroundFetch'],
      ['backgroundFetch', 'backgroundFetch'],
      ['flash', 'flash'],
      ['ambient-light-sensor', 'sensors'],
      ['sensors', 'sensors'],
      ['notifications', 'notifications'],
      ['protected-media-identifier', 'protectedMediaIdentifier'],
      ['protectedMediaIdentifier', 'protectedMediaIdentifier'],
      ['accelerometer', 'sensors'],
      ['gyroscope', 'sensors'],
      ['magnetometer', 'sensors'],
      ['accessibility-events', 'accessibilityEvents'],
      ['accessibilityEvents', 'accessibilityEvents'],
      ['clipboard-read', 'clipboardRead'],
      ['clipboardRead', 'clipboardRead'],
      ['clipboard-write', 'clipboardWrite'],
      ['clipboardWrite', 'clipboardWrite'],
      ['payment-handler', 'paymentHandler'],
      ['paymentHandler', 'paymentHandler'],
      ['idleDetection', 'idleDetection'],
      // chrome-specific permissions we have.
      ['midi-sysex', 'midiSysex']
    ])

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
   * @return {boolean}
   */
  isConnected () {
    return !this._connection._closed
  }

  /**
   * @return {?Object}
   */
  process () {
    return this._process
  }

  /**
   * Returns all known targets
   * @return {Array<Target>}
   */
  targets () {
    return Array.from(this._targets.values()).filter(
      target => target._isInitialized
    )
  }

  /**
   * Returns the target associated with the browser
   * @return {!Target}
   */
  target () {
    return this.targets().find(target => target.type() === 'browser')
  }

  /**
   * Returns the target associated with the supplied target id if we know about it
   * @param {string} targetId
   * @return {?Target}
   * @since chrome-remote-interface-extra
   */
  getTargetById (targetId) {
    return this._targets.get(targetId)
  }

  /**
   * Disconnect from the browser After calling disconnect, the {@link Browser} object is considered disposed
   * and cannot be used anymore
   */
  disconnect () {
    this._connection.dispose()
  }

  /**
   * Returns an array of all open browser contexts. In a newly created browser, this will return a single instance of {@link BrowserContext}
   * @return {Array<BrowserContext>}
   */
  browserContexts () {
    return [this._defaultContext, ...Array.from(this._contexts.values())]
  }

  /**
   * Returns the default browser context. The default browser context can not be closed
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
   * Closes the target specified by the targetId. If the target is a page that gets closed too.
   * Returns T/F to indicate if the command was successful
   * @param {string} targetId - The id of the target to be closed
   * @param {boolean} [throwOnError] - If true and the command was un-successful the caught error is thrown
   * @return {Promise<boolean>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Target#method-closeTarget
   * @since chrome-remote-interface-extra
   */
  closeTarget (targetId, throwOnError) {
    return closeTarget(this._connection, targetId, throwOnError)
  }

  /**
   * Returns version information
   * @return {Promise<{protocolVersion: string, product: string, revision: string, userAgent: string, jsVersion: string}>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Browser#method-getVersion
   * @since chrome-remote-interface-extra
   */
  versionInfo () {
    return this._connection.send('Browser.getVersion', {})
  }

  /**
   * Get Chrome histograms. EXPERIMENTAL
   * Optional options:
   *  - query: Requested substring in name. Only histograms which have query as a substring in their name are extracted.
   *    An empty or absent query returns all histograms.
   *  - delta: If true, retrieve delta since last call
   * @param {BrowserHistogramQuery} [options]
   * @return {Promise<Array<CDPHistogram>>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Browser#method-getHistograms
   * @since chrome-remote-interface-extra
   */
  getHistograms (options) {
    return this._connection.send('Browser.getHistograms', options || {})
  }

  /**
   * Get a Chrome histogram by name. EXPERIMENTAL
   * @param {string} name - Requested histogram name
   * @param {boolean} [delta] - If true, retrieve delta since last call
   * @return {Promise<CDPHistogram>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Browser#method-getHistogram
   * @since chrome-remote-interface-extra
   */
  getHistogram (name, delta) {
    assert(
      helper.isString(name),
      `The name param must be of type "String", received type ${typeof delta}`
    )
    if (delta != null) {
      assert(
        helper.isBoolean(delta),
        `The delta param must be of type "boolean", received type ${typeof delta}`
      )
    }
    return this._connection.send('Browser.getHistogram', { name, delta })
  }

  /**
   * Get position and size of the browser window. EXPERIMENTAL
   * @param {number} windowId
   * @return {Promise<WindowBounds>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Browser#method-getWindowBounds
   * @since chrome-remote-interface-extra
   */
  getWindowBounds (windowId) {
    return getWindowBounds(this._connection, windowId)
  }

  /**
   * Get the browser window that contains the target. EXPERIMENTAL
   * @param {string} [targetId] - Optional target id of the target to receive the window id and its bound for.
   * If called as a part of the session, associated targetId is used.
   * @return {Promise<{bounds: WindowBounds, windowId: number}>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Browser#method-getWindowForTarget
   * @since chrome-remote-interface-extra
   */
  getWindowForTarget (targetId) {
    return getWindowForTarget(this._connection, targetId)
  }

  /**
   * Set position and/or size of the browser window. EXPERIMENTAL
   * @param {number} windowId - An browser window id
   * @param {WindowBounds} bounds - New window bounds. The 'minimized', 'maximized' and 'fullscreen' states cannot be combined with 'left', 'top', 'width' or 'height'. Leaves unspecified fields unchanged.
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Browser#method-setWindowBounds
   * @since chrome-remote-interface-extra
   */
  async setWindowBounds (windowId, bounds) {
    await setWindowBounds(this._connection, windowId, bounds)
  }

  /**
   * Grant specific permissions to the given origin and reject all others. EXPERIMENTAL
   * @param {string} origin - The origin these permissions will be granted for
   * @param {Array<string>} permissions - Array of permission overrides
   * @param {string} [browserContextId] - BrowserContext to override permissions. When omitted, default browser context is used
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Browser#method-grantPermissions
   */
  async grantPermissions (origin, permissions, browserContextId) {
    const actualPermissions = permissions.map(permission => {
      const protocolPermission = this._webPermissionToProtocol.get(permission)
      if (!protocolPermission) {
        throw new Error('Unknown permission: ' + permission)
      }
      return protocolPermission
    })
    await this._connection.send('Browser.grantPermissions', {
      origin,
      browserContextId: browserContextId || undefined,
      permissions: actualPermissions
    })
  }

  /**
   * Reset all permission management for all origins. EXPERIMENTAL
   * @param {string} [browserContextId] - BrowserContext to reset permissions. When omitted, default browser context is used.
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Browser#method-resetPermissions
   */
  async resetPermissions (browserContextId) {
    await this._connection.send('Browser.resetPermissions', {
      browserContextId: browserContextId || undefined
    })
  }

  /**
   * Returns all browser contexts created with Target.createBrowserContext method. EXPERIMENTAL
   * @return {Promise<Array<string>>} An array of browser context ids
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Target/#method-getBrowserContexts
   * @since chrome-remote-interface-extra
   */
  async listBrowserContexts () {
    const { browserContextIds } = await this._connection.send(
      'Target.getBrowserContexts',
      {}
    )
    return browserContextIds
  }

  /**
   * Retrieves a list of available targets
   * @return {Promise<Array<CDPTargetInfo>>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Target#method-getTargets
   * @since chrome-remote-interface-extra
   */
  async listTargets () {
    const { targetInfos } = await this._connection.send('Target.getTargets')
    return targetInfos
  }

  /**
   * This searches for a target in all browser contexts
   * @param {function(target: Target):boolean} predicate
   * @param {{timeout?: number}} [options = {}]
   * @return {Promise<Target>}
   * @example
   * // finding a target for a page opened via window.open
   * await page.evaluate(() => window.open('https://www.example.com/'))
   * const newWindowTarget = await browser.waitForTarget(target => target.url() === 'https://www.example.com/')
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
   * Creates a new incognito browser context. This won't share cookies/cache with other browser contexts
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
   * An array of all pages inside the {@link Browser}. In case of multiple browser contexts, the method will return
   * an array with all the pages in all browser contexts
   * @return {Promise<Array<Page>>}
   */
  async pages () {
    const contextPages = await Promise.all(
      this.browserContexts().map(context => context.pages())
    )
    if (contextPages.flat) {
      return contextPages.flat(Infinity)
    }
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

  /**
   * Closes all of its pages (if any were opened) and the Browser object itself is considered to be
   * disposed and cannot be used anymore
   * @return {Promise<void>}
   */
  async close () {
    await this._closeCallback.call(null)
    this.disconnect()
  }

  /**
   * Promise which resolves to a new {@link Page} object. The {@link Page} is created in a default browser context
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

    const target = new Target({
      targetInfo,
      browserContext: context,
      sessionFactory: () => this._connection.createSession(targetInfo),
      pageOpts: {
        ignoreHTTPSErrors: this._ignoreHTTPSErrors,
        defaultViewport: this._defaultViewport,
        screenshotTaskQueue: this._screenshotTaskQueue,
        additionalDomains: this._additionalDomains
      }
    })
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

  /**
   * @return {string}
   */
  toString () {
    return util.inspect(this, { depth: null })
  }

  /**
   * @return {Object}
   */
  toJSON () {
    return {
      defaultContext: this._defaultContext,
      contexts: this._contexts,
      targets: this._targets,
      ignoreHTTPSErrors: this._ignoreHTTPSErrors,
      defaultViewport: this._defaultViewport
    }
  }

  /** @ignore */
  // eslint-disable-next-line space-before-function-paren
  [util.inspect.custom](depth, options) {
    if (depth < 0) {
      return options.stylize('[Browser]', 'special')
    }

    const newOptions = Object.assign({}, options, {
      depth: options.depth == null ? null : options.depth - 1
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

module.exports = Browser
