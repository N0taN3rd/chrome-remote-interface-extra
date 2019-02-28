const util = require('util')
const Events = require('./Events')
const Page = require('./page/Page')

class Target {
  /**
   * @param {!Object} targetInfo
   * @param {!BrowserContext} browserContext
   * @param {!function():Promise<CDPSession>} sessionFactory
   * @param {?{ignoreHTTPSErrors: ?boolean, defaultViewPort: ?Object, screenshotTaskQueue: ?TaskQueue,  additionalDomains: ?ExtraDomainsConfig}} [pageOpts]
   */
  constructor (targetInfo, browserContext, sessionFactory, pageOpts = {}) {
    /**
     * @type {!Object}
     * @private
     */
    this._targetInfo = targetInfo

    /**
     * @type {!BrowserContext}
     * @private
     */
    this._browserContext = browserContext

    /**
     * @type {string}
     * @private
     */
    this._targetId = targetInfo.targetId

    /**
     * @type {function(): Promise<CDPSession>}
     * @private
     */
    this._sessionFactory = sessionFactory

    /**
     * @type {?{ignoreHTTPSErrors: ?boolean, defaultViewPort: ?Object, screenshotTaskQueue: ?TaskQueue, additionalDomains: ?ExtraDomainsConfig}}
     * @private
     */
    this._pageOpts = pageOpts
    /** @type {?Promise<Page>} */
    this._pagePromise = null
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
    this._isClosedPromise = new Promise(
      resolve => (this._closedCallback = resolve)
    )
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
   * @return {Promise<CDPSession>}
   */
  createCDPSession () {
    return this._sessionFactory()
  }

  /**
   * @desc Inject object to the target's main frame that provides a communication channel with browser target.
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
    await this._browserContext._connection.send(
      'Target.exposeDevToolsProtocol',
      {
        targetId: this._targetInfo.targetId,
        bindingName: bindingName || undefined
      }
    )
  }

  /**
   * @return {Promise<?Page>}
   */
  async page () {
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
   * @return {!Browser}
   */
  browser () {
    return this._browserContext.browser()
  }

  /**
   * @return {!BrowserContext}
   */
  browserContext () {
    return this._browserContext
  }

  /**
   * @return {?Target}
   */
  opener () {
    const { openerId } = this._targetInfo
    if (!openerId) return null
    return this.browser()._targets.get(openerId)
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
   * @return {!Object}
   */
  toJSON () {
    return this._targetInfo
  }

  // eslint-disable-next-line space-before-function-paren
  [util.inspect.custom](depth, options) {
    if (depth < 0) {
      return options.stylize('[Target]', 'special')
    }

    const newOptions = Object.assign({}, options, {
      depth: options.depth === null ? null : options.depth - 1
    })
    const inner = util.inspect(this._targetInfo, newOptions)
    return `${options.stylize('Target', 'special')} ${inner}`
  }
}

/**
 * @type {Target}
 */
module.exports = Target
