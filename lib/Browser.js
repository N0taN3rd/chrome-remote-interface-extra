const EventEmitter = require('eventemitter3')
const { helper, assert } = require('./helper')
const { Target } = require('./Target')
const { TaskQueue } = require('./TaskQueue')
const { Events } = require('./Events')
const {
  adaptChromeRemoteInterfaceClient,
  CRIConnection
} = require('./CRIConnectionAdaptor.js')

async function dummyCloseCB () {}

/**
 * @typedef {Object} BrowserInitOptions
 * @property {?Array<string>} contextIds
 * @property {?boolean} ignoreHTTPSErrors
 * @property {?Object} defaultViewport
 * @property {?(function():Promise)} closeCallback
 * @property {?ExtraDomainsConfig} additionalDomains
 */

class Browser extends EventEmitter {
  /**
   * @param {Chrome|CRIConnection|Object} connection
   * @param {?BrowserInitOptions} [initOpts = {}]
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
      additionalDomains
    }
  ) {
    super()
    this._ignoreHTTPSErrors = ignoreHTTPSErrors
    this._defaultViewport = defaultViewport
    this._process = process
    this._screenshotTaskQueue = new TaskQueue()
    this._connection = connection
    this._closeCallback = closeCallback || dummyCloseCB
    this._additionalDomains = additionalDomains

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
   * @return {!Promise<!BrowserContext>}
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
   * @return {!Array<!BrowserContext>}
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
  wsEndpoint () {
    return this._connection.webSocketUrl
  }

  /**
   * @return {!Promise<!Page>}
   */
  async newPage () {
    return this._defaultContext.newPage()
  }

  /**
   * @param {?string} contextId
   * @return {!Promise<!Page>}
   */
  async _createPageInContext (contextId) {
    const { targetId } = await this._connection.send('Target.createTarget', {
      url: 'about:blank',
      browserContextId: contextId || undefined
    })
    const target = await this._targets.get(targetId)
    assert(await target._initializedPromise, 'Failed to create target for page')
    const page = await target.page()
    return page
  }

  /**
   * @return {!Array<!Target>}
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
   * @param {function(!Target):boolean} predicate
   * @param {{timeout?: number}=} options
   * @return {!Promise<!Target>}
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
   * @return {!Promise<!Array<!Page>>}
   */
  async pages () {
    const contextPages = await Promise.all(
      this.browserContexts().map(context => context.pages())
    )
    // Flatten array.
    return contextPages.reduce((acc, x) => acc.concat(x), [])
  }

  /**
   * @return {!Promise<string>}
   */
  async version () {
    const version = await this._getVersion()
    return version.product
  }

  /**
   * @return {!Promise<string>}
   */
  async userAgent () {
    const version = await this._getVersion()
    return version.userAgent
  }

  async close () {
    await this._closeCallback.call(null)
    this.disconnect()
  }

  disconnect () {
    this._connection.dispose()
  }

  /**
   * @return {!Promise<!Object>}
   */
  _getVersion () {
    return this._connection.send('Browser.getVersion')
  }
}

class BrowserContext extends EventEmitter {
  /**
   * @param {!Object} connection
   * @param {!Browser} browser
   * @param {?string} contextId
   */
  constructor (connection, browser, contextId) {
    super()
    this._connection = connection
    this._browser = browser
    this._id = contextId
  }

  /**
   * @return {!Array<!Target>} target
   */
  targets () {
    return this._browser
      .targets()
      .filter(target => target.browserContext() === this)
  }

  /**
   * @param {function(!Target):boolean} predicate
   * @param {{timeout?: number}=} options
   * @return {!Promise<!Target>}
   */
  waitForTarget (predicate, options) {
    return this._browser.waitForTarget(
      target => target.browserContext() === this && predicate(target),
      options
    )
  }

  /**
   * @return {!Promise<!Array<!Page>>}
   */
  async pages () {
    const pages = await Promise.all(
      this.targets()
        .filter(target => target.type() === 'page')
        .map(target => target.page())
    )
    return pages.filter(page => !!page)
  }

  /**
   * @return {boolean}
   */
  isIncognito () {
    return !!this._id
  }

  /**
   * @param {string} origin
   * @param {!Array<string>} permissions
   */
  async overridePermissions (origin, permissions) {
    const webPermissionToProtocol = new Map([
      ['geolocation', 'geolocation'],
      ['midi', 'midi'],
      ['notifications', 'notifications'],
      ['push', 'push'],
      ['camera', 'videoCapture'],
      ['microphone', 'audioCapture'],
      ['background-sync', 'backgroundSync'],
      ['ambient-light-sensor', 'sensors'],
      ['accelerometer', 'sensors'],
      ['gyroscope', 'sensors'],
      ['magnetometer', 'sensors'],
      ['accessibility-events', 'accessibilityEvents'],
      ['clipboard-read', 'clipboardRead'],
      ['clipboard-write', 'clipboardWrite'],
      ['payment-handler', 'paymentHandler'],
      // chrome-specific permissions we have.
      ['midi-sysex', 'midiSysex']
    ])
    permissions = permissions.map(permission => {
      const protocolPermission = webPermissionToProtocol.get(permission)
      if (!protocolPermission) {
        throw new Error('Unknown permission: ' + permission)
      }
      return protocolPermission
    })
    await this._connection.send('Browser.grantPermissions', {
      origin,
      browserContextId: this._id || undefined,
      permissions
    })
  }

  async clearPermissionOverrides () {
    await this._connection.send('Browser.resetPermissions', {
      browserContextId: this._id || undefined
    })
  }

  /**
   * @return {!Promise<!Page>}
   */
  newPage () {
    return this._browser._createPageInContext(this._id)
  }

  /**
   * @return {!Browser}
   */
  browser () {
    return this._browser
  }

  async close () {
    assert(this._id, 'Non-incognito profiles cannot be closed!')
    await this._browser._disposeContext(this._id)
  }
}

module.exports = { Browser, BrowserContext }
