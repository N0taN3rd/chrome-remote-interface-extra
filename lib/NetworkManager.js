const { STATUS_CODES } = require('http')
const util = require('util')
const { URL } = require('url')
const EventEmitter = require('eventemitter3')
const { Multimap } = require('./Multimap')
const { Events } = require('./Events')
const { assert, debugError, helper } = require('./helper')
const { NetIdleWatcher } = require('./NetworkIdleWatcher')

class NetworkManager extends EventEmitter {
  /**
   * @param {Object} client
   */
  constructor (client) {
    super()
    this._client = client
    /**
     * @type {?FrameManager}
     */
    this._frameManager = null
    /** @type {!Map<string, !Request>} */
    this._requestIdToRequest = new Map()
    /** @type {!Map<string, !Object>} */
    this._requestIdToRequestWillBeSentEvent = new Map()
    /** @type {!Object<string, string>} */
    this._extraHTTPHeaders = {}

    this._offline = false

    this._cacheEnabledState = true

    /** @type {?{username: string, password: string}} */
    this._credentials = null
    /** @type {!Set<string>} */
    this._attemptedAuthentications = new Set()
    this._userRequestInterceptionEnabled = false
    this._protocolRequestInterceptionEnabled = false
    /** @type {!Multimap<string, string>} */
    this._requestHashToRequestIds = new Multimap()
    /** @type {!Multimap<string, string>} */
    this._requestHashToInterceptionIds = new Multimap()

    this._client.on(
      'Network.requestWillBeSent',
      this._onRequestWillBeSent.bind(this)
    )
    this._client.on(
      'Network.requestIntercepted',
      this._onRequestIntercepted.bind(this)
    )
    this._client.on(
      'Network.requestServedFromCache',
      this._onRequestServedFromCache.bind(this)
    )
    this._client.on(
      'Network.responseReceived',
      this._onResponseReceived.bind(this)
    )
    this._client.on(
      'Network.loadingFinished',
      this._onLoadingFinished.bind(this)
    )
    this._client.on('Network.loadingFailed', this._onLoadingFailed.bind(this))
  }

  async bypassServiceWorker (bypass) {
    await this._client.send('Network.setBypassServiceWorker', { bypass })
  }

  /**
   *
   * @param {NetIdleOptions} [options]
   * @return {Promise<void>}
   */
  networkIdlePromise (options) {
    return NetIdleWatcher.idlePromise(this, options)
  }

  /**
   * @param {!FrameManager} frameManager
   */
  setFrameManager (frameManager) {
    this._frameManager = frameManager
  }

  /**
   * @param {?{username: string, password: string}} credentials
   */
  async authenticate (credentials) {
    this._credentials = credentials
    await this._updateProtocolRequestInterception()
  }

  /**
   * @param {!Object<string, string>} extraHTTPHeaders
   */
  async setExtraHTTPHeaders (extraHTTPHeaders) {
    this._extraHTTPHeaders = {}
    const extraHeadersKeys = Object.keys(extraHTTPHeaders)
    for (let i = 0; i < extraHeadersKeys.length; i++) {
      const key = extraHeadersKeys[i]
      const value = extraHTTPHeaders[key]
      assert(
        helper.isString(value),
        `Expected value of header "${key}" to be String, but "${typeof value}" is found.`
      )
      this._extraHTTPHeaders[key] = value
    }
    await this._client.send('Network.setExtraHTTPHeaders', {
      headers: this._extraHTTPHeaders
    })
  }

  /**
   * @return {!Object<string, string>}
   */
  extraHTTPHeaders () {
    return Object.assign({}, this._extraHTTPHeaders)
  }

  /**
   * @param {boolean} value
   */
  async setOfflineMode (value) {
    if (this._offline === value) return
    this._offline = value
    await this._client.send('Network.emulateNetworkConditions', {
      offline: this._offline,
      // values of 0 remove any active throttling. crbug.com/456324#c9
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1
    })
  }

  /**
   * @param {string} userAgent
   */
  async setUserAgent (userAgent) {
    await this._client.send('Network.setUserAgentOverride', { userAgent })
  }

  /**
   * @param {string} acceptLanguage
   */
  async setAcceptLanguage (acceptLanguage) {
    await this._client.send('Network.setUserAgentOverride', { acceptLanguage })
  }

  /**
   * @param {string} platform
   */
  async setNavigatorPlatform (platform) {
    await this._client.send('Network.setUserAgentOverride', { platform })
  }

  async setUserAgentOverride ({ userAgent, acceptLanguage, platform }) {
    assert(
      !(userAgent == null && acceptLanguage == null && platform == null),
      'Must supply a value for at least one of "userAgent, acceptLanguage, platform"'
    )
    await this._client.send('Network.setUserAgentOverride', {
      userAgent,
      acceptLanguage,
      platform
    })
  }

  async disableCache () {
    if (!this._cacheEnabledState) return
    await this._setCacheDisabled(false)
  }

  async enableCache () {
    if (this._cacheEnabledState) return
    await this._setCacheDisabled(true)
  }

  async clearBrowserCache () {
    await this._client.send('Network.clearBrowserCache')
  }

  async clearBrowserCookies () {
    await this._client.send('Network.clearBrowserCookies')
  }

