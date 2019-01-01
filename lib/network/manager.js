const EventEmitter = require('eventemitter3')
const Multimap = require('../multimap')
const { debugError } = require('../helper')
const Request = require('./request')
const Response = require('./response')

class NetworkManager extends EventEmitter {
  /**
   * @param {Object} cdpClient
   */
  constructor (cdpClient) {
    super()
    /**
     * @type {Object}
     * @private
     */
    this._cdpClient = cdpClient

    /**
     * @type {!Object}
     * @protected
     */
    this._extraHTTPHeaders = {}

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

    this._frameManager = null

    /**
     * @type {boolean}
     * @private
     */
    this._offline = false

    /**
     * @type {!Map<string, !Request>}
     */
    this._requestIdToRequest = new Map()

    this._onRequestWillBeSent = this._onRequestWillBeSent.bind(this)
    this._onRequestIntercepted = this._onRequestIntercepted.bind(this)
    this._onRequestServedFromCache = this._onRequestServedFromCache.bind(this)
    this._onResponseReceived = this._onResponseReceived.bind(this)
    this._onLoadingFinished = this._onLoadingFinished.bind(this)
    this._onLoadingFailed = this._onLoadingFailed.bind(this)

    this.RegisteredEventsToRemove = {}

    if (typeof this._cdpClient.requestWillBeSent === 'function') {
      this._cdpClient.requestWillBeSent(this._onRequestWillBeSent)
      this._cdpClient.requestIntercepted(this._onRequestIntercepted)
      this._cdpClient.requestServedFromCache(this._onRequestServedFromCache)
      this._cdpClient.responseReceived(this._onResponseReceived)
      this._cdpClient.loadingFinished(this._onLoadingFinished)
      this._cdpClient.loadingFailed(this._onLoadingFailed)
    } else {
      this._cdpClient.on('Network.requestWillBeSent', this._onRequestWillBeSent)
      this._cdpClient.on(
        'Network.requestIntercepted',
        this._onRequestIntercepted
      )
      this._cdpClient.on(
        'Network.requestServedFromCache',
        this._onRequestServedFromCache
      )
      this._cdpClient.on('Network.responseReceived', this._onResponseReceived)
      this._cdpClient.on('Network.loadingFinished', this._onLoadingFinished)
      this._cdpClient.on('Network.loadingFailed', this._onLoadingFailed)
    }
  }

  /**
   * @param {!Object} frameManager
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
    const msg = {
      offline: this._offline,
      // values of 0 remove any active throttling. crbug.com/456324#c9
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1
    }

    await this._makeNetworkDomainRequest('emulateNetworkConditions', msg)
    // if (typeof this._cdpClient.emulateNetworkConditions !== 'undefined') {
    //   await this._cdpClient.emulateNetworkConditions(msg)
    // } else {
    //   await this._cdpClient.send('Network.emulateNetworkConditions', msg)
    // }
  }

  /**
   * @param {string} userAgent
   */
  async setUserAgent (userAgent) {
    await this._makeNetworkDomainRequest('setUserAgentOverride', { userAgent })
    // if (typeof this._cdpClient.setUserAgentOverride !== 'undefined') {
    //   await this._client.setUserAgentOverride({ userAgent })
    // } else {
    //   await this._client.send('Network.setUserAgentOverride', { userAgent })
    // }
  }

  /**
   * @param {boolean} value
   */
  async setRequestInterception (value) {
    this._userRequestInterceptionEnabled = value
    await this._updateProtocolRequestInterception()
  }

  /**
   * @param {!Object<string, string>} extraHTTPHeaders
   */
  async setExtraHTTPHeaders (extraHTTPHeaders) {
    this._extraHTTPHeaders = {}
    for (const key of Object.keys(extraHTTPHeaders)) {
      this._extraHTTPHeaders[key.toLowerCase()] = extraHTTPHeaders[key]
    }
    const msg = { headers: this._extraHTTPHeaders }
    await this._makeNetworkDomainRequest('setExtraHTTPHeaders', msg)
  }

