const util = require('util')
const EventEmitter = require('eventemitter3')
const Events = require('../Events')
const { helper, assert, debugError } = require('../helper')
const { headersArray } = require('./_shared')

/**
 * Enumeration of allowed error reasons
 * @type {{timedOut: string, blockedByResponse: string, aborted: string, connectionAborted: string, failed: string, connectionFailed: string, connectionReset: string, connectionRefused: string, accessDenied: string, connectionClosed: string, internetDisconnected: string, blockedByClient: string, nameNotResolved: string, addressUnreachable: string}}
 */
const ErrorReasons = (exports.ErrorReasons = {
  failed: 'Failed',
  aborted: 'Aborted',
  timedOut: 'TimedOut',
  accessDenied: 'AccessDenied',
  connectionClosed: 'ConnectionClosed',
  connectionReset: 'ConnectionReset',
  connectionRefused: 'ConnectionRefused',
  connectionAborted: 'ConnectionAborted',
  connectionFailed: 'ConnectionFailed',
  nameNotResolved: 'NameNotResolved',
  internetDisconnected: 'InternetDisconnected',
  addressUnreachable: 'AddressUnreachable',
  blockedByClient: 'BlockedByClient',
  blockedByResponse: 'BlockedByResponse'
})

/**
 * Enumeration of allowed auth challenge sources
 * @type {{server: string, proxy: string}}
 */
exports.AuthChallengeSources = {
  server: 'Server',
  proxy: 'Proxy'
}

/**
 * Enumeration of allowed auth challenge responses
 * @type {{default: string, provideCredentials: string, cancelAuth: string}}
 */
exports.AuthChallengeResponses = {
  default: 'Default',
  cancelAuth: 'CancelAuth',
  provideCredentials: 'ProvideCredentials'
}

/**
 * @see https://chromedevtools.github.io/devtools-protocol/tot/Fetch
 * @extends {EventEmitter}
 */
class Fetch extends EventEmitter {
  /**
   * Create a new instance of Fetch
   * @param {Chrome|CRIConnection|CDPSession|Object} client - The connection/client to be used to communicate with the remote Browser instance
   */
  constructor (client) {
    super()
    /**
     * @type {boolean}
     * @private
     */
    this._enabled = false

    /**
     * @type {Chrome|CRIConnection|CDPSession|Object}
     * @private
     */
    this._client = client

    /**
     * @type {boolean}
     * @private
     */
    this._handlingAuthRequests = false

    /**
     * @type {?Array<RequestPattern>}
     * @private
     */
    this._requestPatterns = null

    /**
     * @type {Set<string>}
     * @private
     */
    this._validErrorReasons = new Set(Object.values(ErrorReasons))

    this._client.on('Fetch.requestPaused', event =>
      this.emit(Events.Fetch.requestPaused, event)
    )
    this._client.on('Fetch.authRequired', event =>
      this.emit(Events.Fetch.authRequired, event)
    )
  }

  /**
   * @return {boolean}
   */
  get enabled () {
    return this._enabled
  }

  /**
   * If true, authRequired events will be issued and requests will be paused expecting a call to continueWithAuth
   * @return {boolean}
   */
  get handlingAuthRequests () {
    return this._handlingAuthRequests
  }

  /**
   * An array specifying the requests that will be intercepted via pattern
   * @return {?Array<RequestPattern>}
   */
  get requestPatterns () {
    return this._requestPatterns
  }

  /**
   * Enables issuing of requestPaused events.
   * A request will be paused until client calls one of failRequest, fulfillRequest or continueRequest/continueWithAuth.
   * @param {FetchEnableOpts} [opts]
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Fetch#method-enable
   */
  async enable ({ patterns, handleAuthRequests }) {
    const opts = {}
    if (patterns) {
      assert(
        Array.isArray(patterns),
        `The patterns option must be an Array, received ${typeof patterns}`
      )
      assert(
        patterns.every(pattern => helper.isString(pattern.urlPattern)),
        `The patterns option be an Array of objects with the urlPattern property, one does not`
      )
      opts.patterns = patterns
      this._requestPatterns = patterns
    }
    if (handleAuthRequests && helper.isBoolean(handleAuthRequests)) {
      opts.handleAuthRequests = handleAuthRequests
      this._handlingAuthRequests = handleAuthRequests
    }
    await this._client.send('Fetch.enable', opts)
    this._enabled = true
  }

