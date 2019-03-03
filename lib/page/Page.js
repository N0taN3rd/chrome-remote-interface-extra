const util = require('util')
const fs = require('fs-extra')
const EventEmitter = require('eventemitter3')
const mime = require('mime')
const ConsoleMessage = require('./ConsoleMessage')
const Dialog = require('../Dialog')
const EmulationManager = require('../EmulationManager')
const Events = require('../Events')
const TimeoutSettings = require('../TimeoutSettings')
const Tracing = require('../Tracing')
const Worker = require('../Worker')
const { Accessibility } = require('../accessibility')
const { CRIConnection } = require('../connection')
const { Cookie, NetworkManager } = require('../network')
const { Coverage } = require('../coverage')
const { FrameManager } = require('../frames')
const { Keyboard, Mouse, Touchscreen } = require('../input')
const { TaskQueue } = require('../TaskQueue')
const { createJSHandle } = require('../JSHandle')
const { helper, debugError, assert } = require('../helper')
const { ensureCookie } = require('../__shared')

/**
 * @typedef {Object} ExtraDomainsConfig
 * @property {?boolean} [workers = false]
 * @property {?boolean} [coverage = false]
 * @property {?boolean} [console = false]
 * @property {?boolean} [log = false]
 * @property {?boolean} [performance = false]
 * @property {?boolean} [security = false]
 */

/**
 * @typedef {Object} PageInitOptions
 * @property {boolean} [ignoreHTTPSErrors]
 * @property {?Target} [target]
 * @property {?Object} [defaultViewPort]
 * @property {?TaskQueue} [screenshotTaskQueue]
 * @property {?ExtraDomainsConfig} [additionalDomains]
 */

/**
 * @type {ExtraDomainsConfig}
 */
const DefaultEnabledOptions = {
  workers: false,
  coverage: false,
  console: false,
  log: false,
  performance: false
}

class Page extends EventEmitter {
  /**
   * @param {CDPSession|CRIConnection|Chrome|Object} client
   * @param {PageInitOptions} [optionals]
   * @return {Promise<Page>}
   */
  static async create (client, optionals = {}) {
    await client.send('Page.enable')
    const { frameTree } = await client.send('Page.getFrameTree')
    const {
      target,
      defaultViewport,
      screenshotTaskQueue = new TaskQueue(),
      additionalDomains,
      ignoreHTTPSErrors
    } = optionals
    /**
     * @type {ExtraDomainsConfig}
     */
    const enableExtraDomains = Object.assign(
      {},
      DefaultEnabledOptions,
      additionalDomains
    )
    const page = new Page(client, frameTree, {
      target,
      ignoreHTTPSErrors,
      screenshotTaskQueue,
      additionalDomains: enableExtraDomains
    })
    const promises = [
      client.send('Page.setLifecycleEventsEnabled', { enabled: true }),
      client.send('Network.enable', {}),
      client
        .send('Runtime.enable', {})
        .then(() => page._frameManager.ensureSecondaryDOMWorld())
    ]
    if (enableExtraDomains.workers) {
      promises.push(
        client.send('Target.setAutoAttach', {
          autoAttach: true,
          waitForDebuggerOnStart: false,
          flatten: true
        })
      )
    }
    if (enableExtraDomains.log) {
      promises.push(client.send('Log.enable', {}))
    }
    if (enableExtraDomains.security || ignoreHTTPSErrors) {
      promises.push(client.send('Security.enable', {}))
    }
    if (enableExtraDomains.performance) {
      promises.push(client.send('Performance.enable', {}))
    }
    await Promise.all(promises)
    if (ignoreHTTPSErrors) {
      await client.send('Security.setOverrideCertificateErrors', {
        override: true
      })
    }
    // Initialize default page size.
    if (defaultViewport) await page.setViewport(defaultViewport)
    return page
  }

  /**
   * @param {Chrome|CRIConnection|CDPSession|Object} client
   * @param {!Object} frameTree
   * @param {PageInitOptions} initOpts
   */
  constructor (client, frameTree, initOpts) {
    super()
    this._closed = false
    /** @type {Chrome|CRIConnection|CDPSession|Object} */
    this._client = client
    /** @type {?Target} */
    this._target = initOpts.target
    /** @type {?string} */
    this._targetId = null
    this._keyboard = new Keyboard(client)
    this._mouse = new Mouse(client, this._keyboard)
    this._timeoutSettings = new TimeoutSettings()
    this._touchscreen = new Touchscreen(client, this._keyboard)
    this._accessibility = new Accessibility(client)
    /** @type {!NetworkManager} */
    this._networkManager = new NetworkManager(client)
    /** @type {!FrameManager} */
    this._frameManager = new FrameManager(
      client,
      frameTree,
      this._timeoutSettings,
      this._networkManager,
      this
    )
    this._networkManager.setFrameManager(this._frameManager)
    this._emulationManager = new EmulationManager(client)
    this._tracing = new Tracing(client)
    /** @type {!Map<string, Function>} */
    this._pageBindings = new Map()
    this._ignoreHTTPSErrors = initOpts.ignoreHTTPSErrors
    this._coverage = new Coverage(client)
    this._javascriptEnabled = true
    /** @type {?Viewport} */
    this._viewport = null

    this._screenshotTaskQueue = initOpts.screenshotTaskQueue || new TaskQueue()

    this._additionalDomains = initOpts.additionalDomains

    /** @type {!Map<string, Worker>} */
    this._workers = new Map()
    this._onAttachedToTarget = this._onAttachedToTarget.bind(this)
    this._onDetachedFromTarget = this._onDetachedFromTarget.bind(this)
    if (this._additionalDomains.workers) {
      this._client.on('Target.attachedToTarget', this._onAttachedToTarget)
      this._client.on('Target.detachedFromTarget', this._onDetachedFromTarget)
    }
    this._frameManager.on(Events.FrameManager.FrameAttached, event =>
      this.emit(Events.Page.FrameAttached, event)
    )
    this._frameManager.on(Events.FrameManager.FrameDetached, event =>
      this.emit(Events.Page.FrameDetached, event)
    )
    this._frameManager.on(Events.FrameManager.FrameNavigated, event =>
      this.emit(Events.Page.FrameNavigated, event)
    )

    this._networkManager.on(Events.NetworkManager.Request, event =>
      this.emit(Events.Page.Request, event)
    )
    this._networkManager.on(Events.NetworkManager.Response, event =>
      this.emit(Events.Page.Response, event)
    )
    this._networkManager.on(Events.NetworkManager.RequestFailed, event =>
      this.emit(Events.Page.RequestFailed, event)
    )
    this._networkManager.on(Events.NetworkManager.RequestFinished, event =>
      this.emit(Events.Page.RequestFinished, event)
    )

    client.on('Page.domContentEventFired', event =>
      this.emit(Events.Page.DOMContentLoaded, event.timestamp)
    )
    client.on('Page.loadEventFired', event =>
      this.emit(Events.Page.Load, event.timestamp)
    )
    client.on('Runtime.consoleAPICalled', event => this._onConsoleAPI(event))
    client.on('Runtime.bindingCalled', event => this._onBindingCalled(event))
    client.on('Page.javascriptDialogOpening', event => this._onDialog(event))
    client.on('Runtime.exceptionThrown', exception =>
      this._handleException(exception.exceptionDetails)
    )
    client.on('Security.certificateError', event =>
      this._onCertificateError(event)
    )
    client.on('Inspector.targetCrashed', () => this._onTargetCrashed())
    client.on('Performance.metrics', event => this._emitMetrics(event))
    client.on('Log.entryAdded', event => this._onLogEntryAdded(event))
    if (this._target) {
      this._target._isClosedPromise.then(() => {
        this.emit(Events.Page.Close)
        this._closed = true
      })
    } else {
      this._client.on(this._client.$$disconnectEvent, () => {
        this.emit(Events.Page.Close)
        this._closed = true
      })
    }
  }

