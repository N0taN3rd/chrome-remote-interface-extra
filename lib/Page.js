const fs = require('fs-extra')
const EventEmitter = require('eventemitter3')
const mime = require('mime')
const { Events } = require('./Events')
const { NetworkManager } = require('./NetworkManager')
const { Dialog } = require('./Dialog')
const { EmulationManager } = require('./EmulationManager')
const { FrameManager } = require('./frames')
const { Keyboard, Mouse, Touchscreen } = require('./Input')
const { helper, debugError, assert } = require('./helper')
const { createJSHandle } = require('./JSHandle')
const { TimeoutSettings } = require('./TimeoutSettings')
const { TaskQueue } = require('./TaskQueue')
const { Tracing } = require('./Tracing')
const { Worker } = require('./Worker')
const { Accessibility } = require('./Accessibility')
const { Coverage } = require('./Coverage')
const { CRIConnection } = require('./criConnectionAdaptor')

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
 * @property {boolean} ignoreHTTPSErrors
 * @property {?Target} target
 * @property {?Object} defaultViewPort
 * @property {?TaskQueue} screenshotTaskQueue
 * @property {?ExtraDomainsConfig} additionalDomains
 */

/**
 * @typedef {Object} Viewport
 *  @property {number} width
 *  @property {number} height
 *  @property {?number} deviceScaleFactor
 *  @property {?boolean} isMobile
 *  @property {?boolean}  isLandscape
 *  @property {?boolean} hasTouch
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
   * @param {PageInitOptions=} [optionals]
   * @return {!Promise<!Page>}
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
    if (enableExtraDomains.security) {
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
    this._client = client
    this._target = initOpts.target
    this._keyboard = new Keyboard(client)
    this._mouse = new Mouse(client, this._keyboard)
    this._timeoutSettings = new TimeoutSettings()
    this._touchscreen = new Touchscreen(client, this._keyboard)
    this._accessibility = new Accessibility(client)
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
      this.emit(Events.Page.DOMContentLoaded)
    )
    client.on('Page.loadEventFired', event => this.emit(Events.Page.Load))
    client.on('Runtime.consoleAPICalled', event => this._onConsoleAPI(event))
    client.on('Runtime.bindingCalled', event => this._onBindingCalled(event))
    client.on('Page.javascriptDialogOpening', event => this._onDialog(event))
    client.on('Runtime.exceptionThrown', exception =>
      this._handleException(exception.exceptionDetails)
    )
    client.on('Security.certificateError', event =>
      this._onCertificateError(event)
    )
    client.on('Inspector.targetCrashed', event => this._onTargetCrashed())
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
   * @return {Promise<FrameResourceTree>}
   */
  getResourceTree () {
    return this._frameManager.getResourceTree()
  }

  /**
   * @param {boolean} bypass
   * @return {Promise<void>}
   */
  async httpRequestsBypassServiceWorker (bypass) {
    await this._networkManager.bypassServiceWorker(bypass)
  }

  async stopLoading () {
    await this._client.send('Page.stopLoading')
  }

  async setDownloadBehavior ({ behavior, downloadPath }) {
    await this._client.send('Page.setDownloadBehavior', {
      behavior,
      downloadPath
    })
  }

  /**
   * @param {string} script
   * @return {Promise<string>}
   */
  async addScriptToEvaluateOnNewDocument (script) {
    const { identifier } = await this._client.send(
      'Page.addScriptToEvaluateOnNewDocument',
      { source: script }
    )
    return identifier
  }

  /**
   * @param {string} identifier
   * @return {Promise<void>}
   */
  async removeScriptToEvaluateOnNewDocument (identifier) {
    await this._client.send('Page.removeScriptToEvaluateOnNewDocument', {
      identifier
    })
  }

  getAppManifest () {
    return this._client.send('Page.getAppManifest')
  }

  /**
   * @return {!Promise<string>}
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

  async clearBrowserCookies () {
    await this._networkManager.clearBrowserCookies()
  }

  /**
   *
   * @param {!CookieToBeDeleted} cookie
   * @return {Promise<void>}
   */
  async deleteCookie (cookie) {
    await this._networkManager.deleteCookies(cookie)
  }

  /**
   * @desc Returns all browser cookies.
   * Depending on the backend support, will return detailed cookie information in the cookies field.
   * @return {!Promise<!Array<Cookie>>}
   */
  getAllCookies () {
    return this._networkManager.getAllCookies()
  }

  /**
   *
   * @param {NetIdleOptions} [options]
   * @return {Promise<void>}
   */
  networkIdlePromise (options) {
    return this._networkManager.networkIdlePromise(options)
  }

  workerDomainEnabled () {
    return this._additionalDomains.workers
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
      this._client.send('Target.setAutoAttach', {
        autoAttach: true,
        waitForDebuggerOnStart: false,
        flatten: true
      })
      this._client.on('Target.attachedToTarget', this._onAttachedToTarget)
      this._client.on('Target.detachedFromTarget', this._onDetachedFromTarget)
    }
  }

  logDomainEnabled () {
    return this._additionalDomains.log
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

  securityDomainEnabled () {
    return this._additionalDomains.security
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

  performanceDomainEnabled () {
    return this._additionalDomains.performance
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

  /**
   * @param {!{longitude: number, latitude: number, accuracy: (number|undefined)}} options
   */
  async setGeolocation (options) {
    await this._emulationManager.setGeolocation(options)
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
   * @return {!Frame}
   */
  mainFrame () {
    return this._frameManager.mainFrame()
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
   * @return {!Array<Frame>}
   */
  frames () {
    return this._frameManager.frames()
  }

  /**
   * @return {!Array<!Worker>}
   */
  workers () {
    return Array.from(this._workers.values())
  }

  /**
   * @param {boolean} value
   */
  async setRequestInterception (value) {
    return this._networkManager.setRequestInterception(value)
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
   * @param {string} selector
   * @return {!Promise<?ElementHandle>}
   */
  $ (selector) {
    return this.mainFrame().$(selector)
  }

  /**
   * @param {Function|string} pageFunction
   * @param {!Array<*>} args
   * @return {!Promise<!JSHandle>}
   */
  async evaluateHandle (pageFunction, ...args) {
    const context = await this.mainFrame().executionContext()
    return context.evaluateHandle(pageFunction, ...args)
  }

  /**
   * @param {!JSHandle} prototypeHandle
   * @return {!Promise<!JSHandle>}
   */
  async queryObjects (prototypeHandle) {
    const context = await this.mainFrame().executionContext()
    return context.queryObjects(prototypeHandle)
  }

  /**
   * @param {string} selector
   * @param {Function|string} pageFunction
   * @param {!Array<*>} args
   * @return {!Promise<(!Object|undefined)>}
   */
  $eval (selector, pageFunction, ...args) {
    return this.mainFrame().$eval(selector, pageFunction, ...args)
  }

  /**
   * @param {string} selector
   * @param {Function|string} pageFunction
   * @param {!Array<*>} args
   * @return {!Promise<(!Object|undefined)>}
   */
  $$eval (selector, pageFunction, ...args) {
    return this.mainFrame().$$eval(selector, pageFunction, ...args)
  }

  /**
   * @param {string} selector
   * @return {!Promise<!Array<!ElementHandle>>}
   */
  $$ (selector) {
    return this.mainFrame().$$(selector)
  }

  /**
   * @param {string} expression
   * @return {!Promise<!Array<!ElementHandle>>}
   */
  $x (expression) {
    return this.mainFrame().$x(expression)
  }

  /**
   * @param {!Array<string>} urls
   * @return {!Promise<!Array<Cookie>>}
   */
  cookies (...urls) {
    return this._networkManager.getCookies(urls.length ? urls : [this.url()])
  }

  /**
   * @param {Array<CookieToBeDeleted|CookieParam>} cookies
   */
  async deleteCookies (...cookies) {
    const pageURL = this.url()
    for (const cookie of cookies) {
      const item = Object.assign({}, cookie)
      if (!cookie.url && pageURL.startsWith('http')) item.url = pageURL
      await this._networkManager.deleteCookies(item)
    }
  }

  /**
   * @param {Array<CookieParam>} cookies
   */
  async setCookie (...cookies) {
    const pageURL = this.url()
    const startsWithHTTP = pageURL.startsWith('http')
    const items = cookies.map(cookie => {
      const item = Object.assign({}, cookie)
      if (!item.url && startsWithHTTP) item.url = pageURL
      assert(
        item.url !== 'about:blank',
        `Blank page can not have cookie "${item.name}"`
      )
      assert(
        !String.prototype.startsWith.call(item.url || '', 'data:'),
        `Data URL page can not have cookie "${item.name}"`
      )
      return item
    })
    await this.deleteCookie(...items)
    if (items.length) {
      await this._networkManager.setCookies(...items)
    }
  }

  /**
   * @param {!{url?: string, path?: string, content?: string, type?: string}} options
   * @return {!Promise<!ElementHandle>}
   */
  async addScriptTag (options) {
    return this.mainFrame().addScriptTag(options)
  }

  /**
   * @param {!{url?: string, path?: string, content?: string}} options
   * @return {!Promise<!ElementHandle>}
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
   * @return {!Promise<!Metrics>}
   */
  async metrics () {
    const response = await this._client.send('Performance.getMetrics')
    return this._buildMetricsObject(response.metrics)
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
   * @param {?Array<!Object>} metrics
   * @return {!Metrics}
   */
  _buildMetricsObject (metrics) {
    const result = {}
    for (const metric of metrics || []) {
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

  /**
   * @param {string} type
   * @param {!Array<!JSHandle>} args
   * @param {Object=} stackTrace
   */
  _addConsoleMessage (type, args, stackTrace) {
    if (!this.listenerCount(Events.Page.Console)) {
      args.forEach(arg => arg.dispose())
      return
    }
    const textTokens = []
    for (const arg of args) {
      const remoteObject = arg._remoteObject
      if (remoteObject.objectId) textTokens.push(arg.toString())
      else textTokens.push(helper.valueFromRemoteObject(remoteObject))
    }
    const location =
      stackTrace && stackTrace.callFrames.length
        ? {
            url: stackTrace.callFrames[0].url,
            lineNumber: stackTrace.callFrames[0].lineNumber,
            columnNumber: stackTrace.callFrames[0].columnNumber
          }
        : {}
    const message = new ConsoleMessage(
      type,
      textTokens.join(' '),
      args,
      location
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
   * @return {!string}
   */
  url () {
    return this.mainFrame().url()
  }

  /**
   * @return {!Promise<string>}
   */
  content () {
    return this._frameManager.mainFrame().content()
  }

  /**
   * @param {string} html
   * @param {!{timeout?: number, waitUntil?: string|!Array<string>}=} options
   */
  async setContent (html, options) {
    await this._frameManager.mainFrame().setContent(html, options)
  }

  /**
   * @param {string} url
   * @param {!{referer?: string, timeout?: number, waitUntil?: string|!Array<string>}=} options
   * @return {!Promise<?Response>}
   */
  goto (url, options) {
    return this._frameManager.mainFrame().goto(url, options)
  }

  /**
   * @param {!{timeout?: number, waitUntil?: string|!Array<string>, ignoreCache?: boolean, scriptToEvaluateOnLoad?: string}=} options
   * @return {!Promise<?Response>}
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

  /**
   * @param {!{timeout?: number, waitUntil?: string|!Array<string>}=} options
   * @return {!Promise<?Response>}
   */
  waitForNavigation (options = {}) {
    return this._frameManager.mainFrame().waitForNavigation(options)
  }

  /**
   * @param {(string|Function)} urlOrPredicate
   * @param {!{timeout?: number}=} options
   * @return {!Promise<!Request>}
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
   * @return {!Promise<!Response>}
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
   * @param {!{timeout?: number, waitUntil?: string|!Array<string>}=} options
   * @return {!Promise<?Response>}
   */
  goBack (options) {
    return this._go(-1, options)
  }

  /**
   * @param {!{timeout?: number, waitUntil?: string|!Array<string>}=} options
   * @return {!Promise<?Response>}
   */
  goForward (options) {
    return this._go(+1, options)
  }

  /**
   * @param delta
   * @param {!{timeout?: number, waitUntil?: string|!Array<string>}=} options
   * @return {!Promise<?Response>}
   */
  async _go (delta, options) {
    const history = await this._client.send('Page.getNavigationHistory')
    const entry = history.entries[history.currentIndex + delta]
    if (!entry) return null
    const [response] = await Promise.all([
      this.waitForNavigation(options),
      this._client.send('Page.navigateToHistoryEntry', { entryId: entry.id })
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
    await this._client.send('Emulation.setScriptExecutionDisabled', {
      value: !enabled
    })
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
    assert(
      mediaType === 'screen' || mediaType === 'print' || mediaType === null,
      'Unsupported media type: ' + mediaType
    )
    await this._client.send('Emulation.setEmulatedMedia', {
      media: mediaType || ''
    })
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
   * @return {?Viewport}
   */
  viewport () {
    return this._viewport
  }

  /**
   * @param {Function|string} pageFunction
   * @param {!Array<*>} args
   * @return {!Promise<*>}
   */
  evaluate (pageFunction, ...args) {
    return this._frameManager.mainFrame().evaluate(pageFunction, ...args)
  }

  /**
   * @param {Function|string} pageFunction
   * @param {!Array<*>} args
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
   * @return {!Promise<!Buffer|!String>}
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
   * @param {"png"|"jpeg"} format
   * @param {!ScreenshotOptions=} options
   * @return {!Promise<!Buffer|!String>}
   */
  async _screenshotTask (format, options) {
    if (this._target) {
      await this._client.send('Target.activateTarget', {
        targetId: this._target._targetId
      })
    }
    let clip = options.clip ? processClip(options.clip) : undefined

    if (options.fullPage) {
      const metrics = await this._client.send('Page.getLayoutMetrics')
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
      await this._client.send('Emulation.setDefaultBackgroundColorOverride', {
        color: { r: 0, g: 0, b: 0, a: 0 }
      })
    }
    const result = await this._client.send('Page.captureScreenshot', {
      format,
      quality: options.quality,
      clip
    })
    if (shouldSetDefaultBackground) {
      await this._client.send('Emulation.setDefaultBackgroundColorOverride')
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
   * @param {!PDFOptions=} options
   * @return {!Promise<!Buffer>}
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
   * @return {!Promise<string>}
   */
  title () {
    return this.mainFrame().title()
  }

  /**
   * @param {!{runBeforeUnload: (boolean|undefined)}=} options
   */
  async close (options = { runBeforeUnload: undefined }) {
    // TODO(n0tan3rd): check for client already closed here somehow
    const runBeforeUnload = !!options.runBeforeUnload
    if (runBeforeUnload) {
      await this._client.send('Page.close')
    } else if (this._target) {
      await this._client._connection.send('Target.closeTarget', {
        targetId: this._target._targetId
      })
      await this._target._isClosedPromise
    }
  }

  /**
   * @return {boolean}
   */
  isClosed () {
    return this._closed
  }

  /**
   * @return {!Mouse}
   */
  get mouse () {
    return this._mouse
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
   * @param {!Array<string>} values
   * @return {!Promise<!Array<string>>}
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
   * @param {!Array<*>} args
   * @return {!Promise<!JSHandle>}
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
   * @return {!Promise<?ElementHandle>}
   */
  waitForSelector (selector, options = {}) {
    return this.mainFrame().waitForSelector(selector, options)
  }

  /**
   * @param {string} xpath
   * @param {!{visible?: boolean, hidden?: boolean, timeout?: number}=} options
   * @return {!Promise<?ElementHandle>}
   */
  waitForXPath (xpath, options = {}) {
    return this.mainFrame().waitForXPath(xpath, options)
  }

  /**
   * @param {Function} pageFunction
   * @param {!{polling?: string|number, timeout?: number}=} options
   * @param {!Array<*>} args
   * @return {!Promise<!JSHandle>}
   */
  waitForFunction (pageFunction, options = {}, ...args) {
    return this.mainFrame().waitForFunction(pageFunction, options, ...args)
  }
}

/**
 * @typedef {Object} PDFOptions
 * @property {number=} scale
 * @property {boolean=} displayHeaderFooter
 * @property {string=} headerTemplate
 * @property {string=} footerTemplate
 * @property {boolean=} printBackground
 * @property {boolean=} landscape
 * @property {string=} pageRanges
 * @property {string=} format
 * @property {string|number=} width
 * @property {string|number=} height
 * @property {boolean=} preferCSSPageSize
 * @property {!{top?: string|number, bottom?: string|number, left?: string|number, right?: string|number}=} margin
 * @property {string=} path
 */

/**
 * @typedef {Object} Metrics
 * @property {number=} Timestamp
 * @property {number=} Documents
 * @property {number=} Frames
 * @property {number=} JSEventListeners
 * @property {number=} Nodes
 * @property {number=} LayoutCount
 * @property {number=} RecalcStyleCount
 * @property {number=} LayoutDuration
 * @property {number=} RecalcStyleDuration
 * @property {number=} ScriptDuration
 * @property {number=} TaskDuration
 * @property {number=} JSHeapUsedSize
 * @property {number=} JSHeapTotalSize
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
 * @typedef {Object} ConsoleMessage.Location
 * @property {string=} url
 * @property {number=} lineNumber
 * @property {number=} columnNumber
 */

class ConsoleMessage {
  /**
   * @param {string} type
   * @param {string} text
   * @param {!Array<!JSHandle>} args
   * @param {ConsoleMessage.Location} location
   */
  constructor (type, text, args, location = {}) {
    this._type = type
    this._text = text
    this._args = args
    this._location = location
  }

  /**
   * @return {string}
   */
  type () {
    return this._type
  }

  /**
   * @return {string}
   */
  text () {
    return this._text
  }

  /**
   * @return {!Array<!JSHandle>}
   */
  args () {
    return this._args
  }

  /**
   * @return {Object}
   */
  location () {
    return this._location
  }
}

module.exports = { Page, ConsoleMessage, DefaultEnabledOptions }
