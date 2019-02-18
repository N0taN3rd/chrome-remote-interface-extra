const { STATUS_CODES } = require('http')
const util = require('util')
const { SecurityDetails } = require('./SecurityDetails')

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
     * @type {Promise<!Buffer>}
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
    const content = await this.buffer()
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

  // eslint-disable-next-line space-before-function-paren
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

module.exports = { Response }