  /**
   * @return {NetworkManager}
   */
  get networkManager () {
    return this._networkManager
  }

  /**
   * @return {!FrameManager}
   */
  get frameManager () {
    return this._frameManager
  }

  /**
   * @return {boolean}
   */
  get javascriptEnabled () {
    return this._javascriptEnabled
  }

  /**
   * @return {!Keyboard}
   */
  get keyboard () {
    return this._keyboard
  }

  /**
   * @return {!Touchscreen}
   */
  get touchscreen () {
    return this._touchscreen
  }

  /**
   * @return {!Coverage}
   */
  get coverage () {
    return this._coverage
  }

  /**
   * @return {!Tracing}
   */
  get tracing () {
    return this._tracing
  }

  /**
   * @return {!Accessibility}
   */
  get accessibility () {
    return this._accessibility
  }

  /**
   * @return {!Mouse}
   */
  get mouse () {
    return this._mouse
  }

  /**
   * @return {?Target}
   */
  target () {
    return this._target
  }

  /**
   * @return {?Browser}
   */
  browser () {
    if (this._target) {
      return this._target.browser()
    }
    return null
  }

  /**
   * @return {?BrowserContext}
   */
  browserContext () {
    if (this._target) {
      return this._target.browserContext()
    }
    return null
  }

  /**
   * @return {!Frame}
   */
  mainFrame () {
    return this._frameManager.mainFrame()
  }

  /**
   * @return {Array<Frame>}
   */
  frames () {
    return this._frameManager.frames()
  }

  /**
   * @return {Array<Worker>}
   */
  workers () {
    return Array.from(this._workers.values())
  }

  /**
   * @return {!string}
   */
  url () {
    return this.mainFrame().url()
  }

  /**
   * @return {Promise<string>}
   */
  content () {
    return this._frameManager.mainFrame().content()
  }

  /**
   * @return {Promise<string>}
   */
  title () {
    return this.mainFrame().title()
  }

  /**
   * @return {?Viewport}
   */
  viewport () {
    return this._viewport
  }

  /**
   * @return {boolean}
   */
  isClosed () {
    return this._closed
  }

  /**
   * @param {Function|string} pageFunction
   * @param {...*} args
   * @return {Promise<*>}
   */
  evaluate (pageFunction, ...args) {
    return this._frameManager.mainFrame().evaluate(pageFunction, ...args)
  }

  /**
   * @param {string} selector
   * @param {!{delay?: number, button?: "left"|"right"|"middle", clickCount?: number}=} options
   */
  click (selector, options = {}) {
    return this.mainFrame().click(selector, options)
  }

  /**
   * @param {string} selector
   */
  focus (selector) {
    return this.mainFrame().focus(selector)
  }

  /**
   * @param {string} selector
   */
  hover (selector) {
    return this.mainFrame().hover(selector)
  }

  /**
   * @param {string} selector
   * @param {...string} values
   * @return {Promise<Array<string>>}
   */
  select (selector, ...values) {
    return this.mainFrame().select(selector, ...values)
  }

  /**
   * @param {string} selector
   */
  tap (selector) {
    return this.mainFrame().tap(selector)
  }

  /**
   * @param {string} selector
   * @param {string} text
   * @param {{delay: (number|undefined)}=} options
   */
  type (selector, text, options) {
    return this.mainFrame().type(selector, text, options)
  }

  /**
   * @param {(string|number|Function)} selectorOrFunctionOrTimeout
   * @param {!Object=} options
   * @param {...*} args
   * @return {Promise<JSHandle>}
   */
  waitFor (selectorOrFunctionOrTimeout, options = {}, ...args) {
    return this.mainFrame().waitFor(
      selectorOrFunctionOrTimeout,
      options,
      ...args
    )
  }

  /**
   * @param {string} selector
   * @param {!{visible?: boolean, hidden?: boolean, timeout?: number}=} options
   * @return {Promise<ElementHandle|undefined>}
   */
  waitForSelector (selector, options = {}) {
    return this.mainFrame().waitForSelector(selector, options)
  }

  /**
   * @param {string} xpath
   * @param {!{visible?: boolean, hidden?: boolean, timeout?: number}=} options
   * @return {Promise<ElementHandle|undefined>}
   */
  waitForXPath (xpath, options = {}) {
    return this.mainFrame().waitForXPath(xpath, options)
  }

  /**
   * @param {Function} pageFunction
   * @param {!{polling?: string|number, timeout?: number}=} options
   * @param {...*} args
   * @return {Promise<JSHandle>}
   */
  waitForFunction (pageFunction, options = {}, ...args) {
    return this.mainFrame().waitForFunction(pageFunction, options, ...args)
  }

  /**
   * @desc Returns metrics relating to the layouting of the page, such as viewport bounds/scale
   * @return {Promise<{layoutViewport: Object, visualViewport: Object, contentSize: Object}>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Page#method-getLayoutMetrics
   */
  getLayoutMetrics () {
    return this._client.send('Page.getLayoutMetrics')
  }

  /**
   * @return {Promise<?{currentIndex: number, entries: Array<Object>}>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Page#method-getNavigationHistory
   */
  getNavigationHistory () {
    return this._client.send('Page.getNavigationHistory')
  }

  /**
   * @param {string} frameId
   * @param {string} url
   * @return {Promise<Buffer>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Page#method-getResourceContent
   */
  getResourceContent (frameId, url) {
    return this._frameManager.getFrameResourceContent(frameId, url)
  }

  /**
   * @return {Promise<FrameResourceTree>}
   */
  getResourceTree () {
    return this._frameManager.getResourceTree()
  }

