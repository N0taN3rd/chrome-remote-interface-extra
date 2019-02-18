/* eslint-env node, browser */
const util = require('util')
const { helper } = require('../helper')
const { DOMWorld } = require('../DOMWorld')

/**
 * @unrestricted
 */
class Frame {
  /**
   *
   * @param {FrameManager} frameManager
   * @param {Object} cdpFrame
   * @param {Frame} [parentFrame]
   * @return {Frame}
   */
  static fromCDPFrame (frameManager, cdpFrame, parentFrame) {
    const frame = new Frame(
      frameManager,
      frameManager._client,
      parentFrame,
      cdpFrame.id
    )
    frame._loaderId = cdpFrame.loaderId || ''
    frame._url = cdpFrame.url || ''
    frame._name = cdpFrame.name || ''
    frame._mimeType = cdpFrame.mimeType
    frame._unreachableUrl = cdpFrame.unreachableUrl
    frame._securityOrigin = cdpFrame.securityOrigin
    return frame
  }

  /**
   * @param {!FrameManager} frameManager
   * @param {!Chrome|CRIConnection|CDPSession|Object} client
   * @param {?Frame} parentFrame
   * @param {string} frameId
   */
  constructor (frameManager, client, parentFrame, frameId) {
    this._frameManager = frameManager
    this._client = client
    this._parentFrame = parentFrame
    this._id = frameId
    this._detached = false
    this._url = ''
    this._loaderId = ''

    /**
     * @type {?string}
     */
    this._navigationURL = null

    /**
     * @type {?string}
     */
    this._parentId = parentFrame != null ? parentFrame.id() : null

    /**
     * @type {?string}
     */
    this._securityOrigin = null

    /**
     * @type {?string}
     */
    this._mimeType = null

    /**
     * @type {?string}
     */
    this._unreachableUrl = null

    /**
     * @type {!Set<string>}
     */
    this._lifecycleEvents = new Set()

    /**
     * @type {DOMWorld}
     */
    this._mainWorld = new DOMWorld(
      frameManager,
      this,
      frameManager._timeoutSettings
    )

    /**
     * @type {DOMWorld}
     */
    this._secondaryWorld = new DOMWorld(
      frameManager,
      this,
      frameManager._timeoutSettings
    )

    /**
     * @type {!Set<!Frame>}
     */
    this._childFrames = new Set()
    if (this._parentFrame) this._parentFrame._childFrames.add(this)
  }

  /**
   * @return {?string}
   */
  securityOrigin () {
    return this._securityOrigin
  }

  /**
   * @return {?string}
   */
  mimeType () {
    return this._mimeType
  }

  /**
   * @return {?string}
   */
  unreachableUrl () {
    return this._unreachableUrl
  }

  /**
   * @return {string}
   */
  id () {
    return this._id
  }

  /**
   * @return {?string}
   */
  parentFrameId () {
    return this._parentId
  }

  /**
   * @return {string}
   */
  loaderId () {
    return this._loaderId
  }

  /**
   * @return {string}
   */
  name () {
    return this._name || ''
  }

  /**
   * @return {string}
   */
  url () {
    return this._url
  }

  /**
   * @return {?Frame}
   */
  parentFrame () {
    return this._parentFrame
  }

  /**
   * @return {!Array<!Frame>}
   */
  childFrames () {
    return Array.from(this._childFrames)
  }

  /**
   * @return {boolean}
   */
  isDetached () {
    return this._detached
  }

  /**
   * @param {string} url
   * @param {!{referer?: string, timeout?: number, waitUntil?: string|!Array<string>}=} options
   * @return {!Promise<?Response>}
   */
  goto (url, options) {
    return this._frameManager.navigateFrame(this, url, options)
  }

  /**
   * @param {!{timeout?: number, waitUntil?: string|!Array<string>}=} options
   * @return {!Promise<?Response>}
   */
  waitForNavigation (options) {
    return this._frameManager.waitForFrameNavigation(this, options)
  }

  /**
   * @return {?Promise<!ExecutionContext>}
   */
  executionContext () {
    return this._mainWorld.executionContext()
  }

