const util = require('util')
const EventEmitter = require('eventemitter3')
const { Multimap } = require('../Multimap')
const { Events } = require('../Events')
const { assert, debugError, helper } = require('../helper')
const { Cookie } = require('./Cookie')
const { Request } = require('./Request')
const { Response } = require('./Response')
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

  // eslint-disable-next-line space-before-function-paren
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

module.exports = { NetworkManager }

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