  /**
   * @return {Promise<?{url: string, errors: Array<Object>, data: ?string}>}
   */
  getAppManifest () {
    return this._client.send('Page.getAppManifest')
  }

  /**
   * @desc Returns all browser cookies.
   * Depending on the backend support, will return detailed cookie information in the cookies field.
   * @return {Promise<Array<Cookie>>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Network#method-getAllCookies
   */
  getAllCookies () {
    return this._networkManager.getAllCookies()
  }

  /**
   * @desc Returns a promise that resolves once this pages network has become idle.
   * Detection of network idle considers only the number of in-flight HTTP requests
   * for the Page connected to.
   * @param {NetIdleOptions} [options]
   * @return {Promise<void>}
   */
  networkIdlePromise (options) {
    return this._networkManager.networkIdlePromise(options)
  }

  workerDomainEnabled () {
    return this._additionalDomains.workers
  }

  logDomainEnabled () {
    return this._additionalDomains.log
  }

  securityDomainEnabled () {
    return this._additionalDomains.security
  }

  performanceDomainEnabled () {
    return this._additionalDomains.performance
  }

  /**
   * @param {boolean} enabled
   */
  setOfflineMode (enabled) {
    return this._networkManager.setOfflineMode(enabled)
  }

  /**
   * @param {number} timeout
   */
  setDefaultNavigationTimeout (timeout) {
    this._timeoutSettings.setDefaultNavigationTimeout(timeout)
  }

  /**
   * @param {number} timeout
   */
  setDefaultTimeout (timeout) {
    this._timeoutSettings.setDefaultTimeout(timeout)
  }

  /**
   * @param {string} selector
   * @return {Promise<ElementHandle|undefined>}
   */
  querySelector (selector) {
    return this.$(selector)
  }

  /**
   * @param {string} selector
   * @return {Promise<Array<ElementHandle>>}
   */
  querySelectorAll (selector) {
    return this.$$(selector)
  }

  /**
   * @param {string} selector
   * @param {Function|String} pageFunction
   * @param {...*} args
   * @return {Promise<Object|undefined>}
   */
  querySelectorEval (selector, pageFunction, ...args) {
    return this.$eval(selector, pageFunction, ...args)
  }

  /**
   * @param {string} selector
   * @param {Function|String} pageFunction
   * @param {...*} args
   * @return {Promise<Object|undefined>}
   */
  querySelectorAllEval (selector, pageFunction, ...args) {
    return this.$$eval(selector, pageFunction, ...args)
  }

  /**
   * @param {string} expression
   * @return {Promise<Array<ElementHandle>>}
   */
  xpathQuery (expression) {
    return this.$x(expression)
  }

  /**
   * @param {string} selector
   * @return {Promise<ElementHandle|undefined>}
   */
  $ (selector) {
    return this.mainFrame().$(selector)
  }

  /**
   * @param {string} selector
   * @param {Function|string} pageFunction
   * @param {...*} args
   * @return {Promise<Object|undefined>}
   */
  $eval (selector, pageFunction, ...args) {
    return this.mainFrame().$eval(selector, pageFunction, ...args)
  }

  /**
   * @param {string} selector
   * @param {Function|string} pageFunction
   * @param {...*} args
   * @return {Promise<Object|undefined>}
   */
  $$eval (selector, pageFunction, ...args) {
    return this.mainFrame().$$eval(selector, pageFunction, ...args)
  }

  /**
   * @param {string} selector
   * @return {Promise<Array<ElementHandle>>}
   */
  $$ (selector) {
    return this.mainFrame().$$(selector)
  }

  /**
   * @param {string} expression
   * @return {Promise<Array<ElementHandle>>}
   */
  $x (expression) {
    return this.mainFrame().$x(expression)
  }

  /**
   * @desc Returns all browser cookies for the current URL.
   * Depending on the backend support, will return detailed cookie information in the cookies field.
   * @param {Array<string>} urls - The list of URLs for which applicable cookies will be fetched
   * @return {Promise<Array<Cookie>>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Network#method-getCookies
   */
  cookies (...urls) {
    return this._networkManager.getCookies(urls.length ? urls : [this.url()])
  }

  /**
   * @desc Clears browser cookies
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Network#method-clearBrowserCookies
   */
  clearBrowserCookies () {
    return this._networkManager.clearBrowserCookies()
  }

  /**
   * @desc Blocks URLs from loading. EXPERIMENTAL
   * @param {...string} urls - URL patterns to block. Wildcards ('*') are allowed
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Network#method-setBlockedURLs
   */
  setBlockedURLs (...urls) {
    return this._networkManager.setBlockedURLs(...urls)
  }

  /**
   * @desc Returns the DER-encoded certificate. EXPERIMENTAL
   * @param {string} origin - Origin to get certificate for
   * @return {Promise<Array<string>>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Network#method-getCertificate
   */
  getDEREncodedCertificateForOrigin (origin) {
    return this._networkManager.getCertificate(origin)
  }

  /**
   * @param {string} url
   * @param {!{referer?: string, timeout?: number, waitUntil?: string|Array<string>, transitionType?: string}=} options
   * @return {Promise<Response|undefined>}
   */
  goto (url, options) {
    return this._frameManager.mainFrame().goto(url, options)
  }

  /**
   * @param {!{timeout?: number, waitUntil?: string|Array<string>}=} options
   * @return {Promise<Response|undefined>}
   */
  waitForNavigation (options = {}) {
    return this._frameManager.mainFrame().waitForNavigation(options)
  }

  /**
   * @param {(string|Function)} urlOrPredicate
   * @param {!{timeout?: number}=} options
   * @return {Promise<Request>}
   */
  waitForRequest (urlOrPredicate, options = {}) {
    const { timeout = this._timeoutSettings.timeout() } = options
    return helper.waitForEvent(
      this._networkManager,
      Events.NetworkManager.Request,
      request => {
        if (helper.isString(urlOrPredicate)) {
          return urlOrPredicate === request.url()
        }
        if (typeof urlOrPredicate === 'function') {
          return !!urlOrPredicate(request)
        }
        return false
      },
      timeout
    )
  }

  /**
   * @param {(string|Function)} urlOrPredicate
   * @param {!{timeout?: number}=} options
   * @return {Promise<Response>}
   */
  waitForResponse (urlOrPredicate, options = {}) {
    const { timeout = this._timeoutSettings.timeout() } = options
    return helper.waitForEvent(
      this._networkManager,
      Events.NetworkManager.Response,
      response => {
        if (helper.isString(urlOrPredicate)) {
          return urlOrPredicate === response.url()
        }
        if (typeof urlOrPredicate === 'function') {
          return !!urlOrPredicate(response)
        }
        return false
      },
      timeout
    )
  }

