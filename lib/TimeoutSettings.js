const util = require('util')
const DEFAULT_TIMEOUT = 30000

class TimeoutSettings {
  constructor () {
    this._defaultTimeout = null
    this._defaultNavigationTimeout = null
  }

  /**
   * @param {number} timeout
   */
  setDefaultTimeout (timeout) {
    this._defaultTimeout = timeout
  }

  /**
   * @param {number} timeout
   */
  setDefaultNavigationTimeout (timeout) {
    this._defaultNavigationTimeout = timeout
  }

  /**
   * @return {number}
   */
  navigationTimeout () {
    if (this._defaultNavigationTimeout !== null) {
      return this._defaultNavigationTimeout
    }
    if (this._defaultTimeout !== null) {
      return this._defaultTimeout
    }
    return DEFAULT_TIMEOUT
  }

  timeout () {
    if (this._defaultTimeout !== null) {
      return this._defaultTimeout
    }
    return DEFAULT_TIMEOUT
  }

  // eslint-disable-next-line space-before-function-paren
  [util.inspect.custom](depth, options) {
    if (depth < 0) {
      return options.stylize('[TimeoutSettings]', 'special')
    }

    const newOptions = Object.assign({}, options, {
      depth: options.depth === null ? null : options.depth - 1
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

module.exports = { TimeoutSettings }