  /**
   *
   * @param {!CookieToBeDeleted} cookie
   * @return {Promise<void>}
   */
  async deleteCookies (cookie) {
    await this._client.send('Network.deleteCookies', cookie)
  }

  /**
   * @desc Returns all browser cookies.
   * Depending on the backend support, will return detailed cookie information in the cookies field.
   * @return {!Promise<!Array<Cookie>>}
   */
  async getAllCookies () {
    const results = await this._client.send('Network.getAllCookies')
    /**
     * @type {Array<Cookie>}
     */
    const cookies = []
    if (results.cookies.length === 0) return cookies
    const protocolCookies = results.cookies
    const numCookies = protocolCookies.length
    for (let i = 0; i < numCookies; i++) {
      cookies.push(new Cookie(this, protocolCookies[i]))
    }
    return cookies
  }

  /**
   * @desc Returns all browser cookies for the current URL.
   * Depending on the backend support, will return detailed cookie information in the cookies field.
   * @param {Array<string>} urls
   * @return {!Promise<!Array<Cookie>>}
   */
  async getCookies (urls) {
    const results = await this._client.send('Network.getCookies', { urls })
    /**
     * @type {Array<Cookie>}
     */
    const cookies = []
    if (results.cookies.length === 0) return cookies
    const protocolCookies = results.cookies
    const numCookies = protocolCookies.length
    for (let i = 0; i < numCookies; i++) {
      cookies.push(new Cookie(this, protocolCookies[i]))
    }
    return cookies
  }

  /**
   * @param {CookieParam} cookie
   * @return {Promise<boolean>}
   */
  async setCookie (cookie) {
    const results = await this._client.send('Network.setCookie', { cookie })
    return results.success || false
  }

  /**
   *
   * @param {...CookieParam} cookies
   * @return {Promise<void>}
   */
  async setCookies (...cookies) {
    await this._client.send('Network.setCookies', { cookies })
  }

  /**
   * @param {boolean} value
   */
  async setRequestInterception (value) {
    this._userRequestInterceptionEnabled = value
    await this._updateProtocolRequestInterception()
  }

  /**
   * @param {boolean} cacheDisabled
   * @return {Promise<*>}
   * @private
   */
  _setCacheDisabled (cacheDisabled) {
    this._cacheEnabledState = cacheDisabled
    return this._client.send('Network.setCacheDisabled', {
      cacheDisabled
    })
  }

  async _updateProtocolRequestInterception () {
    const enabled = this._userRequestInterceptionEnabled || !!this._credentials
    if (enabled === this._protocolRequestInterceptionEnabled) return
    this._protocolRequestInterceptionEnabled = enabled
    const patterns = enabled ? [{ urlPattern: '*' }] : []
    await Promise.all([
      this._setCacheDisabled(enabled),
      this._client.send('Network.setRequestInterception', { patterns })
    ])
  }

  /**
   * @param {!Object} event
   */
  _onRequestWillBeSent (event) {
    // Request interception doesn't happen for data URLs with Network Service.
    if (
      this._protocolRequestInterceptionEnabled &&
      !event.request.url.startsWith('data:')
    ) {
      const requestHash = generateRequestHash(event.request)
      const interceptionId = this._requestHashToInterceptionIds.firstValue(
        requestHash
      )
      if (interceptionId) {
        this._onRequest(event, interceptionId)
        this._requestHashToInterceptionIds.delete(requestHash, interceptionId)
      } else {
        this._requestHashToRequestIds.set(requestHash, event.requestId)
        this._requestIdToRequestWillBeSentEvent.set(event.requestId, event)
      }
      return
    }
    this._onRequest(event, null)
  }

  /**
   * @param {!Object} event
   */
  _onRequestIntercepted (event) {
    if (event.authChallenge) {
      /** @type {"Default"|"CancelAuth"|"ProvideCredentials"} */
      let response = 'Default'
      if (this._attemptedAuthentications.has(event.interceptionId)) {
        response = 'CancelAuth'
      } else if (this._credentials) {
        response = 'ProvideCredentials'
        this._attemptedAuthentications.add(event.interceptionId)
      }
      const { username, password } = this._credentials || {
        username: undefined,
        password: undefined
      }
      this._client
        .send('Network.continueInterceptedRequest', {
          interceptionId: event.interceptionId,
          authChallengeResponse: { response, username, password }
        })
        .catch(debugError)
      return
    }
    if (
      !this._userRequestInterceptionEnabled &&
      this._protocolRequestInterceptionEnabled
    ) {
      this._client
        .send('Network.continueInterceptedRequest', {
          interceptionId: event.interceptionId
        })
        .catch(debugError)
    }

    const requestHash = generateRequestHash(event.request)
    const requestId = this._requestHashToRequestIds.firstValue(requestHash)
    if (requestId) {
      const requestWillBeSentEvent = this._requestIdToRequestWillBeSentEvent.get(
        requestId
      )
      this._onRequest(requestWillBeSentEvent, event.interceptionId)
      this._requestHashToRequestIds.delete(requestHash, requestId)
      this._requestIdToRequestWillBeSentEvent.delete(requestId)
    } else {
      this._requestHashToInterceptionIds.set(requestHash, event.interceptionId)
    }
  }