  /**
   * @param {!{timeout?: number, waitUntil?: string|Array<string>}=} options
   * @return {Promise<Response|undefined>}
   */
  goBack (options) {
    return this._go(-1, options)
  }

  /**
   * @param {!{timeout?: number, waitUntil?: string|Array<string>}=} options
   * @return {Promise<Response|undefined>}
   */
  goForward (options) {
    return this._go(+1, options)
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
    if (this._target) {
      await this._target.exposeDevToolsProtocol(bindingName)
      return
    }

    let pageURL
    let title
    if (this._targetId == null) {
      const { targetInfos } = await this._client.send('Target.getTargets', {})
      pageURL = this.url()
      title = await this.title()
      for (let i = 0; i < targetInfos.length; i++) {
        const targetInfo = targetInfos[i]
        console.log(targetInfo)
        if (pageURL === targetInfo.url) {
          this._targetId = targetInfo.targetId
          break
        }
      }
    }

    if (this._targetId == null) {
      throw new Error(
        `Failed to expose devtools protocol. This page (url=${pageURL}, title=${title}) was created without passing in a target and we could not find this page's target id`
      )
    }

    await this._client.send('Target.exposeDevToolsProtocol', {
      targetId: this._targetId,
      bindingName: bindingName || undefined
    })
  }

  /**
   * @param {number} entryId
   * @return {Promise<void>}
   */
  async navigateToHistoryEntry (entryId) {
    await this._client.send('Page.navigateToHistoryEntry', { entryId })
  }

  async resetNavigationHistory () {
    await this._client.send('Page.resetNavigationHistory')
  }

  /**
   * @desc Toggles ignoring of service worker for each request. EXPERIMENTAL
   * @param {boolean} bypass - Bypass service worker and load from network
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Network#method-setBypassServiceWorker
   */
  async httpRequestsBypassServiceWorker (bypass) {
    await this._networkManager.bypassServiceWorker(bypass)
  }

  /**
   * @desc Force the page stop all navigations and pending resource fetches
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Page#method-stopLoading
   */
  async stopLoading () {
    await this._client.send('Page.stopLoading')
  }

  /**
   * @desc Set the behavior when downloading a file. EXPERIMENTAL
   *
   * @param {string} behavior - Whether to allow all or deny all download requests, or use default Chrome behavior if available (otherwise deny). Allowed values: deny, allow, default
   * @param {string} [downloadPath] - The default path to save downloaded files to. This is requred if behavior is set to 'allow'
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Page#method-setDownloadBehavior
   */
  async setDownloadBehavior (behavior, downloadPath) {
    await this._client.send('Page.setDownloadBehavior', {
      behavior,
      downloadPath: downloadPath || undefined
    })
  }

  /**
   * Evaluates given script in every frame upon creation (before loading frame's scripts)
   * @param {string} source - The string contents of the script
   * @param {string} [worldName] - If specified, creates an isolated world with the given name and evaluates given
   * script in it. This world name will be used as the ExecutionContextDescription::name when the corresponding
   * event is emitted.
   * @return {Promise<string>} - Identifier of the added script
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Page#method-addScriptToEvaluateOnNewDocument
   */
  async addScriptToEvaluateOnNewDocument (source, worldName) {
    const { identifier } = await this._client.send(
      'Page.addScriptToEvaluateOnNewDocument',
      { source, woldName: worldName || undefined }
    )
    return identifier
  }

  /**
   * @param {string} identifier - Identifier of the added script
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Page#method-removeScriptToEvaluateOnNewDocument
   */
  async removeScriptToEvaluateOnNewDocument (identifier) {
    if (!identifier) return
    await this._client.send('Page.removeScriptToEvaluateOnNewDocument', {
      identifier
    })
  }

  /**
   * @return {Promise<string>}
   */
  async userAgent () {
    const version = await this._client.send('Browser.getVersion')
    return version.userAgent
  }

  /**
   * @param {string} acceptLanguage
   */
  async setAcceptLanguage (acceptLanguage) {
    await this._networkManager.setAcceptLanguage(acceptLanguage)
  }

  /**
   * @param {string} platform
   */
  async setNavigatorPlatform (platform) {
    await this._networkManager.setNavigatorPlatform(platform)
  }

  async disableCache () {
    await this._networkManager.disableCache()
  }

  async enableCache () {
    await this._networkManager.enableCache()
  }

  async clearBrowserCache () {
    await this._networkManager.clearBrowserCache()
  }

  async disableWorkerDomain () {
    if (this._additionalDomains.workers) {
      this._additionalDomains.workers = false
      await this._client.send('Target.setAutoAttach', {
        autoAttach: false,
        waitForDebuggerOnStart: false,
        flatten: true
      })
      this._client.removeListener(
        'Target.attachedToTarget',
        this._onAttachedToTarget
      )
      this._client.removeListener(
        'Target.detachedFromTarget',
        this._onAttachedToTarget
      )
    }
  }

  async enableWorkerDomain () {
    if (!this._additionalDomains.workers) {
      this._additionalDomains.workers = true
      await this._client.send('Target.setAutoAttach', {
        autoAttach: true,
        waitForDebuggerOnStart: false,
        flatten: true
      })
      this._client.on('Target.attachedToTarget', this._onAttachedToTarget)
      this._client.on('Target.detachedFromTarget', this._onDetachedFromTarget)
    }
  }

  async disableLogDomain () {
    if (this._additionalDomains.log) {
      this._additionalDomains.log = false
      await this._client.send('Log.disable', {})
    }
  }

  async enableLogDomain () {
    if (!this._additionalDomains.log) {
      this._additionalDomains.log = true
      await this._client.send('Log.enable', {})
    }
  }

  async disableSecurityDomain () {
    if (this._additionalDomains.security) {
      this._additionalDomains.security = false
      await this._client.send('Security.disable', {})
    }
  }

  async enableSecurityDomain () {
    if (!this._additionalDomains.security) {
      this._additionalDomains.security = true
      await this._client.send('Security.enable', {})
    }
  }

  async disablePerformanceDomain () {
    if (this._additionalDomains.performance) {
      this._additionalDomains.performance = false
      await this._client.send('Performance.disable', {})
    }
  }

  async enablePerformanceDomain () {
    if (!this._additionalDomains.performance) {
      this._additionalDomains.performance = true
      await this._client.send('Performance.enable', {})
    }
  }
  /**
   * @param {!{longitude: number, latitude: number, accuracy: (number|undefined)}} options
   */
  async setGeolocation (options) {
    await this._emulationManager.setGeolocation(options)
  }

  /**
   * @param {boolean} value
   */
  async setRequestInterception (value) {
    return this._networkManager.setRequestInterception(value)
  }

