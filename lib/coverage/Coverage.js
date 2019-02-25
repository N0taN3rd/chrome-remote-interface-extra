const CSSCoverage = require('./CSSCoverage')
const JSCoverage = require('./JSCoverage')

class Coverage {
  /**
   * @param {Chrome|CRIConnection|CDPSession|Object} client
   */
  constructor (client) {
    /**
     * @type {JSCoverage}
     * @private
     */
    this._jsCoverage = new JSCoverage(client)

    /**
     * @type {CSSCoverage}
     * @private
     */
    this._cssCoverage = new CSSCoverage(client)
  }

  /**
   * @param {!{resetOnNavigation?: boolean, reportAnonymousScripts?: boolean}} options
   */
  startJSCoverage (options) {
    return this._jsCoverage.start(options)
  }

  /**
   * @return {Promise<Array<CoverageEntry>>}
   */
  stopJSCoverage () {
    return this._jsCoverage.stop()
  }

  /**
   * @param {{resetOnNavigation?: boolean}=} [options]
   */
  startCSSCoverage (options) {
    return this._cssCoverage.start(options)
  }

  /**
   * @return {Promise<Array<CoverageEntry>>}
   */
  stopCSSCoverage () {
    return this._cssCoverage.stop()
  }
}

/**
 * @type {Coverage}
 */
module.exports = Coverage

/**
 * @typedef {Object} CoverageEntry
 * @property {string} url
 * @property {string} text
 * @property {Array<{start: number, end: number}>} ranges
 */
