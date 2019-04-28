const util = require('util')
const { assert, helper } = require('./helper')

/**
 * Audits domain allows investigation of page violations and possible improvements. EXPERIMENTAL
 * @see https://chromedevtools.github.io/devtools-protocol/tot/Audits
 * @since chrome-remote-interface-extra
 */
class Audits {
  /**
   * @param {Chrome|CRIConnection|CDPSession|Object} client
   */
  constructor (client) {
    /**
     * @type {Chrome|CRIConnection|CDPSession|Object}
     * @private
     */
    this._client = client

    /**
     * @type {Set<string>}
     */
    this._allowedEncodings = new Set(['webp', 'jpeg', 'png'])
  }

  /**
   * Returns the response body and size if it were re-encoded with the specified settings.
   * Only applies to images
   * @param {GetEncodedResponseArgs} opts
   * @return {Promise<GetEncodedResponseResults>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Audits#method-getEncodedResponse
   */
  getEncodedResponse ({ requestId, encoding, quality, sizeOnly }) {
    assert(
      helper.isString(requestId),
      `The requestId param is required and should be a string, received ${typeof requestId}`
    )
    assert(
      helper.isString(encoding),
      `The encoding param is required and should be a string, received ${typeof requestId}`
    )
    assert(
      this._allowedEncodings.has(encoding),
      `The encoding param should be one of 'webp', 'jpeg', 'png', received ${encoding}`
    )
    if (quality != null) {
      helper.assertNumberWithin(quality, 0, 1, 'quality')
    }
    if (sizeOnly != null) {
      assert(helper.isBoolean(sizeOnly), `The optional sizeOnly param should be a boolean, received ${typeof sizeOnly}`)
    }
    return this._client.send(
      'Audits.getEncodedResponse',
      Object.assign(
        { quality: 1, sizOnly: false },
        { requestId, encoding, quality, sizeOnly }
      )
    )
  }

  /** @ignore */
  // eslint-disable-next-line space-before-function-paren
  [util.inspect.custom](depth, options) {
    return options.stylize('[Audits]', 'special')
  }
}

module.exports = Audits

/**
 * @typedef {Object} GetEncodedResponseArgs
 * @property {string} requestId - Identifier of the network request to get content for
 * @property {string} encoding - The encoding to use. Allowed values: webp, jpeg, png
 * @property {number} [quality] - The quality of the encoding (0-1). (defaults to 1)
 * @property {boolean} [sizeOnly] - Whether to only return the size information (defaults to false)
 */

/**
 * @typedef {Object} GetEncodedResponseResults
 * @property {string} [body] - The encoded body as a base64 string. Omitted if sizeOnly is true.
 * @property {number} originalSize - Size before re-encoding
 * @property {number} encodedSize - Size after re-encoding
 */
