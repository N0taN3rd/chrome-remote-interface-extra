const util = require('util')

class Cookie {
  /**
   * @param {NetworkManager} networkManager
   * @param {CDPCookie} cookie
   */
  constructor (networkManager, cookie) {
    /**
     * @type {NetworkManager}
     */
    this._networkManager = networkManager

    /**
     * @type {CDPCookie}
     */
    this._cookie = cookie
  }

  /**
   * @return {string}
   */
  name () {
    return this._cookie.name
  }

  /**
   *
   * @return {string}
   */
  value () {
    return this._cookie.value
  }

  /**
   *
   * @return {string}
   */
  domain () {
    return this._cookie.domain
  }

  /**
   *
   * @return {string}
   */
  path () {
    return this._cookie.path
  }

  /**
   *
   * @return {number}
   */
  expires () {
    return this._cookie.expires
  }

  /**
   *
   * @return {number}
   */
  size () {
    return this._cookie.size
  }

  /**
   *
   * @return {boolean}
   */
  httpOnly () {
    return this._cookie.httpOnly
  }

  /**
   *
   * @return {boolean}
   */
  secure () {
    return this._cookie.secure
  }

  /**
   *
   * @return {boolean}
   */
  session () {
    return this._cookie.session
  }

  /**
   *
   * @return {?string}
   */
  sameSite () {
    return this._cookie.sameSite
  }

  async deleteCookie () {
    const deleteMe = { name: this._cookie.name }
    if (this._cookie.path) {
      deleteMe.path = this._cookie.path
    } else if (this._cookie.domain) {
      deleteMe.domain = this._cookie.domain
    }
    await this._networkManager.deleteCookies(deleteMe)
  }

  /**
   * @param {!CookieParam} modifications
   * @return {Promise<boolean>}
   */
  async setCookie (modifications) {
    const success = await this._networkManager.setCookie(modifications)
    if (success) {
      const keys = Object.keys(modifications)
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i]
        if (this._cookie[key]) {
          this._cookie[key] = modifications[key]
        }
      }
    }
    return success
  }

  toJSON () {
    return this._cookie
  }

  // eslint-disable-next-line space-before-function-paren
  [util.inspect.custom](depth, options) {
    if (depth < 0) {
      return options.stylize('[Cookie]', 'special')
    }
    const newOptions = Object.assign({}, options, {
      depth: options.depth === null ? null : options.depth - 1
    })
    const inner = util.inspect(this._cookie, newOptions)
    return `${options.stylize('Cookie', 'special')} ${inner}`
  }
}

module.exports = { Cookie }

/**
 * @typedef {Object} CDPCookie
 * @property {string} name
 * @property {string} value
 * @property {string} domain
 * @property {string} path
 * @property {number} expires
 * @property {number} size
 * @property {boolean} httpOnly
 * @property {boolean} secure
 * @property {boolean} session
 * @property {?string} sameSite
 */