  /**
   * @param {Function|string} pageFunction
   * @param {...*} args
   * @return {Promise<JSHandle>}
   */
  async evaluateHandle (pageFunction, ...args) {
    const context = await this.mainFrame().executionContext()
    return context.evaluateHandle(pageFunction, ...args)
  }

  /**
   * @param {!JSHandle} prototypeHandle
   * @return {Promise<JSHandle>}
   */
  async queryObjects (prototypeHandle) {
    const context = await this.mainFrame().executionContext()
    return context.queryObjects(prototypeHandle)
  }

  /**
   * @desc Deletes the specified browser cookies with matching name and url or domain/path pair.
   * @param {CDPCookie|CookieToBeDeleted|string|Cookie} cookie - The cookie to be deleted
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Network#method-deleteCookies
   */
  async deleteCookie (cookie) {
    const pageURL = this.url()
    const startsWithHTTP = pageURL.startsWith('http')
    await this._networkManager.deleteCookie(
      ensureCookie(cookie, pageURL, startsWithHTTP)
    )
  }

  /**
   * @desc Deletes the specified browser cookies with matching name and url or domain/path pair.
   * @param {Array<CDPCookie|CookieToBeDeleted|string|Cookie>} cookies - The cookies to be deleted
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Network#method-deleteCookies
   */
  async deleteCookies (...cookies) {
    const pageURL = this.url()
    const startsWithHTTP = pageURL.startsWith('http')
    for (let i = 0; i < cookies.length; i++) {
      await this._networkManager.deleteCookie(
        ensureCookie(cookies[i], pageURL, startsWithHTTP)
      )
    }
  }

  /**
   * @param {CDPCookie|Cookie|string} cookie - The new cookie to be set
   * @return {Promise<boolean>} - T/F indicating if the cookie was set
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Network#method-setCookie
   */
  async setCookie (cookie) {
    const pageURL = this.url()
    const startsWithHTTP = pageURL.startsWith('http')
    const cookieToBeSet = ensureCookie(cookie, pageURL, startsWithHTTP)
    assert(
      cookieToBeSet.url !== 'about:blank',
      `Blank page can not have cookie "${cookieToBeSet.name}"`
    )
    assert(
      !String.prototype.startsWith.call(cookieToBeSet.url || '', 'data:'),
      `Data URL page can not have cookie "${cookieToBeSet.name}"`
    )
    await this._networkManager.deleteCookie(cookieToBeSet)
    return this._networkManager.setCookie(cookieToBeSet)
  }

  /**
   * @desc Sets given cookies
   * @param {Array<CDPCookie|Cookie|string>} cookies
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Network#method-setCookies
   */
  async setCookies (...cookies) {
    if (!cookies.length) return
    const pageURL = this.url()
    const startsWithHTTP = pageURL.startsWith('http')
    const cookiesSet = []
    for (let i = 0; i < cookies.length; i++) {
      let cookie = ensureCookie(cookies[i], pageURL, startsWithHTTP)
      assert(
        cookie.url !== 'about:blank',
        `Blank page can not have cookie "${cookie.name}"`
      )
      assert(
        !String.prototype.startsWith.call(cookie.url || '', 'data:'),
        `Data URL page can not have cookie "${cookie.name}"`
      )
      cookiesSet.push(cookie)
    }
    await this._networkManager.deleteCookies(...cookiesSet)
    await this._networkManager.setCookies(...cookiesSet)
  }
  /**
   * @param {!{url?: string, path?: string, content?: string, type?: string}} options
   * @return {Promise<ElementHandle>}
   */
  async addScriptTag (options) {
    return this.mainFrame().addScriptTag(options)
  }

  /**
   * @param {!{url?: string, path?: string, content?: string}} options
   * @return {Promise<ElementHandle>}
   */
  async addStyleTag (options) {
    return this.mainFrame().addStyleTag(options)
  }

