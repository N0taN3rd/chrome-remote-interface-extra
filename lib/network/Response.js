const { STATUS_CODES } = require('http')
const util = require('util')
const SecurityDetails = require('./SecurityDetails')
const {
  NonHTTP2Protocols,
  CRLF,
  HTTP11,
  SpaceChar,
  stringifyHeaders,
  headersToLowerCase
} = require('./_shared')

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
    const rinfo =
      event.redirectResponse != null ? event.redirectResponse : event.response

    /**
     * @type {string}
     * @protected
     */
    this._url = rinfo.url

    /**
     * @type {?URL}
     * @private
     */
    this._purl = null

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
    this._protocol = rinfo.protocol ? rinfo.protocol.toUpperCase() : HTTP11

    if (this._request) {
      this._request._protocol = this._protocol
      this._request._fullHeaders = this._requestHeaders
      this._request._headersText = this._requestHeadersText
    }

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
     * @type {?string}
     */
    this._securityState = rinfo.securityState

    /** @type {?SecurityDetails} */
    this._securityDetails = null
    if (rinfo.securityDetails) {
      this._securityDetails = new SecurityDetails(rinfo.securityDetails)
    }

    /**
     * @type {?function()}
     */
    this._bodyLoadedPromiseFulfill = null
    this._bodyLoadedPromise = new Promise(resolve => {
      this._bodyLoadedPromiseFulfill = resolve
    })

    /**
     * @type {Promise<Buffer>}
     */
    this._contentPromise = null

    /** @type {?Object} */
    this._headersLower = null
  }

  /**
   * @return {boolean}
   */
  ok () {
    return this._status === 0 || (this._status >= 200 && this._status <= 299)
  }

  /**
   * @param {boolean} [noHTTP2Plus] - When true if the request was made via HTTP2 the protocol is forced to HTTP/1.1
   * @return {string}
   */
  statusLine (noHTTP2Plus) {
    let proto = this._protocol
    if (noHTTP2Plus && !NonHTTP2Protocols.has(proto)) {
      proto = HTTP11
    }
    return `${proto} ${this._status} ${this.statusText()}`
  }

  /**
   * @param {boolean} [noHTTP2Plus] - When true if the request was made via HTTP2 the protocol is forced to HTTP/1.1
   * @return {string}
   */
  statusLineAndHeaders (noHTTP2Plus) {
    if (!noHTTP2Plus) {
      if (this._headersText) return this._headersText
      return `${this.statusLine()}${CRLF}${stringifyHeaders(this._headers)}`
    }
    if (this._headersText) {
      const protocol = this._headersText.substring(
        0,
        this._headersText.indexOf(SpaceChar)
      )
      if (NonHTTP2Protocols.has(protocol)) {
        return this._headersText
      }
      return this._headersText.replace(protocol, HTTP11)
    }
    return `${this.statusLine(noHTTP2Plus)}${CRLF}${stringifyHeaders(
      this._headers
    )}`
  }

  /**
   *
   * @return {string}
   */
  url () {
    return this._url
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
   * Returns the normalized (header keys lowercase) HTTP headers as sent by the browser.
   * @return {Object}
   */
  normalizedHeaders () {
    if (!this._headersLower) {
      this._headersLower = headersToLowerCase(this.headers())
    }
    return this._headersLower
  }

  /**
   * Returns the value for the supplied header (case insensitive) if it exists
   * @param {string} header
   * @return {?string}
   */
  header (header) {
    const headers = this.normalizedHeaders()
    if (headers) return headers[header.toLowerCase()]
    return null
  }

  /**
   * Returns the responses (status line and headers with CRLF) as sent by the browser if they were included with the response
   * @return {?string}
   */
  headersText () {
    return this._headersText
  }

  /**
   * Returns the full request (the one generating this response) HTTP headers as sent by the browser if they were included with the response
   * @return {?Object}
   */
  requestHeaders () {
    return this._requestHeaders
  }

  /**
   * Returns the full request's (the one generating this response) HTTP headers (request line and headers with CRLF) as sent by the browser if they were included with the response
   * @return {?string}
   */
  requestHeadersText () {
    return this._requestHeadersText
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
   * @return {boolean}
   */
  fromCache () {
    return this._fromDiskCache || this._request.fromMemoryCache()
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
   * @return {{port: number, ip: string}}
   */
  remoteAddress () {
    return { ip: this._remoteIPAddress, port: this._remotePort }
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
   * @return {?string}
   */
  securityState () {
    return this._securityState
  }

  /**
   * @return {?SecurityDetails}
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
   * @return {Promise<Buffer>}
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
   * @return {Promise<string>}
   */
  async text () {
    const content = await this.buffer()
    return content.toString('utf8')
  }

  /**
   * @return {Promise<Object>}
   */
  async json () {
    const content = await this.text()
    return JSON.parse(content)
  }

  /**
   * @return {{headers: Object, securityDetails: SecurityDetails, frameId: string, connectionReused: boolean, timing: Object, loaderId: string, encodedDataLength: number, remotePort: number, mimeType: string, type: string, headersText: ?string, securityState: string, url: string, requestHeadersText: ?string, protocol: string, requestHeaders: ?Object, fromDiskCache: boolean, fromServiceWorker: boolean, remoteIPAddress: string, requestId: string, statusText: string, timestamp: number, status: number}}
   */
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

  /** @ignore */
  // eslint-disable-next-line space-before-function-paren
  [util.inspect.custom](depth, options) {
    if (depth < 0) {
      return options.stylize('[Response]', 'special')
    }

    const newOptions = Object.assign({}, options, {
      depth: options.depth == null ? null : options.depth - 1
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

module.exports = Response
