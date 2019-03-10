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
   * An array of all active targets inside the browser context
   * @return {Array<Target>} target
   */
  targets () {
    return this._browser
      .targets()
      .filter(target => target.browserContext() === this)
  }

  /**
   * This searches for a target in this specific browser context.
   * @param {function(target: Target):boolean} predicate
   * @param {{timeout?: number}} [options]
   * @return {Promise<Target>}
   * @example
   * await page.evaluate(() => window.open('https://www.example.com/'))
   * const newWindowTarget = await browserContext.waitForTarget(target => target.url() === 'https://www.example.com/')
   */
  waitForTarget (predicate, options) {
    return this._browser.waitForTarget(
      target => target.browserContext() === this && predicate(target),
      options
    )
  }

  /**
   * Returns whether BrowserContext is incognito. The default browser context is the only non-incognito browser context
   * @return {boolean}
   */
  isIncognito () {
    return !!this._id
  }

  /**
   * Creates a new page in the browser context
   * @return {Promise<Page>}
   */
  newPage () {
    return this._browser._createPageInContext(this._id)
  }

  /**
   * The browser this browser context belongs to
   * @return {!Browser}
   */
  browser () {
    return this._browser
  }

  /**
   * Closes the target specified by the targetId. If the target is a page that gets closed too.
   * @param {string} targetId
   * @return {Promise<boolean>}
   * @since chrome-remote-interface-extra
   */
  closeTarget (targetId) {
    return this._browser.closeTarget(targetId)
  }

  /**
   * Get Chrome histograms. EXPERIMENTAL
   * Optional options:
   *  - query: Requested substring in name. Only histograms which have query as a substring in their name are extracted.
   *    An empty or absent query returns all histograms.
   *  - delta: If true, retrieve delta since last call
   * @param {BrowserHistogramQuery} [options]
   * @return {Promise<Array<CDPHistogram>>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Browser#method-getHistograms
   * @since chrome-remote-interface-extra
   */
  getHistograms (options) {
    return this._browser.getHistograms(options)
  }

  /**
   * Get a Chrome histogram by name. EXPERIMENTAL
   * @param {string} name - Requested histogram name
   * @param {boolean} [delta] - If true, retrieve delta since last call
   * @return {Promise<CDPHistogram>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Browser#method-getHistogram
   * @since chrome-remote-interface-extra
   */
  getHistogram (name, delta) {
    return this._browser.getHistogram(name, delta)
  }

  /**
   * Get position and size of the browser window. EXPERIMENTAL
   * @param {number} windowId
   * @return {Promise<WindowBounds>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Browser#method-getWindowBounds
   * @since chrome-remote-interface-extra
   */
  getWindowBounds (windowId) {
    return this._browser.getWindowBounds(windowId)
  }

  /**
   * Get the browser window that contains the target. EXPERIMENTAL
   * @param {string} [targetId] - Optional target id of the target to receive the window id and its bound for.
   * If called as a part of the session, associated targetId is used.
   * @return {Promise<{bounds: WindowBounds, windowId: number}>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Browser#method-getWindowForTarget
   * @since chrome-remote-interface-extra
   */
  getWindowForTarget (targetId) {
    return this._browser.getWindowForTarget(targetId)
  }

  /**
   * Set position and/or size of the browser window. EXPERIMENTAL
   * @param {number} windowId - An browser window id
   * @param {WindowBounds} bounds - New window bounds. The 'minimized', 'maximized' and 'fullscreen' states cannot be combined with 'left', 'top', 'width' or 'height'. Leaves unspecified fields unchanged.
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Browser#method-setWindowBounds
   * @since chrome-remote-interface-extra
   */
  async setWindowBounds (windowId, bounds) {
    return this._browser.setWindowBounds(windowId, bounds)
  }

  /**
   * An array of all pages inside the browser context
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
   * Inject object to the target's main frame that provides a communication channel with browser target.
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
   * @since chrome-remote-interface-extra
   */
  async exposeCDPOnTarget (targetId, bindingName) {
    await exposeCDPOnTarget(this._connection, targetId, bindingName)
  }

  /**
   * Grant specific permissions to the given origin and reject all others. EXPERIMENTAL
   * @param {string} origin - The origin these permissions will be granted for
   * @param {Array<string>} permissions - Array of permission overrides
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Browser#method-grantPermissions
   * @example
   * const context = browser.defaultBrowserContext();
   * context.overridePermissions('https://example.com', ['clipboard-read']);
   * // do stuff ..
   * context.clearPermissionOverrides();
   */
  async overridePermissions (origin, permissions) {
    await this._browser.grantPermissions(origin, permissions)
  }

  /**
   * Reset all permissions overrides for this browser context
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Browser#method-resetPermissions
   */
  async clearPermissionOverrides () {
    await this._browser.resetPermissions(this._id)
  }

  /**
   * Closes the browser context. All the targets that belong to the browser context will be closed.
   * @return {Promise<void>}
   */
  async close () {
    assert(this._id, 'Non-incognito profiles cannot be closed!')
    await this._browser._disposeContext(this._id)
  }

  /**
   * @return {string}
   */
  toString () {
    return util.inspect(this, { depth: null })
  }

  /** @ignore */
  // eslint-disable-next-line space-before-function-paren
  [util.inspect.custom](depth, options) {
    if (depth < 0) {
      return options.stylize('[BrowserContext]', 'special')
    }

    const newOptions = Object.assign({}, options, {
      depth: options.depth == null ? null : options.depth - 1
    })
    const inner = util.inspect({ id: this._id }, newOptions)
    return `${options.stylize('BrowserContext', 'special')} ${inner}`
  }
}

/**
 * @type {BrowserContext}
 */
module.exports = BrowserContext