  /**
   * Disables the fetch domain.
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Fetch#method-disable
   */
  async disable () {
    if (!this._enabled) return
    await this._client.send('Fetch.disable', {})
    this._enabled = false
  }

  /**
   * Utility method for continuing an intercepted request ({@link continueRequest})
   * @param {ContinueOpts} opts
   */
  async continue (opts) {
    await this.continueRequest({
      requestId: opts.interceptionId,
      url: opts.url || undefined,
      method: opts.method || undefined,
      postData: opts.postData || undefined,
      headers: opts.headers ? headersArray(opts.headers) : undefined
    }).catch(error => {
      // In certain cases, protocol will return error if the request was already canceled
      // or the page was closed. We should tolerate these errors.
      debugError(error)
    })
  }

  /**
   * Utility method for modifying the response to an intercepted request ({@link fulfillRequest})
   * @param {RespondOpts} opts
   */
  async respond (opts) {
    const responseBody =
      opts.body && helper.isString(opts.body)
        ? Buffer.from(opts.body)
        : opts.body || null
    const responseHeaders = {}
    if (opts.headers) {
      for (const header of Object.keys(opts.headers)) {
        responseHeaders[header.toLowerCase()] = opts.headers[header]
      }
    }
    if (opts.contentType) {
      responseHeaders['content-type'] = opts.contentType
    }
    if (responseBody && !('content-length' in responseHeaders)) {
      responseHeaders['content-length'] = String(
        Buffer.byteLength(responseBody)
      )
    }
    await this.fulfillRequest({
      requestId: opts.interceptionId,
      responseCode: opts.status || 200,
      responseHeaders: headersArray(responseHeaders),
      body: responseBody ? responseBody.toString('base64') : undefined
    }).catch(error => {
      // In certain cases, protocol will return error if the request was already canceled
      // or the page was closed. We should tolerate these errors.
      debugError(error)
    })
  }

  /**
   * Utility method for aborting an intercepted request ({@link failRequest})
   * @param {AbortOpts} opts
   */
  async abort (opts) {
    const errorReason = this._validErrorReasons.has(opts.errorCode)
      ? opts.errorCode
      : Fetch.ErrorReasons[opts.errorCode]
    assert(errorReason, `Unknown error code: ${opts.errorCode}`)
    await this.failRequest({
      requestId: opts.interceptionId,
      errorReason
    }).catch(error => {
      // In certain cases, protocol will return error if the request was already canceled
      // or the page was closed. We should tolerate these errors.
      debugError(error)
    })
  }

  /**
   * Causes the request to fail with specified reason
   * @param {FailRequestOpts} opts
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Fetch#method-failRequest
   */
  async failRequest (opts) {
    if (!opts.errorReason) {
      opts.errorReason = 'Failed'
    }
    await this._client.send('Fetch.failRequest', opts)
  }

  /**
   * Provides response to the request
   * @param {RequestFulfillmentOpts} opts
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Fetch#method-fulfillRequest
   */
  async fulfillRequest (opts) {
    await this._client.send('Fetch.fulfillRequest', opts)
  }

  /**
   * Continues the request, optionally modifying some of its parameters
   * @param {RequestContinueOpts} opts
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Fetch#method-continueRequest
   */
  async continueRequest (opts) {
    await this._client.send('Fetch.continueRequest', opts)
  }

  /**
   * Continues a request supplying authChallengeResponse following authRequired event
   * @param {CDPRequestId} requestId - An id the client received in authRequired event
   * @param {CDPAuthChallengeResponse} authChallengeResponse - Response to with an authChallenge
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Fetch#method-continueWithAuth
   */
  async continueWithAuth (requestId, authChallengeResponse) {
    await this._client.send('Fetch.continueWithAuth', {
      requestId,
      authChallengeResponse
    })
  }

