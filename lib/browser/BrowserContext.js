const util = require('util')
const EventEmitter = require('eventemitter3')
const { assert } = require('../helper')
const { exposeCDPOnTarget } = require('../__shared')

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
   * @desc Closes the target specified by the targetId. If the target is a page that gets closed too.
   * @param {string} targetId
   * @return {Promise<boolean>}
   */
  closeTarget (targetId) {
    return this._browser.closeTarget(targetId)
  }

  /**
   * @desc Get Chrome histograms. EXPERIMENTAL
   * Optional options:
   *  - query: Requested substring in name. Only histograms which have query as a substring in their name are extracted.
   *    An empty or absent query returns all histograms.
   *  - delta: If true, retrieve delta since last call
   * @param {BrowserHistogramQuery} [options]
   * @return {Promise<Object>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Browser#method-getHistograms
   */
  getHistograms (options) {
    return this._browser.getHistograms(options)
  }

  /**
   * @desc Get a Chrome histogram by name. EXPERIMENTAL
   * @param {string} name - Requested histogram name
   * @param {boolean} [delta] - If true, retrieve delta since last call
   * @return {Promise<Object>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Browser#method-getHistogram
   */
  getHistogram (name, delta) {
    return this._browser.getHistogram(name, delta)
  }

  /**
   * @desc Get position and size of the browser window. EXPERIMENTAL
   * @param {number} windowId
   * @return {Promise<WindowBounds>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Browser#method-getWindowBounds
   */
  getWindowBounds (windowId) {
    return this._browser.getWindowBounds(windowId)
  }

  /**
   * @desc Get the browser window that contains the target. EXPERIMENTAL
   * @param {string} [targetId] - Optional target id of the target to receive the window id and its bound for.
   * If called as a part of the session, associated targetId is used.
   * @return {Promise<{bounds: WindowBounds, windowId: number}>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Browser#method-getWindowForTarget
   */
  getWindowForTarget (targetId) {
    return this._browser.getWindowForTarget(targetId)
  }

  /**
   * @desc Set position and/or size of the browser window. EXPERIMENTAL
   * @param {number} windowId - An browser window id
   * @param {WindowBounds} bounds - New window bounds. The 'minimized', 'maximized' and 'fullscreen' states cannot be combined with 'left', 'top', 'width' or 'height'. Leaves unspecified fields unchanged.
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Browser#method-setWindowBounds
   */
  async setWindowBounds (windowId, bounds) {
    return this._browser.setWindowBounds(windowId, bounds)
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
   * @desc Inject object to the target's main frame that provides a communication channel with browser target.
   *
   * Injected object will be available as window[bindingName].
   *
   * The object has the following API:
   *  * binding.send(json) - a method to send messages over the remote debugging protocol
   *  * binding.onmessage = json => handleMessage(json) - a callback that will be called for the protocol notifications and command responses.
   *
   * EXPERIMENTAL
   * @param {string} targetId
   * @param {string} [bindingName] - Binding name, 'cdp' if not specified
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Target#method-exposeDevToolsProtocol
   */
  async exposeCDPOnTarget (targetId, bindingName) {
    await exposeCDPOnTarget(this._connection, targetId, bindingName)
  }

  /**
   * @desc Grant specific permissions to the given origin and reject all others. EXPERIMENTAL
   * @param {string} origin - The origin these permissions will be granted for
   * @param {Array<string>} permissions - Array of permission overrides
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Browser#method-grantPermissions
   */
  async overridePermissions (origin, permissions) {
    await this._browser.grantPermissions(origin, permissions)
  }

  /**
   * @desc Reset all permissions overrides for this browser context
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Browser#method-resetPermissions
   */
  async clearPermissionOverrides () {
    await this._browser.resetPermissions(this._id)
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