  /**
   * @param {string} name
   * @param {Function} puppeteerFunction
   */
  async exposeFunction (name, puppeteerFunction) {
    if (this._pageBindings.has(name)) {
      throw new Error(
        `Failed to add page binding with name ${name}: window['${name}'] already exists!`
      )
    }
    this._pageBindings.set(name, puppeteerFunction)

    const expression = helper.evaluationString(addPageBinding, name)
    await this._client.send('Runtime.addBinding', { name: name })
    await this._client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: expression
    })
    await Promise.all(
      this.frames().map(frame => frame.evaluate(expression).catch(debugError))
    )

    function addPageBinding (bindingName) {
      const binding = window[bindingName]
      window[bindingName] = async (...args) => {
        const me = window[bindingName]
        let callbacks = me['callbacks']
        if (!callbacks) {
          callbacks = new Map()
          me['callbacks'] = callbacks
        }
        const seq = (me['lastSeq'] || 0) + 1
        me['lastSeq'] = seq
        const promise = new Promise((resolve, reject) =>
          callbacks.set(seq, { resolve, reject })
        )
        binding(JSON.stringify({ name: bindingName, seq, args }))
        return promise
      }
    }
  }

  /**
   * @param {?{username: string, password: string}} credentials
   */
  async authenticate (credentials) {
    return this._networkManager.authenticate(credentials)
  }

  /**
   * @param {!Object<string, string>} headers
   */
  async setExtraHTTPHeaders (headers) {
    return this._networkManager.setExtraHTTPHeaders(headers)
  }

  /**
   * @param {string} userAgent
   */
  async setUserAgent (userAgent) {
    return this._networkManager.setUserAgent(userAgent)
  }

  /**
   * @return {Promise<Metrics>}
   */
  async metrics () {
    const response = await this._client.send('Performance.getMetrics')
    return this._buildMetricsObject(response.metrics)
  }

  /**
   * @param {string} html
   * @param {!{timeout?: number, waitUntil?: string|Array<string>}=} options
   */
  async setContent (html, options) {
    await this._frameManager.mainFrame().setContent(html, options)
  }
  /**
   * @param {!{timeout?: number, waitUntil?: string|Array<string>, ignoreCache?: boolean, scriptToEvaluateOnLoad?: string}=} options
   * @return {Promise<Response|undefined>}
   */
  async reload (options) {
    const params = {}
    if (options) {
      params.ignoreCache = options.ignoreCache
      params.scriptToEvaluateOnLoad = options.scriptToEvaluateOnLoad
    }
    const [response] = await Promise.all([
      this.waitForNavigation(options),
      this._client.send('Page.reload', params)
    ])
    return response
  }

  async bringToFront () {
    await this._client.send('Page.bringToFront')
  }

  /**
   * @param {!{viewport: !Viewport, userAgent: string}} options
   */
  async emulate (options) {
    await Promise.all([
      this.setViewport(options.viewport),
      this.setUserAgent(options.userAgent)
    ])
  }

  /**
   * @param {boolean} enabled
   */
  async setJavaScriptEnabled (enabled) {
    if (this._javascriptEnabled === enabled) return
    this._javascriptEnabled = enabled
    await this._emulationManager.setScriptExecutionDisabled(!enabled)
  }

  /**
   * @param {boolean} enabled
   */
  async setBypassCSP (enabled) {
    await this._client.send('Page.setBypassCSP', { enabled })
  }

  /**
   * @param {?string} mediaType
   */
  async emulateMedia (mediaType) {
    await this._emulationManager.setEmulatedMedia(mediaType || '')
  }

  /**
   * @param {!Viewport} viewport
   */
  async setViewport (viewport) {
    const needsReload = await this._emulationManager.emulateViewport(viewport)
    this._viewport = viewport
    if (needsReload) await this.reload()
  }

  /**
   * @param {Function|string} pageFunction
   * @param {...*} args
   */
  async evaluateOnNewDocument (pageFunction, ...args) {
    const source = helper.evaluationString(pageFunction, ...args)
    await this._client.send('Page.addScriptToEvaluateOnNewDocument', { source })
  }

  /**
   * @param {boolean} enabled
   */
  async setCacheEnabled (enabled = true) {
    if (enabled) {
      await this._networkManager.enableCache()
    } else {
      await this._networkManager.disableCache()
    }
  }

  /**
   * @param {!ScreenshotOptions=} options
   * @return {Promise<Buffer|!String>}
   */
  async screenshot (options = {}) {
    let screenshotType = null
    // options.type takes precedence over inferring the type from options.path
    // because it may be a 0-length file with no extension created beforehand (i.e. as a temp file).
    if (options.type) {
      assert(
        options.type === 'png' || options.type === 'jpeg',
        'Unknown options.type value: ' + options.type
      )
      screenshotType = options.type
    } else if (options.path) {
      const mimeType = mime.getType(options.path)
      if (mimeType === 'image/png') screenshotType = 'png'
      else if (mimeType === 'image/jpeg') screenshotType = 'jpeg'
      assert(screenshotType, 'Unsupported screenshot mime type: ' + mimeType)
    }

    if (!screenshotType) screenshotType = 'png'

    if (options.quality) {
      assert(
        screenshotType === 'jpeg',
        'options.quality is unsupported for the ' +
          screenshotType +
          ' screenshots'
      )
      assert(
        typeof options.quality === 'number',
        'Expected options.quality to be a number but found ' +
          typeof options.quality
      )
      assert(
        Number.isInteger(options.quality),
        'Expected options.quality to be an integer'
      )
      assert(
        options.quality >= 0 && options.quality <= 100,
        'Expected options.quality to be between 0 and 100 (inclusive), got ' +
          options.quality
      )
    }
    assert(
      !options.clip || !options.fullPage,
      'options.clip and options.fullPage are exclusive'
    )
    if (options.clip) {
      assert(
        typeof options.clip.x === 'number',
        'Expected options.clip.x to be a number but found ' +
          typeof options.clip.x
      )
      assert(
        typeof options.clip.y === 'number',
        'Expected options.clip.y to be a number but found ' +
          typeof options.clip.y
      )
      assert(
        typeof options.clip.width === 'number',
        'Expected options.clip.width to be a number but found ' +
          typeof options.clip.width
      )
      assert(
        typeof options.clip.height === 'number',
        'Expected options.clip.height to be a number but found ' +
          typeof options.clip.height
      )
      assert(
        options.clip.width !== 0,
        'Expected options.clip.width not to be 0.'
      )
      assert(
        options.clip.height !== 0,
        'Expected options.clip.width not to be 0.'
      )
    }
    return this._screenshotTaskQueue.postTask(
      this._screenshotTask.bind(this, screenshotType, options)
    )
  }

  /**
   * @param {!PDFOptions=} options
   * @return {Promise<Buffer>}
   */
  async pdf (options = {}) {
    const {
      scale = 1,
      displayHeaderFooter = false,
      headerTemplate = '',
      footerTemplate = '',
      printBackground = false,
      landscape = false,
      pageRanges = '',
      preferCSSPageSize = false,
      margin = {},
      path = null
    } = options

    let paperWidth = 8.5
    let paperHeight = 11
    if (options.format) {
      const format = Page.PaperFormats[options.format.toLowerCase()]
      assert(format, 'Unknown paper format: ' + options.format)
      paperWidth = format.width
      paperHeight = format.height
    } else {
      paperWidth = convertPrintParameterToInches(options.width) || paperWidth
      paperHeight = convertPrintParameterToInches(options.height) || paperHeight
    }

    const marginTop = convertPrintParameterToInches(margin.top) || 0
    const marginLeft = convertPrintParameterToInches(margin.left) || 0
    const marginBottom = convertPrintParameterToInches(margin.bottom) || 0
    const marginRight = convertPrintParameterToInches(margin.right) || 0

    const result = await this._client.send('Page.printToPDF', {
      landscape,
      displayHeaderFooter,
      headerTemplate,
      footerTemplate,
      printBackground,
      scale,
      paperWidth,
      paperHeight,
      marginTop,
      marginBottom,
      marginLeft,
      marginRight,
      pageRanges,
      preferCSSPageSize
    })
    const buffer = Buffer.from(result.data, 'base64')
    if (path !== null) await fs.writeFile(path, buffer)
    return buffer
  }

  /**
   * @param {!{runBeforeUnload: (boolean|undefined)}=} options
   */
  async close (options = { runBeforeUnload: undefined }) {
    const runBeforeUnload = !!options.runBeforeUnload
    if (runBeforeUnload) {
      await this._client.send('Page.close')
    } else if (this._target) {
      await this._target.close()
      await this._target._isClosedPromise
    }
  }

  /**
   * @param {"png"|"jpeg"} format
   * @param {!ScreenshotOptions=} options
   * @return {Promise<Buffer|!String>}
   */
  async _screenshotTask (format, options) {
    if (this._target) {
      await this._client.send('Target.activateTarget', {
        targetId: this._target.id()
      })
    }
    let clip = options.clip ? processClip(options.clip) : undefined

    if (options.fullPage) {
      const metrics = await this.getLayoutMetrics()
      const width = Math.ceil(metrics.contentSize.width)
      const height = Math.ceil(metrics.contentSize.height)

      // Overwrite clip for full page at all times.
      clip = { x: 0, y: 0, width, height, scale: 1 }
      const { isMobile = false, deviceScaleFactor = 1, isLandscape = false } =
        this._viewport || {}
      /** @type {!Object} */
      const screenOrientation = isLandscape
        ? { angle: 90, type: 'landscapePrimary' }
        : { angle: 0, type: 'portraitPrimary' }
      await this._client.send('Emulation.setDeviceMetricsOverride', {
        mobile: isMobile,
        width,
        height,
        deviceScaleFactor,
        screenOrientation
      })
    }
    const shouldSetDefaultBackground =
      options.omitBackground && format === 'png'
    if (shouldSetDefaultBackground) {
      await this._emulationManager.setDefaultBackgroundColorOverride({
        r: 0,
        g: 0,
        b: 0,
        a: 0
      })
    }
    const result = await this._client.send('Page.captureScreenshot', {
      format,
      quality: options.quality,
      clip
    })
    if (shouldSetDefaultBackground) {
      await this._emulationManager.setDefaultBackgroundColorOverride()
    }

    if (options.fullPage && this._viewport) {
      await this.setViewport(this._viewport)
    }

    const buffer =
      options.encoding === 'base64'
        ? result.data
        : Buffer.from(result.data, 'base64')
    if (options.path) await fs.writeFile(options.path, buffer)
    return buffer

    function processClip (clip) {
      const x = Math.round(clip.x)
      const y = Math.round(clip.y)
      const width = Math.round(clip.width + clip.x - x)
      const height = Math.round(clip.height + clip.y - y)
      return { x, y, width, height, scale: 1 }
    }
  }

  /**
   * @param delta
   * @param {!{timeout?: number, waitUntil?: string|Array<string>}=} options
   * @return {Promise<Response|undefined>}
   */
  async _go (delta, options) {
    const history = await this.getNavigationHistory()
    const entry = history.entries[history.currentIndex + delta]
    if (!entry) return null
    const [response] = await Promise.all([
      this.waitForNavigation(options),
      this.navigateToHistoryEntry(entry.id)
    ])
    return response
  }

  /**
   * @param {!Object} event
   */
  async _onConsoleAPI (event) {
    if (event.executionContextId === 0) {
      // DevTools protocol stores the last 1000 console messages. These
      // messages are always reported even for removed execution contexts. In
      // this case, they are marked with executionContextId = 0 and are
      // reported upon enabling Runtime agent.
      //
      // Ignore these messages since:
      // - there's no execution context we can use to operate with message
      //   arguments
      // - these messages are reported before Puppeteer clients can subscribe
      //   to the 'console'
      //   page event.
      //
      // @see https://github.com/GoogleChrome/puppeteer/issues/3865
      return
    }
    const context = this._frameManager.executionContextById(
      event.executionContextId
    )
    const values = event.args.map(arg => createJSHandle(context, arg))
    this._addConsoleMessage(event.type, values, event.stackTrace)
  }

  /**
   * @param {!Object} event
   */
  async _onBindingCalled (event) {
    const { name, seq, args } = JSON.parse(event.payload)
    let expression = null
    try {
      const result = await this._pageBindings.get(name)(...args)
      expression = helper.evaluationString(deliverResult, name, seq, result)
    } catch (error) {
      if (error instanceof Error) {
        expression = helper.evaluationString(
          deliverError,
          name,
          seq,
          error.message,
          error.stack
        )
      } else {
        expression = helper.evaluationString(
          deliverErrorValue,
          name,
          seq,
          error
        )
      }
    }
    this._client
      .send('Runtime.evaluate', {
        expression,
        contextId: event.executionContextId
      })
      .catch(debugError)

    /**
     * @param {string} name
     * @param {number} seq
     * @param {*} result
     */
    function deliverResult (name, seq, result) {
      window[name]['callbacks'].get(seq).resolve(result)
      window[name]['callbacks'].delete(seq)
    }

    /**
     * @param {string} name
     * @param {number} seq
     * @param {string} message
     * @param {string} stack
     */
    function deliverError (name, seq, message, stack) {
      const error = new Error(message)
      error.stack = stack
      window[name]['callbacks'].get(seq).reject(error)
      window[name]['callbacks'].delete(seq)
    }

    /**
     * @param {string} name
     * @param {number} seq
     * @param {*} value
     */
    function deliverErrorValue (name, seq, value) {
      window[name]['callbacks'].get(seq).reject(value)
      window[name]['callbacks'].delete(seq)
    }
  }

  _onAttachedToTarget (event) {
    if (event.targetInfo.type !== 'worker') {
      // If we don't detach from service workers, they will never die.
      this._client
        .send('Target.detachFromTarget', {
          sessionId: event.sessionId
        })
        .catch(debugError)
      return
    }
    const session = CRIConnection.fromSession(this._client).session(
      event.sessionId
    )
    const worker = new Worker(
      session,
      event.targetInfo.url,
      this._addConsoleMessage.bind(this),
      this._handleException.bind(this)
    )
    this._workers.set(event.sessionId, worker)
    this.emit(Events.Page.WorkerCreated, worker)
  }

  _onDetachedFromTarget (event) {
    const worker = this._workers.get(event.sessionId)
    if (!worker) return
    this.emit(Events.Page.WorkerDestroyed, worker)
    this._workers.delete(event.sessionId)
  }

  _onTargetCrashed () {
    this.emit('error', new Error('Page crashed!'))
    this.emit(Events.Page.Crashed)
  }

  /**
   * @param {!Object} event
   */
  _onLogEntryAdded (event) {
    const { level, text, args, source, url, lineNumber } = event.entry
    if (source !== 'worker') {
      this.emit(
        Events.Page.Console,
        new ConsoleMessage(level, text, [], { url, lineNumber })
      )
    }
    if (args) {
      return Promise.all(
        args.map(arg => helper.releaseObject(this._client, arg))
      )
    }
  }

  /**
   * @param {!Object} event
   */
  _onCertificateError (event) {
    if (!this._ignoreHTTPSErrors) return
    this._client
      .send('Security.handleCertificateError', {
        eventId: event.eventId,
        action: 'continue'
      })
      .catch(debugError)
  }

  /**
   * @param {!Object} event
   */
  _emitMetrics (event) {
    this.emit(Events.Page.Metrics, {
      title: event.title,
      metrics: this._buildMetricsObject(event.metrics)
    })
  }

  /**
   * @param {?Array<Object>} metrics
   * @return {!Metrics}
   */
  _buildMetricsObject (metrics) {
    const result = {}
    const _metrics = metrics || []
    for (let i = 0; i < _metrics.length; i++) {
      const metric = _metrics[i]
      if (supportedMetrics.has(metric.name)) result[metric.name] = metric.value
    }
    return result
  }

  /**
   * @param {!Object} exceptionDetails
   */
  _handleException (exceptionDetails) {
    const message = helper.getExceptionMessage(exceptionDetails)
    const err = new Error(message)
    err.stack = '' // Don't report clientside error with a node stack attached
    this.emit(Events.Page.PageError, err)
  }

  /**
   * @param {string} type
   * @param {Array<JSHandle>} args
   * @param {Object=} stackTrace
   */
  _addConsoleMessage (type, args, stackTrace) {
    if (!this.listenerCount(Events.Page.Console)) {
      args.forEach(arg => arg.dispose())
      return
    }
    const textTokens = []
    for (let i = 0; i < args.length; i++) {
      const remoteObject = args[i]._remoteObject
      if (remoteObject.objectId) {
        textTokens.push(args[i].toString())
      } else {
        textTokens.push(helper.valueFromRemoteObject(remoteObject))
      }
    }
    let location
    if (stackTrace && stackTrace.callFrames.length) {
      location = {
        url: stackTrace.callFrames[0].url,
        lineNumber: stackTrace.callFrames[0].lineNumber,
        columnNumber: stackTrace.callFrames[0].columnNumber
      }
    }
    const message = new ConsoleMessage(
      type,
      textTokens.join(' '),
      args,
      location || {}
    )
    this.emit(Events.Page.Console, message)
  }

  _onDialog (event) {
    let dialogType = null
    if (event.type === 'alert') dialogType = Dialog.Type.Alert
    else if (event.type === 'confirm') dialogType = Dialog.Type.Confirm
    else if (event.type === 'prompt') dialogType = Dialog.Type.Prompt
    else if (event.type === 'beforeunload') {
      dialogType = Dialog.Type.BeforeUnload
    }
    assert(dialogType, 'Unknown javascript dialog type: ' + event.type)
    const dialog = new Dialog(
      this._client,
      dialogType,
      event.message,
      event.defaultPrompt
    )
    this.emit(Events.Page.Dialog, dialog)
  }

  /**
   * @return {{frames: !FrameManager, javascriptEnabled: boolean, additionalDomains: ExtraDomainsConfig, workers: IterableIterator<Worker>, url: string, target: ?Target, network: !NetworkManager}}
   */
  toJSON () {
    return {
      url: this._frameManager.mainFrame().url(),
      target: this._target,
      frames: this._frameManager,
      network: this._networkManager,
      additionalDomains: this._additionalDomains,
      workers: this._workers.values(),
      javascriptEnabled: this._javascriptEnabled
    }
  }

  /** @ignore */
  // eslint-disable-next-line space-before-function-paren
  [util.inspect.custom](depth, options) {
    if (depth < 0) {
      return options.stylize('[Page]', 'special')
    }

    const newOptions = Object.assign({}, options, {
      depth: options.depth === null ? null : options.depth - 1
    })
    const inner = util.inspect(
      {
        target: this._target,
        network: this._networkManager,
        frames: this._frameManager,
        emulation: this._emulationManager,
        pageBindings: this._pageBindings,
        additionalDomains: this._additionalDomains,
        workers: this._workers,
        javascriptEnabled: this._javascriptEnabled,
        timeoutSettings: this._timeoutSettings
      },
      newOptions
    )
    return `${options.stylize('Page', 'special')} ${inner}`
  }
}

