const util = require('util')
const DEFAULT_TIMEOUT = 30000

class TimeoutSettings {
  constructor () {
    /**
     * The default timeout used for waits
     * @type {?number}
     * @private
     */
    this._defaultTimeout = null

    /**
     * The default timeout used for navigation
     * @type {?number}
     * @private
     */
    this._defaultNavigationTimeout = null
  }

  /**
   * Set the default timeout used for waits
   * @param {number} timeout
   */
  setDefaultTimeout (timeout) {
    this._defaultTimeout = timeout
  }

  /**
   * Set the default timeout used for navigation
   * @param {number} timeout
   */
  setDefaultNavigationTimeout (timeout) {
    this._defaultNavigationTimeout = timeout
  }

  /**
   * Retrieve the timeout amount used for navigation
   * @return {number}
   */
  navigationTimeout () {
    if (this._defaultNavigationTimeout != null) {
      return this._defaultNavigationTimeout
    }
    if (this._defaultTimeout != null) {
      return this._defaultTimeout
    }
    return DEFAULT_TIMEOUT
  }

  /**
   * Retrieve the timeout amount used for waits
   * @return {number}
   */
  timeout () {
    if (this._defaultTimeout != null) {
      return this._defaultTimeout
    }
    return DEFAULT_TIMEOUT
  }

  /** @ignore */
  // eslint-disable-next-line space-before-function-paren
  [util.inspect.custom](depth, options) {
    if (depth < 0) {
      return options.stylize('[TimeoutSettings]', 'special')
    }

    const newOptions = Object.assign({}, options, {
      depth: options.depth == null ? null : options.depth - 1
    })
    const inner = util.inspect(
      {
        navigationTimeout: this.navigationTimeout(),
        timeout: this.timeout()
      },
      newOptions
    )
    return `${options.stylize('TimeoutSettings', 'special')} ${inner}`
  }
}

/**
 * @type {TimeoutSettings}
 */
module.exports = TimeoutSettings
