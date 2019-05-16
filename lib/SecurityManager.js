const util = require('util')
const EventEmitter = require('eventemitter3')
const Events = require('./Events')
const { helper, assert } = require('./helper')

/**
 * @emits {StateChanged} - The security state of the page changed
 * @extends {EventEmitter}
 * @see https://chromedevtools.github.io/devtools-protocol/tot/Security
 */
class SecurityManager extends EventEmitter {
  /**
   * Create a new instance of SecurityManager
   * @param {Chrome|CRIConnection|CDPSession|Object} client - The connection/client to be used to communicate with the remote Browser instance
   */
  constructor (client) {
    super()
    /**
     * @type {Chrome|CRIConnection|CDPSession|Object}
     * @private
     */
    this._client = client
    /**
     * @type {boolean}
     * @private
     */
    this._enabled = false

    /**
     * @type {boolean}
     * @private
     */
    this._ignoreHTTPSErrors = false

    /**
     * @type {boolean}
     * @private
     */
    this._certErrorsRequireHandling = false

    this._client.on('Security.securityStateChanged', event =>
      this.emit(Events.Security.StateChanged, event)
    )
    this._client.on(
      'Security.certificateError',
      this._onCertificateError.bind(this)
    )
  }

  /**
   * Is the domain enabled
   * @return {boolean}
   */
  get enabled () {
    return this._enabled
  }

  /**
   * Are HTTPs errors ignored
   * @return {boolean}
   */
  get ignoreHTTPSErrors () {
    return this._ignoreHTTPSErrors
  }

  /**
   * Do certificate errors require manual handling
   * @return {boolean}
   */
  get certErrorsRequireHandling () {
    return this._certErrorsRequireHandling
  }

  async initialize ({ enable, ignoreHTTPSErrors } = {}) {
    if (typeof enable === 'boolean' && enable) {
      await this.enable()
    }
    if (typeof ignoreHTTPSErrors === 'boolean') {
      await this.setIgnoreCertificateErrors(ignoreHTTPSErrors)
    }
  }

  /**
   * Enables tracking security state changes
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Security#method-enable
   */
  async enable () {
    if (this._enabled) return
    await this._client.send('Security.enable', {})
    this._enabled = true
  }

  /**
   * Disables tracking security state changes.
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Security#method-disable
   */
  async disable () {
    if (!this._enabled) return
    await this._client.send('Security.disable', {})
    this._enabled = false
  }

  /**
   * Enable/disable whether all certificate errors should be ignored
   * @param {boolean} ignore - If true, all certificate errors will be ignored.
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Security#method-setIgnoreCertificateErrors
   */
  async setIgnoreCertificateErrors (ignore) {
    assert(
      helper.isBoolean(ignore),
      `The ignore argument must be a boolean, supplied "${typeof ignore}"`
    )
    if (this._ignoreHTTPSErrors === ignore) return
    this._ignoreHTTPSErrors = ignore
    await this._client.send('Security.setIgnoreCertificateErrors', { ignore })
  }

  /**
   * Enable/disable overriding certificate errors.
   * If enabled, all certificate error events need to be handled by the DevTools client and should be answered with
   * the {@link handleCertificateError} command or the {@link handleCertificateErrorCancel} and {@link handleCertificateErrorContinue} utility methods.
   *
   * @param {boolean} override - If true, certificate errors will be overridden
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Security#method-setOverrideCertificateErrors
   */
  async setOverrideCertificateErrors (override) {
    assert(
      helper.isBoolean(override),
      `The override argument must be a boolean, supplied "${typeof override}"`
    )
    if (this._certErrorsRequireHandling === override) return
    await this._client.send('Security.setOverrideCertificateErrors', {
      override
    })
    this._certErrorsRequireHandling = override
  }

  /**
   * Handles a certificate error that fired a certificateError event
   * @param {number} eventId - The ID of the certificateError event
   * @param {CertificateErrorAction} action - The action to take on the certificate error
   * @return {Promise<void>}
   */
  async handleCertificateError (eventId, action) {
    assert(
      helper.isNumber(eventId),
      `The eventId argument must be a number, supplied "${typeof eventId}"`
    )
    assert(
      helper.isString(action),
      `The action argument must be a string, supplied "${typeof action}"`
    )
    await this._client.send('Security.handleCertificateError', {
      eventId,
      action
    })
  }

  /**
   * Allow the request that encountered the certificate error to continue
   * @param {number} eventId - The ID of the certificateError event
   * @return {Promise<void>}
   */
  async handleCertificateErrorContinue (eventId) {
    await this.handleCertificateError(eventId, 'continue')
  }

  /**
   * Cancel the request that encountered the certificate error to continue
   * @param {number} eventId - The ID of the certificateError event
   * @return {Promise<void>}
   */
  async handleCertificateErrorCancel (eventId) {
    await this.handleCertificateError(eventId, 'cancel')
  }

  /**
   * @param {!Object} event
   */
  _onCertificateError (event) {
    if (this._ignoreHTTPSErrors) return
    this.emit(Events.Security.CertificateError, event)
  }

  /** @ignore */
  // eslint-disable-next-line space-before-function-paren
  [util.inspect.custom](depth, options) {
    if (depth < 0) {
      return options.stylize('[Security]', 'special')
    }

    const newOptions = Object.assign({}, options, {
      depth: options.depth == null ? null : options.depth - 1
    })
    const inner = util.inspect(
      {
        ignoreHTTPSErrors: this._ignoreHTTPSErrors,
        enabled: this._enabled,
        certErrorsRequireHandling: this._certErrorsRequireHandling
      },
      newOptions
    )
    return `${options.stylize('Security', 'special')} ${inner}`
  }
}

module.exports = SecurityManager

/**
 * @typedef {Object} SecurityStateChangeEvent
 * @property {SecurityState} securityState - Security state
 * @property {boolean} schemeIsCryptographic - True if the page was loaded over cryptographic transport such as HTTPS
 * @property {Array<SecurityStateExplanation>} explanations - List of explanations for the security state. If the overall security state is insecure or warning, at least one corresponding explanation should be included.
 * @property {SecurityState} insecureContentStatus - Information about insecure content on the page.
 * @property {?string} [summary] - Overrides user-visible description of the state.
 **/