  /**
   * @param {!Object} event
   * @param {?string} interceptionId
   */
  _onRequest (event, interceptionId) {
    let redirectChain = []
    if (event.redirectResponse) {
      const request = this._requestIdToRequest.get(event.requestId)
      // If we connect late to the target, we could have missed the requestWillBeSent event.
      if (request) {
        this._handleRequestRedirect(request, event)
        redirectChain = request._redirectChain
      }
    }
    const frame =
      event.frameId && this._frameManager
        ? this._frameManager.frame(event.frameId)
        : null
    const request = new Request(
      this._client,
      event,
      frame,
      redirectChain,
      interceptionId,
      this._userRequestInterceptionEnabled
    )
    this._requestIdToRequest.set(event.requestId, request)
    this.emit(Events.NetworkManager.Request, request)
  }

  /**
   * @param {!Object} event
   */
  _onRequestServedFromCache (event) {
    const request = this._requestIdToRequest.get(event.requestId)
    if (request) request._fromMemoryCache = true
  }

  /**
   * @param {!Request} request
   * @param {!Object} event
   */
  _handleRequestRedirect (request, event) {
    const response = new Response(this._client, request, event)
    request._response = response
    request._redirectChain.push(request)
    response._bodyLoadedPromiseFulfill.call(
      null,
      new Error('Response body is unavailable for redirect responses')
    )
    this._requestIdToRequest.delete(request._requestId)
    this._attemptedAuthentications.delete(request._interceptionId)
    this.emit(Events.NetworkManager.Response, response)
    this.emit(Events.NetworkManager.RequestFinished, request)
  }

  /**
   * @param {!Object} event
   */
  _onResponseReceived (event) {
    const request = this._requestIdToRequest.get(event.requestId)
    // FileUpload sends a response without a matching request.
    if (!request) return
    const response = new Response(this._client, request, event)
    request._response = response
    this.emit(Events.NetworkManager.Response, response)
  }

  /**
   * @param {!Object} event
   */
  _onLoadingFinished (event) {
    const request = this._requestIdToRequest.get(event.requestId)
    // For certain requestIds we never receive requestWillBeSent event.
    // @see https://crbug.com/750469
    if (!request) return

    // Under certain conditions we never get the Network.responseReceived
    // event from protocol. @see https://crbug.com/883475
    if (request.response()) {
      request.response()._bodyLoadedPromiseFulfill.call(null)
    }
    this._requestIdToRequest.delete(request._requestId)
    this._attemptedAuthentications.delete(request._interceptionId)
    this.emit(Events.NetworkManager.RequestFinished, request)
  }

  /**
   * @param {!Object} event
   */
  _onLoadingFailed (event) {
    const request = this._requestIdToRequest.get(event.requestId)
    // For certain requestIds we never receive requestWillBeSent event.
    // @see https://crbug.com/750469
    if (!request) return
    request._failureText = event.errorText
    const response = request.response()
    if (response) {
      response._bodyLoadedPromiseFulfill.call(null)
    }
    this._requestIdToRequest.delete(request._requestId)
    this._attemptedAuthentications.delete(request._interceptionId)
    this.emit(Events.NetworkManager.RequestFailed, request)
  }

  toJSON () {
    return {
      extraHTTPHeaders: this._extraHTTPHeaders,
      ignoreHTTPSErrors: this._ignoreHTTPSErrors,
      defaultViewport: this._defaultViewport,
      offline: this._offline,
      cacheEnabledState: this._cacheEnabledState,
      credentials: this._credentials,
      userRequestInterceptionEnabled: this._userRequestInterceptionEnabled,
      protocolRequestInterceptionEnabled: this
        ._protocolRequestInterceptionEnabled
    }
  }

  [util.inspect.custom](depth, options) {
    if (depth < 0) {
      return options.stylize('[NetworkManager]', 'special')
    }

    const newOptions = Object.assign({}, options, {
      depth: options.depth === null ? null : options.depth - 1
    })
    const inner = util.inspect(
      {
        extraHTTPHeaders: this._extraHTTPHeaders,
        ignoreHTTPSErrors: this._ignoreHTTPSErrors,
        defaultViewport: this._defaultViewport,
        offline: this._offline,
        cacheEnabledState: this._cacheEnabledState,
        credentials: this._credentials,
        userRequestInterceptionEnabled: this._userRequestInterceptionEnabled,
        protocolRequestInterceptionEnabled: this
          ._protocolRequestInterceptionEnabled
      },
      newOptions
    )
    return `${options.stylize('NetworkManager', 'special')} ${inner}`
  }
}

