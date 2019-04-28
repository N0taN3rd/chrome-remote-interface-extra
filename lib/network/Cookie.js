const util = require('util')

/**
 * An abstraction around using the CDP and Cookies
 * @since chrome-remote-interface-extra
 */
class Cookie {
  /**
   * Creates a new Cookie from the supplied string
   * @param {!string} cookieString - String representation of a cookie 'name=value'
   * @param {!NetworkManager} networkManager
   * @param {Object} [additionalProps] - Additional values for the cookie if any
   * @return {Cookie}
   */
  static fromString (cookieString, networkManager, additionalProps) {
    const nameValue = cookieString.split('=')
    return new Cookie(
      Object.assign(
        {
          name: nameValue[0],
          value: nameValue[1]
        },
        additionalProps
      ),
      networkManager
    )
  }

  /**
   * @param {!CDPCookie} cookie
   * @param {!NetworkManager} networkManager
   */
  constructor (cookie, networkManager) {
    /**
     * @type {NetworkManager}
     * @private
     */
    this._networkManager = networkManager

    /**
     * @type {CDPCookie}
     * @private
     */
    this._cookie = cookie
  }

  /**
   * Cookie name
   * @return {string}
   */
  name () {
    return this._cookie.name
  }

  /**
   * Cookie value
   * @return {string}
   */
  value () {
    return this._cookie.value
  }

  /**
   * Cookie domain
   * @return {string}
   */
  domain () {
    return this._cookie.domain
  }

  /**
   * Cookie path
   * @return {string}
   */
  path () {
    return this._cookie.path
  }

  /**
   * Cookie expiration date as the number of seconds since the UNIX epox
   * @return {number}
   */
  expires () {
    return this._cookie.expires
  }

  /**
   * The size of the cookie
   * @return {number}
   */
  size () {
    return this._cookie.size
  }

  /**
   * True if the cookie is http-only
   * @return {boolean}
   */
  httpOnly () {
    return this._cookie.httpOnly
  }

  /**
   * True if the cookie is secure (HTTPS)
   * @return {boolean}
   */
  secure () {
    return this._cookie.secure
  }

  /**
   * True in case of session cookie
   * @return {boolean}
   */
  session () {
    return this._cookie.session
  }

  /**
   * Represents the cookie's 'SameSite' status: https://tools.ietf.org/html/draft-west-first-party-cookies
   * One of: Strict, Lax
   * @return {?string}
   */
  sameSite () {
    return this._cookie.sameSite
  }

  /**
   * @link {NetworkManager#setCookie}
   * @return {Promise<boolean>}
   */
  setCookie () {
    return this._networkManager.setCookie(this._cookie)
  }

  /**
   * Deletes this browser cookie by matching name and url or domain/path pair
   * @link {NetworkManager#deleteCookie}
   * @param {string} [forURL]
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Network#method-deleteCookies
   */
  deleteCookie (forURL) {
    return this._networkManager.deleteCookie(this, forURL)
  }

  /**
   * Modifies this cookie with the given cookie data; may overwrite equivalent cookies if they exist
   * @param {!CookieParam} modifications
   * @return {Promise<boolean>}
   */
  async modifyCookie (modifications) {
    if (!modifications) return false
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

  /**
   * @return {CDPCookie}
   */
  toJSON () {
    return this._cookie
  }

  /** @ignore */
  // eslint-disable-next-line space-before-function-paren
  [util.inspect.custom](depth, options) {
    if (depth < 0) {
      return options.stylize('[Cookie]', 'special')
    }
    const newOptions = Object.assign({}, options, {
      depth: options.depth == null ? null : options.depth - 1
    })
    const inner = util.inspect(this._cookie, newOptions)
    return `${options.stylize('Cookie', 'special')} ${inner}`
  }
}

module.exports = Cookie

/**
 * @typedef {Object} CDPCookie
 * @property {!string} name
 * @property {!string} value
 * @property {?string} [domain]
 * @property {?string} [path]
 * @property {?number} [expires]
 * @property {?number} [size]
 * @property {?boolean} [httpOnly]
 * @property {?boolean} [secure]
 * @property {?boolean} [session]
 * @property {?string} [sameSite]
 */