/**
 * @typedef {Object} PDFOptions
 * @property {number} scale
 * @property {boolean} displayHeaderFooter
 * @property {string} headerTemplate
 * @property {string} footerTemplate
 * @property {boolean} printBackground
 * @property {boolean} landscape
 * @property {string} pageRanges
 * @property {string} format
 * @property {string|number} width
 * @property {string|number} height
 * @property {boolean} [preferCSSPageSize]
 * @property {!{top?: string|number, bottom?: string|number, left?: string|number, right?: string|number}} [margin]
 * @property {string} [path]
 */

/**
 * @typedef {Object} Metrics
 * @property {number} Timestamp
 * @property {number} Documents
 * @property {number} Frames
 * @property {number} JSEventListeners
 * @property {number} Nodes
 * @property {number} LayoutCount
 * @property {number} RecalcStyleCount
 * @property {number} LayoutDuration
 * @property {number} RecalcStyleDuration
 * @property {number} ScriptDuration
 * @property {number} TaskDuration
 * @property {number} JSHeapUsedSize
 * @property {number} JSHeapTotalSize
 */

/**
 * @typedef {Object} ScreenshotOptions
 * @property {string} type
 * @property {string} path
 * @property {boolean} fullPage
 * @property {{x: number, y: number, width: number, height: number}} clip
 * @property {number} quality
 * @property {boolean} omitBackground
 * @property {string} encoding
 */