class Request {
  /**
   * @param {Object} client
   * @param {Object} event
   * @param {?Frame} frame
   * @param {!Array<!Request>} redirectChain
   * @param {string} interceptionId
   * @param {boolean} allowInterception
   */
  constructor (
    client,
    event,
    frame,
    redirectChain,
    interceptionId,
    allowInterception
  ) {
    /**
     * @type {Object}
     * @protected
     */
    this._client = client

    /**
     * @type {?Frame}
     * @protected
     */
    this._frame = frame

    /**
     * @type {string}
     * @protected
     */
    this._interceptionId = interceptionId

    /**
     * @type {boolean}
     * @protected
     */
    this._allowInterception = allowInterception

    /**
     * @type {?Response}
     * @protected
     */
    this._response = null

    /**
     * @type {string}
     * @protected
     */
    this._requestId = event.requestId

    /**
     * @type {string}
     * @protected
     */
    this._loaderId = event.loaderId

    /**
     * @type {string}
     * @protected
     */
    this._documentURL = event.documentURL

    /**
     * @type {number}
     * @protected
     */
    this._timestamp = event.timestamp

    /**
     * @type {number}
     * @protected
     */
    this._wallTime = event.wallTime
    /**
     * @type {string}
     * @protected
     */
    this._initiator = event.initiator

    /**
     * @type {string}
     * @protected
     */
    this._type = event.type

    /**
     * @type {string}
     * @protected
     */
    this._frameId = event.frameId

    /**
     * @type {boolean}
     * @protected
     */
    this._hasUserGesture = event.hasUserGesture

    /** @type {Object} **/
    const rinfo = event.request

    /**
     * @type {string}
     * @protected
     */
    this._url = rinfo.url

    /**
     * @type {Object}
     * @protected
     */
    this._headers = rinfo.headers

    /**
     * @type {Object}
     */
    this._fullHeaders = null

    /**
     * @type {?string}
     */
    this._headersText = null

    /**
     * @type {?string}
     * @protected
     */
    this._urlFragment = rinfo.urlFragment

    /**
     * @type {string}
     * @protected
     */
    this._method = rinfo.method

    /**
     * @type {?string}
     * @protected
     */
    this._postData = rinfo.postData

    /**
     * @type {?boolean}
     * @protected
     */
    this._hasPostData = rinfo.hasPostData

    /**
     * @type {?string}
     * @protected
     */
    this._mixedContentType = rinfo.mixedContentType

    /**
     * @type {string}
     * @protected
     */
    this._initialPriority = rinfo.initialPriority

    /**
     * @type {string}
     * @protected
     */
    this._referrerPolicy = rinfo.referrerPolicy

    /**
     * @type {boolean}
     * @protected
     */
    this._isLinkPreload = rinfo.isLinkPreload

    /**
     * @type {boolean}
     * @protected
     */
    this._isNavigationRequest =
      this._requestId === this._loaderId && this._type === 'Document'

    /**
     * @type {?string}
     */
    this._protocol = null

    /**
     * @type {!Array<!Request>}
     * @protected
     */
    this._redirectChain = redirectChain

    /**
     * @type {boolean}
     * @protected
     */
    this._fromMemoryCache = false
  }

  /**
   * @param {?boolean} forceHTTP11
   * @return {string}
   */
  requestLine (forceHTTP11) {
    const proto = this._protocol ? this._protocol : 'HTTP/1.1'
    const url = new URL(this.url())
    const path = `${url.pathname}${
      url.search ? `?${url.searchParams.toString()}` : ''
    }${url.hash ? url.hash : ''}`
    return `${this._method} ${path} ${forceHTTP11 ? 'HTTP/1.1' : proto}`
  }

  /**
   * @return {string}
   */
  url () {
    return this._urlFragment != null ? this._url + this._urlFragment : this._url
  }

  /**
   *
   * @return {Object}
   */
  headers () {
    return this._fullHeaders != null ? this._fullHeaders : this._headers
  }

  /**
   *
   * @return {string}
   */
  method () {
    return this._method
  }

  /**
   *
   * @return {?string}
   */
  postData () {
    return this._postData
  }

  /**
   * @return {?Response}
   */
  response () {
    return this._response
  }

  /**
   *
   * @return {?string}
   */
  protocol () {
    return this._protocol
  }

  /**
   *
   * @return {string}
   */
  requestId () {
    return this._requestId
  }

  /**
   *
   * @return {string}
   */
  loaderId () {
    return this._loaderId
  }

  /**
   *
   * @return {string}
   */
  documentURL () {
    return this._documentURL
  }

  /**
   *
   * @return {number}
   */
  timestamp () {
    return this._timestamp
  }

  /**
   *
   * @return {number}
   */
  wallTime () {
    return this._wallTime
  }

  /**
   *
   * @return {string}
   */
  initiator () {
    return this._initiator
  }

  /**
   *
   * @return {string}
   */
  type () {
    return this._type
  }

  /**
   *
   * @return {string}
   */
  frameId () {
    return this._frameId
  }

  /**
   *
   * @return {?string}
   */
  headersText () {
    return this._headersText
  }

  /**
   *
   * @return {?string}
   */
  urlFragment () {
    return this._urlFragment
  }

  /**
   *
   * @return {?boolean}
   */
  hasPostData () {
    return this._hasPostData
  }

  /**
   *
   * @return {?string}
   */
  mixedContentType () {
    return this._mixedContentType
  }

  /**
   *
   * @return {string}
   */
  initialPriority () {
    return this._initialPriority
  }

  /**
   *
   * @return {string}
   */
  referrerPolicy () {
    return this._referrerPolicy
  }

  /**
   *
   * @return {boolean}
   */
  isNavigationRequest () {
    return this._isNavigationRequest
  }

  /**
   *
   * @return {boolean}
   */
  hasUserGesture () {
    return this._hasUserGesture
  }

  /**
   *
   * @return {?Frame}
   */
  frame () {
    return this._frame
  }

  /**
   *
   * @return {boolean}
   */
  isLinkPreload () {
    return this._isLinkPreload
  }

  /**
   * @return {!Array<!Request>}
   */
  redirectChain () {
    return this._redirectChain.slice()
  }

