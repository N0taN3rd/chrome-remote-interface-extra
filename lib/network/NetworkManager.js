const util = require('util')
const EventEmitter = require('eventemitter3')
const Multimap = require('../Multimap')
const Events = require('../Events')
const Cookie = require('./Cookie')
const Request = require('./Request')
const Response = require('./Response')
const NetIdleWatcher = require('./NetworkIdleWatcher')
const TimeoutSettings = require('../TimeoutSettings')
const { assert, debugError, helper } = require('../helper')

class NetworkManager extends EventEmitter {
  /**
   * @param {Chrome|CRIConnection|CDPSession|Object} client
   * @param {TimeoutSettings} [timeoutSettings]
   */
  constructor (client, timeoutSettings) {
    super()
    /**
     * @type {Chrome|CRIConnection|CDPSession|Object}
     * @private
     */
    this._client = client
    /**
     * @type {?FrameManager}
     */
    this._frameManager = null
    /** @type {Map<string, Request>} */
    this._requestIdToRequest = new Map()
    /** @type {Map<string, Object>} */
    this._requestIdToRequestWillBeSentEvent = new Map()
    /** @type {Object<string, string>} */
    this._extraHTTPHeaders = {}
    /** @type {TimeoutSettings} */
    this._timeoutSettings = timeoutSettings || new TimeoutSettings()

    /**
     * @type {boolean}
     * @private
     */
    this._offline = false

    /**
     * @type {boolean}
     * @private
     */
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

  /**
   * @param {TimeoutSettings} toSettings
   * @since chrome-remote-interface-extra
   */
  setTimeoutSettings (toSettings) {
    if (toSettings) {
      this._timeoutSettings = toSettings
    }
  }

  /**
   * @return {!Object<string, string>}
   */
  extraHTTPHeaders () {
    return Object.assign({}, this._extraHTTPHeaders)
  }

  /**
   * Returns a promise that resolves once the network has become idle.
   * Detection of network idle considers only the number of in-flight HTTP requests
   * for the Page connected to
   * @param {NetIdleOptions} [options]
   * @return {Promise<void>}
   * @since chrome-remote-interface-extra
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
   * @param {(string|Function)} urlOrPredicate
   * @param {{timeout?: number}} [options]
   * @return {Promise<Request>}
   */
  waitForRequest (urlOrPredicate, options = {}) {
    const { timeout = this._timeoutSettings.timeout() } = options
    return helper.waitForEvent(
      this,
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
   * @param {{timeout?: number}} [options]
   * @return {Promise<Response>}
   */
  waitForResponse (urlOrPredicate, options = {}) {
    const { timeout = this._timeoutSettings.timeout() } = options
    return helper.waitForEvent(
      this,
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
   * Blocks URLs from loading. EXPERIMENTAL
   * @param {...string} urls - URL patterns to block. Wildcards ('*') are allowed
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Network#method-setBlockedURLs
   * @since chrome-remote-interface-extra
   */
  async setBlockedURLs (...urls) {
    if (urls.length === 0) return
    await this._client.send('Network.setBlockedURLs', { urls })
  }

  /**
   * Returns the DER-encoded certificate. EXPERIMENTAL
   * @param {string} origin - Origin to get certificate for
   * @return {Promise<Array<string>>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Network#method-getCertificate
   * @since chrome-remote-interface-extra
   */
  async getCertificate (origin) {
    if (!origin) return []
    const { tableNames } = await this._client.send('Network.getCertificate', {
      origin
    })
    return tableNames
  }

  /**
   * Toggles ignoring of service worker for each request. EXPERIMENTAL
   * @param {boolean} bypass - Bypass service worker and load from network
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Network#method-setBypassServiceWorker
   * @since chrome-remote-interface-extra
   */
  async bypassServiceWorker (bypass) {
    await this._client.send('Network.setBypassServiceWorker', { bypass })
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
   * @param {boolean} offline - T/F indicating offline status
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Network#method-emulateNetworkConditions
   */
  async setOfflineMode (offline) {
    if (this._offline === offline) return
    this._offline = offline
    await this._client.send('Network.emulateNetworkConditions', {
      offline: this._offline,
      // values of 0 remove any active throttling. crbug.com/456324#c9
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1
    })
  }

  /**
   * Activates emulation of network conditions
   * @param {NetworkConditions} networkConditions - The new network conditions
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Network#method-emulateNetworkConditions
   * @since chrome-remote-interface-extra
   */
  async emulateNetworkConditions (networkConditions) {
    if (!networkConditions) return
    if (typeof networkConditions.offline === 'boolean') {
      this._offline = networkConditions.offline
    }
    await this._client.send(
      'Network.emulateNetworkConditions',
      networkConditions
    )
  }

  /**
   * @param {string} userAgent - User agent to use
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Network#method-setUserAgentOverride
   */
  async setUserAgent (userAgent) {
    await this._client.send('Network.setUserAgentOverride', { userAgent })
  }

  /**
   * @param {string} acceptLanguage - Browser langugage to emulate
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Network#method-setUserAgentOverride
   * @since chrome-remote-interface-extra
   */
  async setAcceptLanguage (acceptLanguage) {
    await this._client.send('Network.setUserAgentOverride', { acceptLanguage })
  }
  /**
   * @param {string} platform - The platform navigator.platform should return
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Network#method-setUserAgentOverride
   * @since chrome-remote-interface-extra
   */
  async setNavigatorPlatform (platform) {
    await this._client.send('Network.setUserAgentOverride', { platform })
  }

  /**
   * Allows overriding user agent with the given string.
   * @param {UserAgentOverride} overrides
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Network#method-setUserAgentOverride
   */
  async setUserAgentOverride ({ userAgent, acceptLanguage, platform }) {
    assert(
      !(userAgent == null && acceptLanguage == null && platform == null),
      'Must supply a value for at least one of "userAgent, acceptLanguage, platform"'
    )
    await this._client.send('Network.setUserAgentOverride', {
      userAgent: userAgent || undefined,
      acceptLanguage: acceptLanguage || undefined,
      platform: platform || undefined
    })
  }

  /**
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Network#method-setCacheDisabled
   * @since chrome-remote-interface-extra
   */
  async disableCache () {
    if (!this._cacheEnabledState) return
    await this._setCacheDisabled(false)
  }

  /**
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Network#method-setCacheDisabled
   * @since chrome-remote-interface-extra
   */
  async enableCache () {
    if (this._cacheEnabledState) return
    await this._setCacheDisabled(true)
  }

  /**
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Network#method-clearBrowserCache
   * @since chrome-remote-interface-extra
   */
  async clearBrowserCache () {
    await this._client.send('Network.clearBrowserCache')
  }

  /**
   * Clears browser cookies
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Network#method-clearBrowserCookies
   * @since chrome-remote-interface-extra
   */
  async clearBrowserCookies () {
    await this._client.send('Network.clearBrowserCookies')
  }
  /**
   * Deletes the specified browser cookies with matching name and url or domain/path pair.
   * @param {CDPCookie|CookieToBeDeleted|string|Cookie} cookie - The cookie to be deleted
   * @param {string} [forURL]
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Network#method-deleteCookies
   * @since chrome-remote-interface-extra
   */
  async deleteCookie (cookie, forURL) {
    let deleteMe
    if (typeof cookie === 'string') {
      if (cookie.includes('=')) {
        const nameValue = cookie.split('=')
        deleteMe = { name: nameValue[0], url: forURL || undefined }
      } else {
        deleteMe = { name: cookie, url: forURL || undefined }
      }
    } else if (cookie instanceof Cookie) {
      deleteMe = {
        name: cookie.name() || undefined,
        path: cookie.path() || undefined,
        url: forURL || undefined,
        domain: cookie.domain() || undefined
      }
    } else {
      deleteMe =
        typeof forURL === 'string'
          ? Object.assign(cookie, { url: forURL })
          : cookie
    }
    await this._client.send('Network.deleteCookies', deleteMe)
  }
  /**
   * Deletes browser cookies with matching name and url or domain/path pair.
   * @param {...(CDPCookie|CookieToBeDeleted|string|Cookie)} cookies - The cookies to be deleted
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Network#method-deleteCookies
   * @since chrome-remote-interface-extra
   */
  async deleteCookies (...cookies) {
    for (let i = 0; i < cookies.length; i++) {
      await this.deleteCookie(cookies[i])
    }
  }

  /**
   * Returns all browser cookies.
   * Depending on the backend support, will return detailed cookie information in the cookies field.
   * @return {Promise<Array<Cookie>>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Network#method-getAllCookies
   * @since chrome-remote-interface-extra
   */
  async getAllCookies () {
    const { cookies } = await this._client.send('Network.getAllCookies')
    if (cookies.length === 0) return cookies
    /** @type {Array<Cookie>} */
    const browserCookies = []
    const numCookies = cookies.length
    for (let i = 0; i < numCookies; i++) {
      browserCookies.push(new Cookie(cookies[i], this))
    }
    return browserCookies
  }

  /**
   * Returns all browser cookies for the current URL.
   * Depending on the backend support, will return detailed cookie information in the cookies field.
   * @param {Array<string>} urls - The list of URLs for which applicable cookies will be fetched
   * @return {Promise<Array<Cookie>>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Network#method-getCookies
   * @since chrome-remote-interface-extra
   */
  async getCookies (urls) {
    const { cookies } = await this._client.send('Network.getCookies', { urls })
    if (cookies.length === 0) return cookies
    /** @type {Array<Cookie>} */
    const cookiesForURLs = []
    const numCookies = cookies.length
    for (let i = 0; i < numCookies; i++) {
      cookiesForURLs.push(new Cookie(cookies[i], this))
    }
    return cookiesForURLs
  }
  /**
   * Sets a cookie with the given cookie data; may overwrite equivalent cookies if they exist
   * @param {CDPCookie|CookieParam|string} cookie - The new cookie to be set
   * @return {Promise<boolean>} - T/F indicating if the cookie was set
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Network#method-setCookie
   * @since chrome-remote-interface-extra
   */
  async setCookie (cookie) {
    let setCookie
    if (typeof cookie === 'string') {
      const nameValue = cookie.split('=')
      setCookie = { name: nameValue[0], value: nameValue[1] }
    } else {
      setCookie = cookie
    }
    const results = await this._client.send('Network.setCookie', setCookie)
    return results.success
  }

  /**
   * Sets given cookies
   * @param {...(CDPCookie|CookieParam|string)} cookies
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Network#method-setCookies
   * @since chrome-remote-interface-extra
   */
  async setCookies (...cookies) {
    const cookiesToBeSet = []
    for (let i = 0; i < cookies.length; i++) {
      if (typeof cookies[i] === 'string') {
        const nameValue = cookies[i].split('=')
        cookiesToBeSet.push({ name: nameValue[0], value: nameValue[1] })
      } else {
        cookiesToBeSet.push(cookies[i])
      }
    }
    await this._client.send('Network.setCookies', { cookies: cookiesToBeSet })
  }

  /**
   * @param {boolean} value
   */
  async setRequestInterception (value) {
    this._userRequestInterceptionEnabled = value
    await this._updateProtocolRequestInterception()
  }

  async _updateProtocolRequestInterception () {
    const enabled = this._userRequestInterceptionEnabled || !!this._credentials
    if (enabled === this._protocolRequestInterceptionEnabled) {
      return
    }
    this._protocolRequestInterceptionEnabled = enabled
    const patterns = enabled ? [{ urlPattern: '*' }] : []
    await Promise.all([
      this._setCacheDisabled(enabled),
      this._client.send('Network.setRequestInterception', { patterns })
    ])
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

  /** @ignore */
  // eslint-disable-next-line space-before-function-paren
  [util.inspect.custom](depth, options) {
    if (depth < 0) {
      return options.stylize('[NetworkManager]', 'special')
    }

    const newOptions = Object.assign({}, options, {
      depth: options.depth == null ? null : options.depth - 1
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

/**
 * @type {NetworkManager}
 */
module.exports = NetworkManager

/**
 * @typedef {Object} CookieParam
 * @property {!string} name
 * @property {!string} value
 * @property {?string} [url]
 * @property {?string} [domain]
 * @property {?string} [path]
 * @property {?number} [expires]
 * @property {?boolean} [httpOnly]
 * @property {?boolean} [secure]
 * @property {?string} [sameSite]
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
 * @property {?string} [url]
 * @property {?string} [domain]
 * @property {?string} [path]
 */

/**
 * @typedef {Object} NetworkConditions
 * @property {boolean} offline
 * @property {number} latency
 * @property {number} downloadThroughput
 * @property {number}uploadThroughput
 * @property {?string} [connectionType]
 */

/**
 * @typedef {Object} UserAgentOverride
 * @property {string} userAgent
 * @property {?string} [acceptLanguage]
 * @property {?string} [platform]
 */