  /**
   * @param {Function|string} pageFunction
   * @param {!Array<*>} args
   * @return {!Promise<!JSHandle>}
   */
  evaluateHandle (pageFunction, ...args) {
    return this._mainWorld.evaluateHandle(pageFunction, ...args)
  }

  /**
   * @param {Function|string} pageFunction
   * @param {!Array<*>} args
   * @return {!Promise<*>}
   */
  evaluate (pageFunction, ...args) {
    return this._mainWorld.evaluate(pageFunction, ...args)
  }

  /**
   * @param {string} selector
   * @return {!Promise<?ElementHandle>}
   */
  $ (selector) {
    return this._mainWorld.$(selector)
  }

  /**
   * @param {string} expression
   * @return {!Promise<!Array<!ElementHandle>>}
   */
  $x (expression) {
    return this._mainWorld.$x(expression)
  }

  /**
   * @param {string} selector
   * @param {Function|string} pageFunction
   * @param {!Array<*>} args
   * @return {!Promise<(!Object|undefined)>}
   */
  $eval (selector, pageFunction, ...args) {
    return this._mainWorld.$eval(selector, pageFunction, ...args)
  }

  /**
   * @param {string} selector
   * @param {Function|string} pageFunction
   * @param {!Array<*>} args
   * @return {!Promise<(!Object|undefined)>}
   */
  $$eval (selector, pageFunction, ...args) {
    return this._mainWorld.$$eval(selector, pageFunction, ...args)
  }

  /**
   * @param {string} selector
   * @return {!Promise<!Array<!ElementHandle>>}
   */
  $$ (selector) {
    return this._mainWorld.$$(selector)
  }

  /**
   * @return {!Promise<String>}
   */
  content () {
    return this._secondaryWorld.content()
  }

  /**
   * @param {string} html
   * @param {!{timeout?: number, waitUntil?: string|!Array<string>}=} options
   */
  setContent (html, options = {}) {
    return this._secondaryWorld.setContent(html, options)
  }
  /**
   * @param {!{url?: string, path?: string, content?: string, type?: string}} options
   * @return {!Promise<!ElementHandle>}
   */
  addScriptTag (options) {
    return this._mainWorld.addScriptTag(options)
  }

  /**
   * @param {!{url?: string, path?: string, content?: string}} options
   * @return {!Promise<!ElementHandle>}
   */
  addStyleTag (options) {
    return this._mainWorld.addStyleTag(options)
  }

  /**
   * @param {string} selector
   * @param {!{delay?: number, button?: "left"|"right"|"middle", clickCount?: number}=} options
   */
  click (selector, options) {
    return this._secondaryWorld.click(selector, options)
  }

  /**
   * @param {string} selector
   */
  focus (selector) {
    return this._secondaryWorld.focus(selector)
  }

  /**
   * @param {string} selector
   */
  hover (selector) {
    return this._secondaryWorld.hover(selector)
  }

  /**
   * @param {string} selector
   * @param {!Array<string>} values
   * @return {!Promise<!Array<string>>}
   */
  select (selector, ...values) {
    return this._secondaryWorld.select(selector, ...values)
  }

  /**
   * @param {string} selector
   */
  tap (selector) {
    return this._secondaryWorld.tap(selector)
  }

  /**
   * @param {string} selector
   * @param {string} text
   * @param {{delay: (number|undefined)}=} options
   */
  type (selector, text, options) {
    return this._mainWorld.type(selector, text, options)
  }

  /**
   * @param {(string|number|Function)} selectorOrFunctionOrTimeout
   * @param {!Object=} options
   * @param {!Array<*>} args
   * @return {!Promise<?JSHandle>}
   */
  waitFor (selectorOrFunctionOrTimeout, options = {}, ...args) {
    const xPathPattern = '//'

    if (helper.isString(selectorOrFunctionOrTimeout)) {
      const string = /** @type {string} */ (selectorOrFunctionOrTimeout)
      if (string.startsWith(xPathPattern)) {
        return this.waitForXPath(string, options)
      }
      return this.waitForSelector(string, options)
    }
    if (helper.isNumber(selectorOrFunctionOrTimeout)) {
      return new Promise(resolve =>
        setTimeout(resolve, /** @type {number} */ (selectorOrFunctionOrTimeout))
      )
    }
    if (typeof selectorOrFunctionOrTimeout === 'function') {
      return this.waitForFunction(selectorOrFunctionOrTimeout, options, ...args)
    }
    return Promise.reject(
      new Error(
        'Unsupported target type: ' + typeof selectorOrFunctionOrTimeout
      )
    )
  }