  /**
   * @return {boolean}
   */
  fromMemoryCache () {
    return this._fromMemoryCache
  }

  /**
   * @return {Promise<Buffer>}
   */
  async getPostData () {
    const msg = { requestId: this._requestId }
    const data = await this._client.send('Network.getRequestPostData', msg)
    return Buffer.from(data.postData, data.base64Encoded ? 'base64' : 'utf8')
  }

  /**
   * @param {!{url?: string, method?:string, postData?: string, headers?: !Object}} overrides
   */
  async continue (overrides = {}) {
    if (this._url.startsWith('data:')) return
    assert(this._allowInterception, 'Request Interception is not enabled!')
    assert(!this._interceptionHandled, 'Request is already handled!')
    const { url, method, postData, headers } = overrides
    this._interceptionHandled = true
    await this._client
      .send('Network.continueInterceptedRequest', {
        interceptionId: this._interceptionId,
        url,
        method,
        postData,
        headers
      })
      .catch(error => {
        // In certain cases, protocol will return error if the request was already canceled
        // or the page was closed. We should tolerate these errors.
        debugError(error)
      })
  }

  /**
   * @param {!{status: number, headers: Object, contentType: string, body: (string|Buffer)}} response
   */
  async respond (response) {
    // Mocking responses for dataURL requests is not currently supported.
    if (this._url.startsWith('data:')) return
    assert(this._allowInterception, 'Request Interception is not enabled!')
    assert(!this._interceptionHandled, 'Request is already handled!')
    this._interceptionHandled = true

    const responseBody =
      response.body && helper.isString(response.body)
        ? Buffer.from(/** @type {string} */ (response.body))
        : /** @type {?Buffer} */ (response.body || null)

    const responseHeaders = {}
    if (response.headers) {
      const headerKeys = Object.keys(response.headers)
      for (let i = 0; i < headerKeys.length; i++) {
        responseHeaders[headerKeys[i].toLowerCase()] =
          response.headers[headerKeys[i]]
      }
    }
    if (response.contentType) {
      responseHeaders['content-type'] = response.contentType
    }
    if (responseBody && !('content-length' in responseHeaders)) {
      responseHeaders['content-length'] = Buffer.byteLength(responseBody)
    }

    const statusCode = response.status || 200
    const statusText = STATUS_CODES[statusCode] || ''
    const statusLine = `HTTP/1.1 ${statusCode} ${statusText}`

    const CRLF = '\r\n'
    const text = [statusLine, CRLF]
    const responseHeaderKeys = Object.keys(responseHeaders)
    for (let i = 0; i < responseHeaderKeys.length; i++) {
      text.push(
        responseHeaderKeys[i],
        ': ',
        responseHeaders[responseHeaderKeys[i]],
        CRLF
      )
    }
    text.push(CRLF)
    let responseBuffer = Buffer.from(text.join(''), 'utf8')
    if (responseBody) {
      responseBuffer = Buffer.concat([responseBuffer, responseBody])
    }

    await this._client
      .send('Network.continueInterceptedRequest', {
        interceptionId: this._interceptionId,
        rawResponse: responseBuffer.toString('base64')
      })
      .catch(error => {
        // In certain cases, protocol will return error if the request was already canceled
        // or the page was closed. We should tolerate these errors.
        debugError(error)
      })
  }

  /**
   * @param {string=} errorCode
   */
  async abort (errorCode = 'failed') {
    // Request interception is not supported for data: urls.
    if (this._url.startsWith('data:')) return
    const errorReason = errorReasons[errorCode]
    assert(errorReason, 'Unknown error code: ' + errorCode)
    assert(this._allowInterception, 'Request Interception is not enabled!')
    assert(!this._interceptionHandled, 'Request is already handled!')
    this._interceptionHandled = true
    await this._client
      .send('Network.continueInterceptedRequest', {
        interceptionId: this._interceptionId,
        errorReason
      })
      .catch(error => {
        // In certain cases, protocol will return error if the request was already canceled
        // or the page was closed. We should tolerate these errors.
        debugError(error)
      })
  }

  toJSON () {
    return {
      documentURL: this._documentURL,
      frameId: this._frameId,
      fromMemoryCache: this._fromMemoryCache,
      hasPostData: this._hasPostData,
      hasUserGesture: this._hasUserGesture,
      headers: this.headers(),
      initialPriority: this._initialPriority,
      initiator: this._initiator,
      isLinkPreload: this._isLinkPreload,
      loaderId: this._loaderId,
      method: this._method,
      mixedContentType: this._mixedContentType,
      postData: this._postData,
      referrerPolicy: this._referrerPolicy,
      requestId: this._requestId,
      response: this._response,
      timestamp: this._timestamp,
      type: this._type,
      url: this._url,
      urlFragment: this._urlFragment,
      wallTime: this._wallTime
    }
  }

  [util.inspect.custom](depth, options) {
    if (depth < 0) {
      return options.stylize('[Request]', 'special')
    }

    const newOptions = Object.assign({}, options, {
      depth: options.depth === null ? null : options.depth - 1
    })
    const inner = util.inspect(
      {
        url: this.url(),
        method: this._method,
        headers: this.headers(),
        requestId: this._requestId,
        type: this._type
      },
      newOptions
    )
    return `${options.stylize('Request', 'special')} ${inner}`
  }
}

