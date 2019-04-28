const util = require('util')
const Events = require('./Events')
const Page = require('./page/Page')
const { helper } = require('./helper')
const CRIExtra = require('./chromeRemoteInterfaceExtra')
/** @ignore */
const {
  closeTarget,
  exposeCDPOnTarget,
  getWindowForTarget,
  setWindowBounds
} = require('./__shared')

/**
 * @typedef {Object} TargetInit
 * @property {Object} targetInfo
 * @property {?BrowserContext} [browserContext]
 * @property {?function():Promise<CDPSession>} [sessionFactory]
 * @property {?PageInitOptions} [pageOpts]
 * @property {Chrome|CDPSession|CRIConnection} [client]
 */

/**
 * @see https://chromedevtools.github.io/devtools-protocol/tot/Target
 */
class Target {
  /**
   *
   * @param opts
   * @return {Promise<Page>}
   */
  static async connectToPageTarget (opts = {}) {
    const client = await CRIExtra(opts.connect)
    const targetList = await CRIExtra.List()
    let targetInfo
    for (let i = 0; i < targetList.length; i++) {
      const target = targetList[i]
      if (target.webSocketDebuggerUrl === client.webSocketUrl) {
        targetInfo = target
        break
      }
    }

    if (targetInfo) {
      targetInfo.targetId = targetInfo.id
      const target = new Target({
        targetInfo,
        client,
        pageOpts: opts.pageOpts,
        sessionFactory: () => client.createSession(targetInfo)
      })

      await target._initializedPromise
      target._pagePromise = Promise.resolve(
        Page.create(client, Object.assign({ target: target }, target._pageOpts))
      )
      return target.page()
    }
    console.warn('Could not match the connections WS URL to an existing target')
    return Page.create(client, opts.pageOpts)
  }

  /**
   * @param {!TargetInit} targetInit
   */
  constructor ({
    targetInfo,
    browserContext,
    sessionFactory,
    pageOpts,
    client
  }) {
    /**
     * @type {!Object}
     * @private
     */
    this._targetInfo = targetInfo

    /**
     * @type {?BrowserContext}
     * @private
     */
    this._browserContext = browserContext

    /**
     * @type {Chrome|CDPSession|CRIConnection|undefined}
     */
    this._client = client

    /**
     * @type {string}
     * @private
     */
    this._targetId = targetInfo.targetId

    /**
     * @type {function(): Promise<CDPSession>}
     * @private
     */
    this._sessionFactory = sessionFactory || this.__sessionFactory.bind(this)

    /**
     * @ignore
     * @type {?Array<{emitter: !EventEmitter, eventName: (string|symbol), handler: function(*)}>}
     * @private
     */
    this.__eventListeners = null
    if (!this._browserContext) {
      this.__eventListeners = [
        helper.addEventListener(
          this._client,
          'Target.targetInfoChanged',
          this.__onTargetInfoChanged
        ),
        helper.addEventListener(
          this._client,
          'Target.targetDestroyed',
          this.__onTargetDestroyed
        )
      ]
    }

    /**
     * @type {PageInitOptions}
     * @private
     */
    this._pageOpts = pageOpts || {}
    /** @type {?Promise<Page>} */
    this._pagePromise = null
    /** @type {Promise<boolean>} */
    this._initializedPromise = new Promise(
      resolve => (this._initializedCallback = resolve)
    ).then(async success => {
      if (!success) return false
      const opener = this.opener()
      if (!opener || !opener._pagePromise || this.type() !== 'page') return true
      const openerPage = await opener._pagePromise
      if (!openerPage.listenerCount(Events.Page.Popup)) return true
      const popupPage = await this.page()
      openerPage.emit(Events.Page.Popup, popupPage)
      return true
    })
    /** @type {Promise<*>} */
    this._isClosedPromise = new Promise(
      resolve => (this._closedCallback = resolve)
    )
    /** @type {boolean} */
    this._isInitialized =
      this._targetInfo.type !== 'page' || this._targetInfo.url !== ''
    if (this._isInitialized) this._initializedCallback(true)
  }

  /**
   * @return {string}
   */
  id () {
    return this._targetInfo.targetId
  }

  /**
   * @return {string}
   */
  url () {
    return this._targetInfo.url
  }

  /**
   * @return {"page"|"background_page"|"service_worker"|"other"|"browser"}
   */
  type () {
    const type = this._targetInfo.type
    if (
      type === 'page' ||
      type === 'background_page' ||
      type === 'service_worker' ||
      type === 'browser'
    ) {
      return type
    }
    return 'other'
  }

  /**
   * @return {?string}
   */
  openerId () {
    return this._targetInfo.openerId
  }

  /**
   * @return {Promise<CDPSession>}
   */
  createCDPSession () {
    return this._sessionFactory()
  }

  /**
   * Returns T/F indicating if the target is for a page
   * @return {boolean}
   */
  isPageTarget () {
    if (this._targetInfo) return this._targetInfo.type === 'page'
    return false
  }

  /**
   * Returns T/F indicating if the target is for a background page
   * @return {boolean}
   */
  isBackgroundPageTarget () {
    if (this._targetInfo) return this._targetInfo.type === 'background_page'
    return false
  }