  /**
   * @param {string} selector
   * @param {!{visible?: boolean, hidden?: boolean, timeout?: number}=} options
   * @return {!Promise<?ElementHandle>}
   */
  async waitForSelector (selector, options) {
    const handle = await this._secondaryWorld.waitForSelector(selector, options)
    if (!handle) return null
    const mainExecutionContext = await this._mainWorld.executionContext()
    const result = await mainExecutionContext._adoptElementHandle(handle)
    await handle.dispose()
    return result
  }

  /**
   * @param {string} xpath
   * @param {!{visible?: boolean, hidden?: boolean, timeout?: number}=} options
   * @return {!Promise<?ElementHandle>}
   */
  async waitForXPath (xpath, options) {
    const handle = await this._secondaryWorld.waitForXPath(xpath, options)
    if (!handle) return null
    const mainExecutionContext = await this._mainWorld.executionContext()
    const result = await mainExecutionContext._adoptElementHandle(handle)
    await handle.dispose()
    return result
  }

  /**
   * @param {Function|string} pageFunction
   * @param {!{polling?: string|number, timeout?: number}=} options
   * @param {...*} args
   * @return {!Promise<!JSHandle>}
   */
  waitForFunction (pageFunction, options = {}, ...args) {
    return this._mainWorld.waitForFunction(pageFunction, options, ...args)
  }

  /**
   * @return {!Promise<string>}
   */
  title () {
    return this._secondaryWorld.title()
  }

  /**
   * @param {!Object} framePayload
   */
  _navigated (framePayload) {
    this._name = framePayload.name
    this._navigationURL = framePayload.url
    this._url = framePayload.url
    this._mimeType = framePayload.mimeType
    this._unreachableUrl = framePayload.unreachableUrl
    this._securityOrigin = framePayload.securityOrigin
  }

  /**
   * @param {string} url
   */
  _navigatedWithinDocument (url) {
    this._url = url
  }

  /**
   * @param {string} loaderId
   * @param {string} name
   */
  _onLifecycleEvent (loaderId, name) {
    if (name === 'init') {
      this._loaderId = loaderId
      this._lifecycleEvents.clear()
    }
    this._lifecycleEvents.add(name)
  }

  _onLoadingStopped () {
    this._lifecycleEvents.add('DOMContentLoaded')
    this._lifecycleEvents.add('load')
  }

  _detach () {
    this._detached = true
    this._mainWorld._detach()
    this._secondaryWorld._detach()
    if (this._parentFrame) this._parentFrame._childFrames.delete(this)
    this._parentFrame = null
  }

  toJSON () {
    return {
      id: this._id,
      detached: this._detached,
      url: this._url,
      loaderId: this._loaderId,
      parentId: this._parentId,
      securityOrigin: this._securityOrigin,
      mimeType: this._mimeType,
      unreachableUrl: this._unreachableUrl,
      childFrames: this.childFrames()
    }
  }

  // eslint-disable-next-line space-before-function-paren
  [util.inspect.custom](depth, options) {
    if (depth < 0) {
      return options.stylize('[Frame]', 'special')
    }

    const newOptions = Object.assign({}, options, {
      depth: options.depth === null ? null : options.depth - 1
    })
    const inner = util.inspect(
      {
        id: this._id,
        detached: this._detached,
        url: this._url,
        loaderId: this._loaderId,
        parentId: this._parentId,
        securityOrigin: this._securityOrigin,
        mimeType: this._mimeType,
        unreachableUrl: this._unreachableUrl,
        numChildFrames: this._childFrames.size
      },
      newOptions
    )
    return `${options.stylize('Frame', 'special')} ${inner}`
  }
}

module.exports = { Frame }