class Response {
  /**
   * @param {Object} client
   * @param {?Request} request
   * @param {Object} event
   */
  constructor (client, request, event) {
    /**
     * @type {Object}
     * @protected
     */
    this._client = client

    /**
     * @type {?Request}
     * @protected
     */
    this._request = request

    /**
     * @type {string}
     * @protected
     */
    this._requestId = request != null ? request._requestId : event.requestId

    /**
     * @type {string}
     * @protected
     */
    this._loaderId = event.loaderId

    /**
     * @type {number}
     * @protected
     */
    this._timestamp = event.timestamp

    /**
     * @type {string}
     * @protected
     */
    this._type = event.type

    /**
     * @type {string}
     * @protected
     */
    this._frameId = event.frameId

    /** @type {Object} **/
    const rinfo = event.redirectResponse
      ? event.redirectResponse
      : event.response

    /**
     * @type {string}
     * @protected
     */
    this._url = rinfo.url

    /**
     * @type {?Object}
     * @protected
     */
    this._requestHeaders = rinfo.requestHeaders

    /**
     * @type {?string}
     * @protected
     */
    this._requestHeadersText = rinfo.requestHeadersText

    if (this._request) {
      this._request._fullHeaders = this._requestHeaders
      this._request._headersText = this._requestHeadersText
    }

    /**
     * @type {Object}
     * @protected
     */
    this._headers = rinfo.headers

    /**
     * @type {?string}
     * @protected
     */
    this._headersText = rinfo.headersText

    /**
     * @type {number}
     * @protected
     */
    this._status = rinfo.status

    /**
     * @type {string}
     * @protected
     */
    this._statusText = !rinfo.statusText
      ? STATUS_CODES[this._status]
      : rinfo.statusText

    /**
     * @type {string}
     * @protected
     */
    this._protocol = rinfo.protocol
    this._request._protocol = this._protocol

    /**
     * @type {boolean}
     * @protected
     */
    this._fromDiskCache = !!rinfo.fromDiskCache

    /**
     * @type {boolean}
     * @protected
     */
    this._fromServiceWorker = !!rinfo.fromServiceWorker

    /**
     * @type {string}
     * @protected
     */
    this._mimeType = rinfo.mimeType

    /**
     * @type {string}
     * @protected
     */
    this._remoteIPAddress = rinfo.remoteIPAddress

    /**
     * @type {number}
     * @protected
     */
    this._remotePort = rinfo.remotePort

    /**
     * @type {number}
     * @protected
     */
    this._encodedDataLength = rinfo.encodedDataLength

    /**
     * @type {string}
     * @protected
     */
    this._protocol = rinfo.protocol

    /**
     * @type {boolean}
     * @protected
     */
    this._connectionReused = rinfo.connectionReused

    /**
     * @type {Object}
     * @private
     */
    this._timing = rinfo.timing

    /**
     * @type {string}
     * @protected
     */
    this._securityState = rinfo.securityState

    /**
     * @type {SecurityDetails}
     * @private
     */
    this._securityDetails = new SecurityDetails(rinfo.securityDetails)

    /**
     * @type {?function()}
     */
    this._bodyLoadedPromiseFulfill = null
    this._bodyLoadedPromise = new Promise(resolve => {
      this._bodyLoadedPromiseFulfill = resolve
    })

    /**
     * @type {?Promise<!Buffer>}
     */
    this._contentPromise = null
  }

  /**
   * @return {boolean}
   */
  ok () {
    return this._status === 0 || (this._status >= 200 && this._status <= 299)
  }

  /**
   * @param {?boolean} forceHTTP11
   * @return {string}
   */
  statusLine (forceHTTP11) {
    const proto = this._protocol ? this._protocol : 'HTTP/1.1'
    return `${forceHTTP11 ? 'HTTP/1.1' : proto} ${
      this._status
    } ${this.statusText()}`
  }

  /**
   *
   * @return {string}
   */
  url () {
    return this._url
  }

  /**
   *
   * @return {string}
   */
  protocol () {
    return this._protocol
  }

  /**
   *
   * @return {Object}
   */
  headers () {
    return this._headers
  }

  /**
   *
   * @return {?string}
   */
  headersText () {
    return this._headersText
  }

  /**
   *
   * @return {number}
   */
  status () {
    return this._status
  }

  /**
   *
   * @return {string}
   */
  statusText () {
    return this._statusText || STATUS_CODES[this._status]
  }

  /**
   *
   * @return {string}
   */
  type () {
    return this._type
  }

  /**
   *
   * @return {number}
   */
  encodedDataLength () {
    return this._encodedDataLength
  }

  /**
   *
   * @return {?Object}
   */
  requestHeaders () {
    return this._requestHeaders
  }

  /**
   * @return {?string}
   */
  requestHeadersText () {
    return this._requestHeadersText
  }

  /**
   *
   * @return {string}
   */
  frameId () {
    return this._frameId
  }

  /**
   *
   * @return {boolean}
   */
  fromDiskCache () {
    return this._fromDiskCache
  }

  /**
   *
   * @return {boolean}
   */
  fromServiceWorker () {
    return this._fromServiceWorker
  }

  /**
   *
   * @return {string}
   */
  mimeType () {
    return this._mimeType
  }

  /**
   *
   * @return {string}
   */
  remoteIPAddress () {
    return this._remoteIPAddress
  }

