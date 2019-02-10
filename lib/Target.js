const { Events } = require('./Events')
const { Page } = require('./Page')

class Target {
  /**
   * @param {!Object} targetInfo
   * @param {!BrowserContext} browserContext
   * @param {!function():!Promise<!CDPSession>} sessionFactory
   * @param {?{ignoreHTTPSErrors: ?boolean, defaultViewPort: ?Object, screenshotTaskQueue: ?TaskQueue,  additionalDomains: ?ExtraDomainsConfig}} [pageOpts]
   */
  constructor (targetInfo, browserContext, sessionFactory, pageOpts = {}) {
    this._targetInfo = targetInfo
    this._browserContext = browserContext
    this._targetId = targetInfo.targetId
    this._sessionFactory = sessionFactory
    this._pageOpts = pageOpts
    /** @type {?Promise<!Page>} */
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
   * @return {!Promise<!CDPSession>}
   */
  createCDPSession () {
    return this._sessionFactory()
  }

  /**
   * @return {!Promise<?Page>}
   */
  async page () {
    if (
      (this._targetInfo.type === 'page' ||
        this._targetInfo.type === 'background_page') &&
      !this._pagePromise
    ) {
      this._pagePromise = this._sessionFactory().then(client =>
        Page.create(
          client,
          this._ignoreHTTPSErrors,
          Object.assign(this._pageOpts, { target: this })
        )
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
}

module.exports = { Target }