/** @type {!Set<string>} */
const supportedMetrics = new Set([
  'Timestamp',
  'Documents',
  'Frames',
  'JSEventListeners',
  'Nodes',
  'LayoutCount',
  'RecalcStyleCount',
  'LayoutDuration',
  'RecalcStyleDuration',
  'ScriptDuration',
  'TaskDuration',
  'JSHeapUsedSize',
  'JSHeapTotalSize'
])

/** @enum {!{width: number, height: number}} */
Page.PaperFormats = {
  letter: { width: 8.5, height: 11 },
  legal: { width: 8.5, height: 14 },
  tabloid: { width: 11, height: 17 },
  ledger: { width: 17, height: 11 },
  a0: { width: 33.1, height: 46.8 },
  a1: { width: 23.4, height: 33.1 },
  a2: { width: 16.5, height: 23.4 },
  a3: { width: 11.7, height: 16.5 },
  a4: { width: 8.27, height: 11.7 },
  a5: { width: 5.83, height: 8.27 },
  a6: { width: 4.13, height: 5.83 }
}

const unitToPixels = {
  px: 1,
  in: 96,
  cm: 37.8,
  mm: 3.78
}

/**
 * @param {(string|number|undefined)} parameter
 * @return {(number|undefined)}
 */
function convertPrintParameterToInches (parameter) {
  if (typeof parameter === 'undefined') return undefined
  let pixels
  if (helper.isNumber(parameter)) {
    // Treat numbers as pixel values to be aligned with phantom's paperSize.
    pixels = /** @type {number} */ (parameter)
  } else if (helper.isString(parameter)) {
    const text = /** @type {string} */ (parameter)
    let unit = text.substring(text.length - 2).toLowerCase()
    let valueText = ''
    if (unitToPixels.hasOwnProperty(unit)) {
      valueText = text.substring(0, text.length - 2)
    } else {
      // In case of unknown unit try to parse the whole parameter as number of pixels.
      // This is consistent with phantom's paperSize behavior.
      unit = 'px'
      valueText = text
    }
    const value = Number(valueText)
    assert(!isNaN(value), 'Failed to parse parameter value: ' + text)
    pixels = value * unitToPixels[unit]
  } else {
    throw new Error(
      'page.pdf() Cannot handle parameter type: ' + typeof parameter
    )
  }
  return pixels / 96
}

/**
 * @type {Page}
 */
module.exports = Page