  /**
   *
   * @return {number}
   */
  remotePort () {
    return this._remotePort
  }

  /**
   *
   * @return {boolean}
   */
  connectionReused () {
    return this._connectionReused
  }

  /**
   *
   * @return {Object}
   */
  timing () {
    return this._timing
  }

  /**
   *
   * @return {string}
   */
  securityState () {
    return this._securityState
  }

  /**
   *
   * @return {SecurityDetails}
   */
  securityDetails () {
    return this._securityDetails
  }

  /**
   *
   * @return {string}
   */
  requestId () {
    return this._requestId
  }

  /**
   *
   * @return {string}
   */
  loaderId () {
    return this._loaderId
  }

  /**
   *
   * @return {string}
   */
  documentURL () {
    return this._request.documentURL()
  }

  /**
   *
   * @return {number}
   */
  timestamp () {
    return this._timestamp
  }

  /**
   * @return {?Request}
   */
  request () {
    return this._request
  }

  /**
   * @return {?Frame}
   */
  frame () {
    return this._request.frame()
  }

  /**
   * @return {!Promise<!Buffer>}
   */
  buffer () {
    if (!this._contentPromise) {
      this._contentPromise = this._bodyLoadedPromise.then(async error => {
        if (error) throw error
        const response = await this._client.send('Network.getResponseBody', {
          requestId: this._request._requestId
        })
        return Buffer.from(
          response.body,
          response.base64Encoded ? 'base64' : 'utf8'
        )
      })
    }
    return this._contentPromise
  }

  /**
   * @return {!Promise<string>}
   */
  async text () {
    const content = await this.body()
    return content.toString('utf8')
  }

  /**
   * @return {!Promise<!Object>}
   */
  async json () {
    const content = await this.text()
    return JSON.parse(content)
  }

  toJSON () {
    return {
      requestId: this._requestId,
      loaderId: this._loaderId,
      timestamp: this._timestamp,
      type: this._type,
      frameId: this._frameId,
      url: this._url,
      requestHeaders: this._requestHeaders,
      requestHeadersText: this._requestHeadersText,
      headers: this._headers,
      headersText: this._headersText,
      status: this._status,
      statusText: this._statusText,
      protocol: this._protocol,
      fromDiskCache: this._fromDiskCache,
      fromServiceWorker: this._fromServiceWorker,
      mimeType: this._mimeType,
      remoteIPAddress: this._remoteIPAddress,
      remotePort: this._remotePort,
      encodedDataLength: this._encodedDataLength,
      connectionReused: this._connectionReused,
      timing: this._timing,
      securityState: this._securityState,
      securityDetails: this._securityDetails
    }
  }

  [util.inspect.custom](depth, options) {
    if (depth < 0) {
      return options.stylize('[Response]', 'special')
    }

    const newOptions = Object.assign({}, options, {
      depth: options.depth === null ? null : options.depth - 1
    })
    const inner = util.inspect(
      {
        url: this._url,
        type: this._type,
        requestId: this._requestId,
        frameId: this._frameId,
        headers: this._headers,
        status: this._status,
        statusText: this.statusText(),
        protocol: this._protocol,
        mime: this._mimeType
      },
      newOptions
    )
    return `${options.stylize('Response', 'special')} ${inner}`
  }
}

class SecurityDetails {
  /**
   * @param {!Object} securityPayload
   */
  constructor (securityPayload) {
    this._securityPayload = securityPayload
  }

  /**
   * @return {string}
   */
  keyExchange () {
    return this._securityPayload.keyExchange
  }

  /**
   * @return {?string}
   */
  keyExchangeGroup () {
    return this._securityPayload.keyExchangeGroup
  }

  /**
   * @return {string}
   */
  cipher () {
    return this._securityPayload.cipher
  }

  /**
   * @return {?string}
   */
  mac () {
    return this._securityPayload.mac
  }

  /**
   * @return {string}
   */
  certificateId () {
    return this._securityPayload.certificateId
  }

  /**
   * @return {Array<string>}
   */
  sanList () {
    return this._securityPayload.sanList
  }

  /**
   * @return {string}
   */
  certificateTransparencyCompliance () {
    return this._securityPayload.certificateTransparencyCompliance
  }

  /**
   * @return {string}
   */
  signedCertificateTimestampList () {
    return this._securityPayload.signedCertificateTimestampList
  }

  /**
   * @return {string}
   */
  subjectName () {
    return this._securityPayload.subjectName
  }

  /**
   * @return {string}
   */
  issuer () {
    return this._securityPayload.issuer
  }

  /**
   * @return {number}
   */
  validFrom () {
    return this._securityPayload.validFrom
  }

  /**
   * @return {number}
   */
  validTo () {
    return this._securityPayload.validTo
  }

  /**
   * @return {string}
   */
  protocol () {
    return this._securityPayload.protocol
  }

  toJSON () {
    return this._securityPayload
  }

  [util.inspect.custom](depth, options) {
    if (depth < 0) {
      return options.stylize('[SecurityDetails]', 'special')
    }
    const newOptions = Object.assign({}, options, {
      depth: options.depth === null ? null : options.depth - 1
    })
    const inner = util.inspect(this._securityPayload, newOptions)
    return `${options.stylize('SecurityDetails', 'special')} ${inner}`
  }
}