  /**
   * Returns T/F indicating if the target is for a browser
   * @return {boolean}
   */
  isBrowserTarget () {
    if (this._targetInfo) return this._targetInfo.type === 'browser'
    return false
  }

  /**
   * Returns T/F indicating if the target is for a service worker
   * @return {boolean}
   */
  isServiceWorkerTarget () {
    if (this._targetInfo) return this._targetInfo.type === 'service_worker'
    return false
  }

  /**
   * @return {?Browser}
   */
  browser () {
    if (!this._browserContext) return null
    return this._browserContext.browser()
  }

  /**
   * @return {?BrowserContext}
   */
  browserContext () {
    if (!this._browserContext) return null
    return this._browserContext
  }

  /**
   * @return {?Target}
   */
  opener () {
    const { openerId } = this._targetInfo
    if (!openerId) return null
    const browser = this.browser()
    if (browser) return browser.getTargetById(openerId)
    return null
  }

  /**
   * @return {Promise<Page|undefined>}
   */
  page () {
    if (
      (this._targetInfo.type === 'page' ||
        this._targetInfo.type === 'background_page') &&
      !this._pagePromise
    ) {
      this._pagePromise = this._sessionFactory().then(client =>
        Page.create(client, Object.assign({ target: this }, this._pageOpts))
      )
    }
    return this._pagePromise
  }

  /**
   * Closes the target. If the target is a page that gets closed too.
   * @return {Promise<boolean>}
   */
  close () {
    if (this._browserContext) {
      return this._browserContext.closeTarget(this._targetInfo.targetId)
    }
    return closeTarget(this._client, this._targetInfo.targetId)
  }

  /**
   * Get the browser window id and bounds for this target
   * @return {Promise<{bounds: WindowBounds, windowId: number}>}
   */
  getWindowBounds () {
    if (this._browserContext) {
      return this._browserContext.getWindowForTarget(this._targetInfo.targetId)
    }
    return getWindowForTarget(this._client, this._targetInfo.targetId)
  }

  /**
   * Set position and/or size of the browser window. EXPERIMENTAL
   * @param {number} windowId - An browser window id
   * @param {WindowBounds} bounds - New window bounds. The 'minimized', 'maximized' and 'fullscreen' states cannot be combined with 'left', 'top', 'width' or 'height'. Leaves unspecified fields unchanged.
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Browser#method-setWindowBounds
   */
  async setWindowBounds (windowId, bounds) {
    if (this._browserContext) {
      await this._browserContext.setWindowBounds(windowId, bounds)
    }
    await setWindowBounds(this._client, windowId, bounds)
  }

  /**
   * Inject object to the target's main frame that provides a communication channel with browser target.
   *
   * Injected object will be available as window[bindingName].
   *
   * The object has the following API:
   *  * binding.send(json) - a method to send messages over the remote debugging protocol
   *  * binding.onmessage = json => handleMessage(json) - a callback that will be called for the protocol notifications and command responses.
   *
   * EXPERIMENTAL
   * @param {string} [bindingName] - Binding name, 'cdp' if not specified
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Target#method-exposeDevToolsProtocol
   */
  async exposeDevToolsProtocol (bindingName) {
    if (this._browserContext) {
      await this._browserContext.exposeCDPOnTarget(
        this._targetInfo.targetId,
        bindingName || undefined
      )
      return
    }
    await exposeCDPOnTarget(
      this._client,
      this._targetInfo.targetId,
      bindingName
    )
  }

  /**
   * @return {Object}
   */
  toJSON () {
    return this._targetInfo
  }

  /**
   * @param {!Object} targetInfo
   */
  _targetInfoChanged (targetInfo) {
    this._targetInfo = targetInfo

    if (
      !this._isInitialized &&
      (this._targetInfo.type !== 'page' || this._targetInfo.url !== '')
    ) {
      this._isInitialized = true
      this._initializedCallback(true)
    }
  }

  /**
   * @ignore
   * @param {!Object} event
   */
  __onTargetInfoChanged (event) {
    if (event.targetInfo.targetId === this._targetInfo.targetId) {
      this._targetInfoChanged(event.targetInfo)
    }
  }

  /**
   * @ignore
   * @param {!Object} event
   */
  __onTargetDestroyed (event) {
    if (event.targetInfo.targetId === this._targetInfo.targetId) {
      this._initializedCallback(false)
      this._closedCallback()
      helper.removeEventListeners(this.__eventListeners)
    }
  }

  /**
   * @ignore
   * @return {Promise<CDPSession>|MSMediaKeySession|MediaKeySession}
   * @private
   */
  __sessionFactory () {
    return this._client.createSession(this._targetInfo)
  }

  /** @ignore */
  // eslint-disable-next-line space-before-function-paren
  [util.inspect.custom](depth, options) {
    if (depth < 0) {
      return options.stylize('[Target]', 'special')
    }

    const newOptions = Object.assign({}, options, {
      depth: options.depth == null ? null : options.depth - 1
    })
    const inner = util.inspect(this._targetInfo, newOptions)
    return `${options.stylize('Target', 'special')} ${inner}`
  }
}

module.exports = Target
