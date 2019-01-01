const { STATUS_CODES } = require('http')
const util = require('util')
const { URL } = require('url')
const { assert, debugError, helper } = require('../helper')

class Request {
  /**
   * @param {Object} cdpClient
   * @param {Object} event
   * @param {?Object} frame
   * @param {!Array<!Request>} redirectChain
   * @param {string} interceptionId
   * @param {boolean} allowInterception
   */
  constructor (
    cdpClient,
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
    this._cdpClient = cdpClient

    /**
     * @type {?Object}
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
   * @return {?Object}
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
    const data = await this._makeNetworkDomainRequest('getRequestPostData', msg)
    return Buffer.from(data.postData, data.base64Encoded ? 'base64' : 'utf8')
  }

  /**
   * @param {!{url?: string, method?:string, postData?: string, headers?: !Object}} overrides
   */
  async continue (overrides = {}) {
    assert(this._allowInterception, 'Request Interception is not enabled!')
    assert(!this._interceptionHandled, 'Request is already handled!')
    const { url, method, postData, headers } = overrides
    this._interceptionHandled = true
    await this._makeNetworkDomainRequest('continueInterceptedRequest', {
      interceptionId: this._interceptionId,
      url,
      method,
      postData,
      headers
    }).catch(error => {
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
      for (const header of Object.keys(response.headers)) {
        responseHeaders[header.toLowerCase()] = response.headers[header]
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
    let text = statusLine + CRLF
    for (const header of Object.keys(responseHeaders)) {
      text += header + ': ' + responseHeaders[header] + CRLF
    }
    text += CRLF
    let responseBuffer = Buffer.from(text, 'utf8')
    if (responseBody) {
      responseBuffer = Buffer.concat([responseBuffer, responseBody])
    }

    await this._makeNetworkDomainRequest('continueInterceptedRequest', {
      interceptionId: this._interceptionId,
      rawResponse: responseBuffer.toString('base64')
    }).catch(error => {
      // In certain cases, protocol will return error if the request was already canceled
      // or the page was closed. We should tolerate these errors.
      debugError(error)
    })
  }

  /**
   * @param {string=} errorCode
   */
  async abort (errorCode = 'failed') {
    const errorReason = errorReasons[errorCode]
    assert(errorReason, 'Unknown error code: ' + errorCode)
    assert(this._allowInterception, 'Request Interception is not enabled!')
    assert(!this._interceptionHandled, 'Request is already handled!')
    this._interceptionHandled = true
    await this._makeNetworkDomainRequest('continueInterceptedRequest', {
      interceptionId: this._interceptionId,
      errorReason
    }).catch(error => {
      // In certain cases, protocol will return error if the request was already canceled
      // or the page was closed. We should tolerate these errors.
      debugError(error)
    })
  }

  _makeNetworkDomainRequest (method, msg) {
    if (typeof this._cdpClient[method] === 'function') {
      return this._cdpClient[method](msg)
    }
    return this._cdpClient.send(`Network.${method}`, msg)
  }

  [util.inspect.custom] (depth, options) {
    if (depth < 0) {
      return options.stylize('[Request]', 'special')
    }

    const newOptions = Object.assign({}, options, {
      depth: options.depth === null ? null : options.depth - 1
    })
    const inner = util.inspect(
      { url: this.url(), method: this._method, headers: this.headers() },
      newOptions
    )
    return `${options.stylize('Request', 'special')} ${inner}`
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

/**
 * @type {Request}
 */
module.exports = Request