class Cookie {
  /**
   * @param {NetworkManager} networkManager
   * @param {CDPCookie} cookie
   */
  constructor (networkManager, cookie) {
    /**
     * @type {NetworkManager}
     */
    this._networkManager = networkManager

    /**
     * @type {CDPCookie}
     * @private
     */
    this._cookie = cookie
  }

  /**
   * @return {string}
   */
  name () {
    return this._cookie.name
  }

  /**
   *
   * @return {string}
   */
  value () {
    return this._cookie.value
  }

  /**
   *
   * @return {string}
   */
  domain () {
    return this._cookie.domain
  }

  /**
   *
   * @return {string}
   */
  path () {
    return this._cookie.path
  }

  /**
   *
   * @return {number}
   */
  expires () {
    return this._cookie.expires
  }

  /**
   *
   * @return {number}
   */
  size () {
    return this._cookie.size
  }

  /**
   *
   * @return {boolean}
   */
  httpOnly () {
    return this._cookie.httpOnly
  }

  /**
   *
   * @return {boolean}
   */
  secure () {
    return this._cookie.secure
  }

  /**
   *
   * @return {boolean}
   */
  session () {
    return this._cookie.session
  }

  /**
   *
   * @return {?string}
   */
  sameSite () {
    return this._cookie.sameSite
  }

  async deleteCookie () {
    const deleteMe = { name: this._cookie.name }
    if (this._cookie.path) {
      deleteMe.path = this._cookie.path
    } else if (this._cookie.domain) {
      deleteMe.domain = this._cookie.domain
    }
    await this._networkManager.deleteCookies(deleteMe)
  }

  /**
   * @param {!CookieParam} modifications
   * @return {Promise<boolean>}
   */
  async setCookie (modifications) {
    const success = await this._networkManager.setCookie(modifications)
    if (success) {
      const keys = Object.keys(modifications)
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i]
        if (this._cookie[key]) {
          this._cookie[key] = modifications[key]
        }
      }
    }
    return success
  }

  toJSON () {
    return this._cookie
  }

  [util.inspect.custom](depth, options) {
    if (depth < 0) {
      return options.stylize('[Cookie]', 'special')
    }
    const newOptions = Object.assign({}, options, {
      depth: options.depth === null ? null : options.depth - 1
    })
    const inner = util.inspect(this._cookie, newOptions)
    return `${options.stylize('Cookie', 'special')} ${inner}`
  }
}

const errorReasons = {
  aborted: 'Aborted',
  accessdenied: 'AccessDenied',
  addressunreachable: 'AddressUnreachable',
  blockedbyclient: 'BlockedByClient',
  blockedbyresponse: 'BlockedByResponse',
  connectionaborted: 'ConnectionAborted',
  connectionclosed: 'ConnectionClosed',
  connectionfailed: 'ConnectionFailed',
  connectionrefused: 'ConnectionRefused',
  connectionreset: 'ConnectionReset',
  internetdisconnected: 'InternetDisconnected',
  namenotresolved: 'NameNotResolved',
  timedout: 'TimedOut',
  failed: 'Failed'
}

const IGNORED_HEADERS = new Set([
  'accept',
  'referer',
  'x-devtools-emulate-network-conditions-client-id',
  'cookie',
  'origin',
  'content-type',
  'intervention'
])

/**
 * @param {!Object} request
 * @return {string}
 */
function generateRequestHash (request) {
  let normalizedURL = request.url
  try {
    // Decoding is necessary to normalize URLs. @see crbug.com/759388
    // The method will throw if the URL is malformed. In this case,
    // consider URL to be normalized as-is.
    normalizedURL = decodeURI(request.url)
  } catch (e) {}
  const hash = {
    url: normalizedURL,
    method: request.method,
    postData: request.postData,
    headers: {}
  }

  if (!normalizedURL.startsWith('data:')) {
    const headers = Object.keys(request.headers)
    headers.sort()
    for (let i = 0; i < headers.length; i++) {
      const header = headers[i].toLowerCase()
      if (IGNORED_HEADERS.has(header)) continue
      hash.headers[header] = request.headers[header]
    }
  }
  return JSON.stringify(hash)
}

module.exports = { NetworkManager, Request, Response, Cookie, SecurityDetails }

/**
 * @typedef {Object} CDPCookie
 * @property {string} name
 * @property {string} value
 * @property {string} domain
 * @property {string} path
 * @property {number} expires
 * @property {number} size
 * @property {boolean} httpOnly
 * @property {boolean} secure
 * @property {boolean} session
 * @property {?string} sameSite
 */

/**
 * @typedef {Object} CookieParam
 * @property {!string} name
 * @property {!string} value
 * @property {?string} url
 * @property {?string} domain
 * @property {?string} path
 * @property {?number} expires
 * @property {?boolean} httpOnly
 * @property {?boolean} secure
 * @property {?string} sameSite
 */

/**
 * @typedef {Object} ModifyCookieParam
 * @property {?string} name
 * @property {?string} value
 * @property {?string} url
 * @property {?string} domain
 * @property {?string} path
 * @property {?number} expires
 * @property {?boolean} httpOnly
 * @property {?boolean} secure
 * @property {?string} sameSite
 */

/**
 * @typedef {Object} CookieToBeDeleted
 * @property {string} name
 * @property {?string} url
 * @property {?string} domain
 * @property {?string} path
 */