  /**
   * Returns a handle to the stream representing the response body.
   * The request must be paused in the HeadersReceived stage.
   * Note that after this command the request can't be continued as is -- client either needs to cancel it or to provide the response body.
   * The stream only supports sequential read, IO.read will fail if the position is specified.
   * This method is mutually exclusive with getResponseBody.
   * Calling other methods that affect the request or disabling fetch domain before body is received results in an undefined behavior.
   * @param {CDPRequestId} requestId - An id the client received in authRequired event
   * @return {Promise<CDPStreamHandle>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Fetch#method-takeResponseBodyAsStream
   */
  async takeResponseBodyAsStream (requestId) {
    const { stream } = await this._client.send(
      'Fetch.takeResponseBodyAsStream',
      { requestId }
    )
    return stream
  }

  /**
   * Causes the body of the response to be received from the server and returned as a single string.
   * May only be issued for a request that is paused in the Response stage and is mutually exclusive with takeResponseBodyForInterceptionAsStream.
   * Calling other methods that affect the request or disabling fetch domain before body is received results in an undefined behavior
   * @param {CDPRequestId} requestId - An id the client received in authRequired event
   * @return {Promise<{body: string, base64Encoded: boolean}>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Fetch#method-getResponseBody
   */
  getResponseBody (requestId) {
    return this._client.send('Fetch.getResponseBody', { requestId })
  }

  /** @ignore */
  // eslint-disable-next-line space-before-function-paren
  [util.inspect.custom](depth, options) {
    if (depth < 0) {
      return options.stylize('[Fetch]', 'special')
    }

    const newOptions = Object.assign({}, options, {
      depth: options.depth == null ? null : options.depth - 1
    })
    const inner = util.inspect(
      {
        enabled: this._enabled,
        requestPatterns: this._requestPatterns,
        handlingAuthRequests: this._handlingAuthRequests
      },
      newOptions
    )
    return `${options.stylize('Fetch', 'special')} ${inner}`
  }
}

exports.Fetch = Fetch

/**
 * @typedef {Object} FetchEnableOpts
 * @property {Array<RequestPattern>} patterns - If specified, only requests matching any of these patterns will produce fetchRequested event and will be paused until clients response. If not set, all requests will be affected.
 * @property {boolean} [handleAuthRequests] - If true, authRequired events will be issued and requests will be paused expecting a call to continueWithAuth.
 */

/**
 * @typedef {Object} RequestFulfillmentOpts
 * @property {CDPRequestId} requestId - An id the client received in requestPaused event
 * @property {number} responseCode - An HTTP response code
 * @property {Array<CDPHeaderEntry>} responseHeaders - Response headers
 * @property {string} [body] - A response body
 * @property {string} [responsePhrase] - A textual representation of responseCode. If absent, a standard phrase mathcing responseCode is used
 */

/**
 * @typedef {Object} RequestContinueOpts
 * @property {CDPRequestId} requestId - An id the client received in requestPaused event
 * @property {?string} [url] - If set, the request url will be modified in a way that's not observable by page
 * @property {?string} [method] - If set, the request method is overridden
 * @property {?string} [postData] - If set, overrides the post data in the request
 * @property {?Array<CDPHeaderEntry>} [headers] - If set, overrides the request headers
 */

/**
 * @typedef {Object} FailRequestOpts
 * @property {CDPRequestId} requestId - An id the client received in requestPaused event
 * @property {CDPNetworkErrorReason} [errorReason = Failed] - Causes the request to fail with the given reason
 */

/**
 * @typedef {Object} ContinueOpts
 * @property {string} interceptionId - The interception id
 * @property {?string} [url] - The new URL for the request
 * @property {?string} [method] - The new HTTP method for the request
 * @property {?string} [postData] - The POST body
 * @property {?number} [status] - The HTTP status for the response
 * @property {?InterceptionHeaders} [headers] - New HTTP headers for the request
 */

/**
 * @typedef {Object} RespondOpts
 * @property {string} interceptionId - The interception id
 * @property {?number} [status] - The HTTP status for the response
 * @property {?InterceptionHeaders} headers - The HTTP headers for the response
 * @property {string} [contentType] - Optional value for the content type of the response, must be supplied if not included in headers
 * @property {string|Buffer} [body] - Optional response body
 */

/**
 * @typedef {Object} AbortOpts
 * @property {string} interceptionId - The interception id
 * @property {string} errorCode - The interception id
 */

/**
 * @typedef {Object|Array<CDPHeaderEntry>} InterceptionHeaders
 */
