const util = require('util')
const EventEmitter = require('eventemitter3')
const { assert } = require('../helper')

class BrowserContext extends EventEmitter {
  /**
   * @param {!Chrome|CRIConnection} connection
   * @param {!Browser} browser
   * @param {?string} contextId
   */
  constructor (connection, browser, contextId) {
    super()
    /**
     * @type {!Chrome|CRIConnection}
     * @private
     */
    this._connection = connection
    /**
     * @type {!Browser}
     * @private
     */
    this._browser = browser

    /**
     * @type {?string}
     * @private
     */
    this._id = contextId
  }

  /**
   * @return {Array<Target>} target
   */
  targets () {
    return this._browser
      .targets()
      .filter(target => target.browserContext() === this)
  }

  /**
   * @param {function(target: Target):boolean} predicate
   * @param {{timeout?: number}} [options]
   * @return {Promise<Target>}
   */
  waitForTarget (predicate, options) {
    return this._browser.waitForTarget(
      target => target.browserContext() === this && predicate(target),
      options
    )
  }

  /**
   * @return {boolean}
   */
  isIncognito () {
    return !!this._id
  }

  /**
   * @return {Promise<Page>}
   */
  newPage () {
    return this._browser._createPageInContext(this._id)
  }

  /**
   * @return {!Browser}
   */
  browser () {
    return this._browser
  }

  /**
   * @return {Promise<Array<Page>>}
   */
  async pages () {
    const pages = await Promise.all(
      this.targets()
        .filter(target => target.type() === 'page')
        .map(target => target.page())
    )
    return pages.filter(page => !!page)
  }

  /**
   * @param {string} origin
   * @param {Array<string>} permissions
   */
  async overridePermissions (origin, permissions) {
    const webPermissionToProtocol = new Map([
      ['geolocation', 'geolocation'],
      ['midi', 'midi'],
      ['notifications', 'notifications'],
      ['push', 'push'],
      ['camera', 'videoCapture'],
      ['microphone', 'audioCapture'],
      ['background-sync', 'backgroundSync'],
      ['ambient-light-sensor', 'sensors'],
      ['accelerometer', 'sensors'],
      ['gyroscope', 'sensors'],
      ['magnetometer', 'sensors'],
      ['accessibility-events', 'accessibilityEvents'],
      ['clipboard-read', 'clipboardRead'],
      ['clipboard-write', 'clipboardWrite'],
      ['payment-handler', 'paymentHandler'],
      // chrome-specific permissions we have.
      ['midi-sysex', 'midiSysex']
    ])
    permissions = permissions.map(permission => {
      const protocolPermission = webPermissionToProtocol.get(permission)
      if (!protocolPermission) {
        throw new Error('Unknown permission: ' + permission)
      }
      return protocolPermission
    })
    await this._connection.send('Browser.grantPermissions', {
      origin,
      browserContextId: this._id || undefined,
      permissions
    })
  }

  async clearPermissionOverrides () {
    await this._connection.send('Browser.resetPermissions', {
      browserContextId: this._id || undefined
    })
  }

  async close () {
    assert(this._id, 'Non-incognito profiles cannot be closed!')
    await this._browser._disposeContext(this._id)
  }

  /** @ignore */
  // eslint-disable-next-line space-before-function-paren
  [util.inspect.custom](depth, options) {
    if (depth < 0) {
      return options.stylize('[BrowserContext]', 'special')
    }

    const newOptions = Object.assign({}, options, {
      depth: options.depth === null ? null : options.depth - 1
    })
    const inner = util.inspect({ id: this._id }, newOptions)
    return `${options.stylize('BrowserContext', 'special')} ${inner}`
  }
}

/**
 * @type {BrowserContext}
 */
module.exports = BrowserContext
