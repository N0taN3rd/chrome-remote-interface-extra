const { STATUS_CODES } = require('http')
const { URL } = require('url')
const util = require('util')
const { assert, debugError, helper } = require('../helper')
const {
  NonHTTP2Protocols,
  CRLF,
  HTTP11,
  SpaceChar,
  stringifyRequestHeaders
} = require('./_shared')

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
     */
    this._frame = frame

    /**
     * @type {string}
     */
    this._interceptionId = interceptionId

    /**
     * @type {boolean}
     */
    this._allowInterception = allowInterception

    /**
     * @type {?Response}
     */
    this._response = null

    /**
     * @type {string}
     */
    this._requestId = event.requestId

    /**
     * @type {string}
     */
    this._loaderId = event.loaderId

    /**
     * @type {string}
     */
    this._documentURL = event.documentURL

    /**
     * @type {number}
     */
    this._timestamp = event.timestamp

    /**
     * @type {number}
     */
    this._wallTime = event.wallTime
    /**
     * @type {string}
     */
    this._initiator = event.initiator

    /**
     * @type {string}
     */
    this._type = event.type

    /**
     * @type {string}
     */
    this._frameId = event.frameId

    /**
     * @type {boolean}
     */
    this._hasUserGesture = event.hasUserGesture

    /** @type {Object} **/
    const rinfo = event.request

    /**
     * @type {string}
     */
    this._url = rinfo.url

    /**
     * @type {?URL}
     * @private
     */
    this._purl = null

    /**
     * @type {Object}
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
     */
    this._urlFragment = rinfo.urlFragment

    /**
     * @type {string}
     */
    this._method = rinfo.method

    /**
     * @type {?string}
     */
    this._postData = rinfo.postData

    /**
     * @type {?boolean}
     */
    this._hasPostData = rinfo.hasPostData

    /**
     * @type {?string}
     */
    this._mixedContentType = rinfo.mixedContentType

    /**
     * @type {string}
     */
    this._initialPriority = rinfo.initialPriority

    /**
     * @type {string}
     */
    this._referrerPolicy = rinfo.referrerPolicy

    /**
     * @type {boolean}
     */
    this._isLinkPreload = rinfo.isLinkPreload

    /**
     * @type {boolean}
     */
    this._isNavigationRequest =
      this._requestId === this._loaderId && this._type === 'Document'

    /**
     * @type {?string}
     */
    this._protocol = null

    /**
     * @type {!Array<!Request>}
     */
    this._redirectChain = redirectChain

    /**
     * @type {boolean}
     * @protected
     */
    this._fromMemoryCache = false

    /**
     * @type {?string}
     */
    this._failureText = null
  }

  /**
   * @param {boolean} [noHTTP2Plus] - When true if the request was made via HTTP2/HTTP3 the protocol is forced to HTTP/1.1
   * @return {string}
   */
  requestLine (noHTTP2Plus) {
    const url = this.parsedURL()
    const path = `${url.pathname}${
      url.search ? `?${url.searchParams.toString()}` : ''
    }${url.hash ? url.hash : ''}`
    let proto = this._protocol ? this._protocol : HTTP11
    if (noHTTP2Plus && !NonHTTP2Protocols.has(proto)) {
      proto = HTTP11
    }
    return `${this._method} ${path} ${proto}`
  }

  /**
   * @param {boolean} [noHTTP2Plus] - When true if the request was made via HTTP2/HTTP3 the protocol is forced to HTTP/1.1
   * @return {string}
   */
  requestLineAndHeaders (noHTTP2Plus) {
    if (!noHTTP2Plus) {
      if (this._headersText) return this._headersText
      return `${this.requestLine()}${CRLF}${stringifyRequestHeaders(
        this.headers(),
        this.parsedURL().host
      )}`
    }
    if (this._headersText) {
      const fcrlfidx = this._headersText.indexOf(CRLF)
      const fline = this._headersText.substring(0, fcrlfidx)
      const protocol = fline.substring(fline.lastIndexOf(SpaceChar) + 1)
      if (NonHTTP2Protocols.has(protocol)) {
        return this._headersText
      }
      return `${fline.replace(protocol, HTTP11)}${this._headersText.substring(
        fcrlfidx
      )}`
    }
    return `${this.requestLine(noHTTP2Plus)}${CRLF}${stringifyRequestHeaders(
      this.headers(),
      this.parsedURL().host
    )}`
  }

  /**
   * @return {string}
   */
  url () {
    return this._urlFragment != null ? this._url + this._urlFragment : this._url
  }

  /**
   * @return {URL}
   */
  parsedURL () {
    if (!this._purl) {
      this._purl = new URL(this.url())
    }
    return this._purl
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
   * @return {?{errorText: string}}
   */
  failure () {
    if (!this._failureText) return null
    return {
      errorText: this._failureText
    }
  }

  /**
   * @return {Promise<Buffer>}
   */
  async getPostData () {
    const data = await this._client.send('Network.getRequestPostData', {
      requestId: this._requestId
    })
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

  // eslint-disable-next-line space-before-function-paren
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

module.exports = { Request }
