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
}


module.exports = { TimeoutSettings }
