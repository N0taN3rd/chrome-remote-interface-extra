const util = require('util')

class SecurityDetails {
  /**
   * @param {CDPSecurityDetails} securityPayload
   */
  constructor (securityPayload) {
    /**
     * @type {CDPSecurityDetails}
     * @private
     */
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
   * @return {Array<CDPSignedCertificateTimestamp>}
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

  /**
   * @return {!Object}
   */
  toJSON () {
    return this._securityPayload
  }

  /** @ignore */
  // eslint-disable-next-line space-before-function-paren
  [util.inspect.custom](depth, options) {
    if (depth < 0) {
      return options.stylize('[SecurityDetails]', 'special')
    }
    const newOptions = Object.assign({}, options, {
      depth: options.depth == null ? null : options.depth - 1
    })
    const inner = util.inspect(this._securityPayload, newOptions)
    return `${options.stylize('SecurityDetails', 'special')} ${inner}`
  }
}

/**
 * @type {SecurityDetails}
 */
module.exports = SecurityDetails