  _makeNetworkDomainRequest (method, msg) {
    if (typeof this._cdpClient[method] === 'function') {
      return this._cdpClient[method](msg)
    }
    return this._cdpClient.send(`Network.${method}`, msg)
  }

  async _updateProtocolRequestInterception () {
    const enabled = this._userRequestInterceptionEnabled || !!this._credentials
    if (enabled === this._protocolRequestInterceptionEnabled) return
    this._protocolRequestInterceptionEnabled = enabled
    const patterns = enabled ? [{ urlPattern: '*' }] : []
    const cacheArgs = { cacheDisabled: enabled }
    const reqInterceptArgs = { patterns }
    await Promise.all([
      this._makeNetworkDomainRequest('setCacheDisabled', cacheArgs),
      this._makeNetworkDomainRequest('setRequestInterception', reqInterceptArgs)
    ])
  }

  /**
   * @param {!Object} event
   */
  _onRequestWillBeSent (event) {
    if (this._protocolRequestInterceptionEnabled) {
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
      this._makeNetworkDomainRequest('continueInterceptedRequest', {
        interceptionId: event.interceptionId,
        authChallengeResponse: { response, username, password }
      }).catch(debugError)
      return
    }
    if (
      !this._userRequestInterceptionEnabled &&
      this._protocolRequestInterceptionEnabled
    ) {
      this._makeNetworkDomainRequest('continueInterceptedRequest', {
        interceptionId: event.interceptionId
      }).catch(debugError)
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
    // console.log('_onRequest', event)
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
      this._cdpClient,
      event,
      frame,
      redirectChain,
      interceptionId,
      this._userRequestInterceptionEnabled
    )
    this._requestIdToRequest.set(event.requestId, request)
    this.emit(NetworkManager.Events.Request, request)
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
    // console.log('_handleRequestRedirect', event)
    const response = new Response(this._cdpClient, request, event)
    request._response = response
    request._redirectChain.push(request)
    this._requestIdToRequest.delete(request._requestId)
    this._attemptedAuthentications.delete(request._interceptionId)
    this.emit(NetworkManager.Events.Response, response)
    this.emit(NetworkManager.Events.RequestFinished, request)
  }

  /**
   * @param {!Object} event
   */
  _onResponseReceived (event) {
    // console.log('_onResponseReceived', event)
    const request = this._requestIdToRequest.get(event.requestId)
    const response = new Response(this._cdpClient, request, event)
    if (request) {
      request._response = response
    }
    this.emit(NetworkManager.Events.Response, response)
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
    this._requestIdToRequest.delete(request._requestId)
    this._attemptedAuthentications.delete(request._interceptionId)
    this.emit(NetworkManager.Events.RequestFinished, request)
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
    this._requestIdToRequest.delete(request._requestId)
    this._attemptedAuthentications.delete(request._interceptionId)
    this.emit(NetworkManager.Events.RequestFailed, request)
  }
}

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
    for (let header of headers) {
      const headerValue = request.headers[header]
      header = header.toLowerCase()
      if (
        header === 'accept' ||
        header === 'referer' ||
        header === 'x-devtools-emulate-network-conditions-client-id' ||
        header === 'cookie'
      ) {
        continue
      }
      hash.headers[header] = headerValue
    }
  }
  return JSON.stringify(hash)
}

/**
 * @type {{Response: symbol, Request: symbol, RequestFailed: symbol, RequestFinished: symbol}}
 */
const NetworkEvents = {
  Request: Symbol('NetworkManager.request'),
  Response: Symbol('NetworkManager.response'),
  RequestFailed: Symbol('NetworkManager.requestfailed'),
  RequestFinished: Symbol('NetworkManager.requestfinished')
}

/**
 * @type {{Response: symbol, Request: symbol, RequestFailed: symbol, RequestFinished: symbol}}
 */
NetworkManager.Events = NetworkEvents

/**
 * @type {{NetworkEvents: {Response: symbol, Request: symbol, RequestFailed: symbol, RequestFinished: symbol}, NetworkManager: NetworkManager}}
 */
module.exports = { NetworkManager, NetworkEvents }
