/* eslint-env node, browser */
const EventEmitter = require('eventemitter3')
const { helper, assert } = require('./helper')
const { Events } = require('./Events')
const {
  ExecutionContext,
  EVALUATION_SCRIPT_URL
} = require('./ExecutionContext')
const { LifecycleWatcher } = require('./LifecycleWatcher')
const { DOMWorld } = require('./DOMWorld')

const UTILITY_WORLD_NAME = '__chrome-remote-interface-extra_utility_world__'

class FrameManager extends EventEmitter {
  /**
   * @param {Chrome|CRIConnection|CDPSession|Object} client
   * @param {!Object} frameTree
   * @param {!TimeoutSettings} timeoutSettings
   * @param {NetworkManager} [networkManager]
   * @param {Page} [page]
   */
  constructor (client, frameTree, timeoutSettings, networkManager, page) {
    super()
    /**
     * @type {!Object}
     */
    this._client = client

    /**
     * @type {!TimeoutSettings}
     */
    this._timeoutSettings = timeoutSettings

    /**
     * @type {NetworkManager}
     */
    this._networkManager = networkManager

    /**
     * @type {Page}
     */
    this._page = page

    /**
     * @type {Frame}
     */
    this._mainFrame = null

    /** @type {!Map<string, !Frame>} */
    this._frames = new Map()
    /** @type {!Map<number, !ExecutionContext>} */
    this._contextIdToContext = new Map()
    /** @type {!Set<string>} */
    this._isolatedWorlds = new Set()

    this._client.on('Page.frameAttached', event => this._onFrameAttached(event))
    this._client.on('Page.frameNavigated', event =>
      this._onFrameNavigated(event)
    )
    this._client.on('Page.navigatedWithinDocument', event =>
      this._onFrameNavigatedWithinDocument(event)
    )
    this._client.on('Page.frameDetached', event => this._onFrameDetached(event))
    this._client.on('Page.frameStoppedLoading', event =>
      this._onFrameStoppedLoading(event)
    )
    this._client.on('Runtime.executionContextCreated', event =>
      this._onExecutionContextCreated(event)
    )
    this._client.on('Runtime.executionContextDestroyed', event =>
      this._onExecutionContextDestroyed(event)
    )
    this._client.on('Runtime.executionContextsCleared', event =>
      this._onExecutionContextsCleared()
    )
    this._client.on('Page.lifecycleEvent', event =>
      this._onLifecycleEvent(event)
    )
    this._handleFrameTree(frameTree, true)
  }

  /**
   * @return {?Page}
   */
  page () {
    return this._page
  }

  /**
   * @return {!Frame}
   */
  mainFrame () {
    return this._mainFrame
  }

  /**
   * @return {!Array<!Frame>}
   */
  frames () {
    return Array.from(this._frames.values())
  }

  /**
   * @param {!string} frameId
   * @return {?Frame}
   */
  frame (frameId) {
    return this._frames.get(frameId) || null
  }

  /**
   * @param {!Frame} frame
   * @param {string} url
   * @param {!{referer?: string, timeout?: number, waitUntil?: string|!Array<string>}=} options
   * @return {!Promise<?Response>}
   */
  async navigateFrame (frame, url, options = {}) {
    assertNoLegacyNavigationOptions(options)
    const {
      referer = this._networkManager != null
        ? this._networkManager.extraHTTPHeaders()['referer']
        : null,
      waitUntil = ['load'],
      timeout = this._timeoutSettings.navigationTimeout()
    } = options

    const watcher = new LifecycleWatcher(this, frame, waitUntil, timeout)
    let ensureNewDocumentNavigation = false
    let error = await Promise.race([
      navigate(this._client, url, referer, frame._id),
      watcher.timeoutOrTerminationPromise()
    ])
    if (!error) {
      error = await Promise.race([
        watcher.timeoutOrTerminationPromise(),
        ensureNewDocumentNavigation
          ? watcher.newDocumentNavigationPromise()
          : watcher.sameDocumentNavigationPromise()
      ])
    }
    watcher.dispose()
    if (error) throw error
    return watcher.navigationResponse()

    /**
     * @param {Chrome|CRIConnection|CDPSession|Object} client
     * @param {string} url
     * @param {string} referrer
     * @param {string} frameId
     * @return {!Promise<?Error>}
     */
    async function navigate (client, url, referrer, frameId) {
      try {
        const response = await client.send('Page.navigate', {
          url,
          referrer,
          frameId
        })
        ensureNewDocumentNavigation = !!response.loaderId
        return response.errorText
          ? new Error(`${response.errorText} at ${url}`)
          : null
      } catch (error) {
        return error
      }
    }
  }

  /**
   * @param {!Frame} frame
   * @param {!{timeout?: number, waitUntil?: string|!Array<string>}=} options
   * @return {!Promise<?Response>}
   */
  async waitForFrameNavigation (frame, options = {}) {
    assertNoLegacyNavigationOptions(options)
    const {
      waitUntil = ['load'],
      timeout = this._timeoutSettings.navigationTimeout()
    } = options
    const watcher = new LifecycleWatcher(this, frame, waitUntil, timeout)
    const error = await Promise.race([
      watcher.timeoutOrTerminationPromise(),
      watcher.sameDocumentNavigationPromise(),
      watcher.newDocumentNavigationPromise()
    ])
    watcher.dispose()
    if (error) throw error
    return watcher.navigationResponse()
  }

  async ensureSecondaryDOMWorld () {
    await this._ensureIsolatedWorld(UTILITY_WORLD_NAME)
  }

  /**
   * @return {Promise<FrameResourceTree>}
   */
  async getResourceTree () {
    const { frameResourceTree } = await this._client.send(
      'Page.getResourceTree'
    )
    return new FrameResourceTree(this, frameResourceTree)
  }

  /**
   * @param {string} name
   */
  async _ensureIsolatedWorld (name) {
    if (this._isolatedWorlds.has(name)) return
    this._isolatedWorlds.add(name)
    await this._client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `//# sourceURL=${EVALUATION_SCRIPT_URL}`,
      worldName: name
    })
    await Promise.all(
      this.frames().map(frame =>
        this._client.send('Page.createIsolatedWorld', {
          frameId: frame._id,
          grantUniveralAccess: true,
          worldName: name
        })
      )
    )
  }

  /**
   * @param {number} contextId
   * @return {!ExecutionContext}
   */
  executionContextById (contextId) {
    const context = this._contextIdToContext.get(contextId)
    assert(context, 'INTERNAL ERROR: missing context with id = ' + contextId)
    return context
  }

  /**
   * @param {!Object} event
   */
  _onLifecycleEvent (event) {
    const frame = this._frames.get(event.frameId)
    if (!frame) return
    frame._onLifecycleEvent(event.loaderId, event.name)
    this.emit(Events.FrameManager.LifecycleEvent, frame)
  }

  /**
   * @param {!Object} event
   */
  _onFrameAttached (event) {
    if (this._frames.has(event.frameId)) return
    assert(
      event.parentFrameId,
      'A frame attached but does not have a parent id'
    )
    const parentFrame = this._frames.get(event.parentFrameId)
    const frame = new Frame(this, this._client, parentFrame, event.frameId)
    this._frames.set(frame.id(), frame)
    this.emit(Events.FrameManager.FrameAttached, frame)
  }

  /**
   * @param {!Object} event
   */
  _onFrameNavigated (event) {
    const framePayload = event.frame
    const isMainFrame = !framePayload.parentId
    let frame = isMainFrame
      ? this._mainFrame
      : this._frames.get(framePayload.id)
    assert(
      isMainFrame || frame,
      'We either navigate top level or have old version of the navigated frame'
    )

    // Detach all child frames first.
    if (frame) {
      for (const child of frame.childFrames()) {
        this._removeFramesRecursively(child)
      }
    }

    // Update or create main frame.
    if (isMainFrame) {
      if (frame) {
        // Update frame id to retain frame identity on cross-process navigation.
        this._frames.delete(frame._id)
        frame._id = framePayload.id
      } else {
        // Initial main frame navigation.
        frame = new Frame(this, this._client, null, framePayload.id)
      }
      this._frames.set(framePayload.id, frame)
      this._mainFrame = frame
    }

    // Update frame payload.
    frame._navigated(framePayload)

    this.emit(Events.FrameManager.FrameNavigated, frame)
  }

  /**
   * @param {!Object} event
   */
  _onFrameNavigatedWithinDocument (event) {
    const frame = this._frames.get(event.frameId)
    if (!frame) {
      console.log(
        'A frame navigated within the document but we do not have that frame',
        event
      )
      return
    }
    frame._navigatedWithinDocument(event.url)
    this.emit(Events.FrameManager.FrameNavigatedWithinDocument, frame)
    this.emit(Events.FrameManager.FrameNavigated, frame)
  }

  /**
   * @param {!Object} event
   */
  _onFrameDetached (event) {
    const frame = this._frames.get(event.frameId)
    if (frame) {
      this._removeFramesRecursively(frame)
    } else {
      console.log(
        'A frame detached from the document but we do not have that frame',
        event
      )
    }
  }

  /**
   * @param {!Object} event
   */
  _onFrameStoppedLoading (event) {
    const frame = this._frames.get(event.frameId)
    if (!frame) {
      console.log(
        'A frame stopped loading but we do not have that frame',
        event
      )
      return
    }
    frame._onLoadingStopped()
    this.emit(Events.FrameManager.LifecycleEvent, frame)
  }

  /**
   *
   * @param {!Object} event
   */
  _onExecutionContextCreated (event) {
    const contextPayload = event.context
    const frameId = contextPayload.auxData
      ? contextPayload.auxData.frameId
      : null
    const frame = this._frames.get(frameId) || null
    let world = null
    if (frame) {
      if (contextPayload.auxData && !!contextPayload.auxData['isDefault']) {
        world = frame._mainWorld
      } else if (contextPayload.name === UTILITY_WORLD_NAME) {
        world = frame._secondaryWorld
      }
    }
    if (
      contextPayload.auxData &&
      contextPayload.auxData['type'] === 'isolated'
    ) {
      this._isolatedWorlds.add(contextPayload.name)
    }
    /** @type {!ExecutionContext} */
    const context = new ExecutionContext(this._client, contextPayload, world)
    if (world) world._setContext(context)
    this._contextIdToContext.set(contextPayload.id, context)
  }

  /**
   * @param {!Object} event
   */
  _onExecutionContextDestroyed (event) {
    const context = this._contextIdToContext.get(event.executionContextId)
    if (!context) return
    this._contextIdToContext.delete(event.executionContextId)
    if (context._world) context._world._setContext(null)
  }

  _onExecutionContextsCleared () {
    for (const context of this._contextIdToContext.values()) {
      if (context._world) context._world._setContext(null)
    }
    this._contextIdToContext.clear()
  }

  /**
   * @param {!Frame} frame
   */
  _removeFramesRecursively (frame) {
    for (const child of frame.childFrames()) {
      this._removeFramesRecursively(child)
    }
    frame._detach()
    this._frames.delete(frame._id)
    this.emit(Events.FrameManager.FrameDetached, frame)
  }

  /**
   * @param {!Object} frameTree
   * @param {boolean} [first = false]
   */
  _handleFrameTree (frameTree, first = false) {
    const parentFrame = this._frames.get(frameTree.frame.parentId || '')
    const frame = Frame.fromCDPFrame(this, frameTree.frame, parentFrame)
    this._frames.set(frame.id(), frame)
    if (parentFrame == null && first) {
      this._mainFrame = frame
    } else if (first) {
      console.log(
        'handled first frame in frame tree and it has a parent frame???',
        frame
      )
    }
    if (!frameTree.childFrames) return
    const childFrames = frameTree.childFrames
    for (let i = 0; i < childFrames.length; i++) {
      this._handleFrameTree(childFrames[i])
    }
  }
}

/**
 * @unrestricted
 */
class Frame {
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
}

class FrameResourceTree {
  /**
   *
   * @param {FrameManager} frameManager
   * @param {Object} resourceTree
   */
  constructor (frameManager, resourceTree) {
    this._frameManager = frameManager
    /**
     * @type {?Frame}
     */
    this._frame = null

    /**
     * @type {Array<FrameResource>}
     */
    this._resources = []

    /**
     * @type {Array<FrameResourceTree>}
     */
    this._children = []
    this._buildTree(resourceTree)
  }

  /**
   * @desc Walks the frame resources tree using breadth first traversal
   * @return {IterableIterator<{resources: Array<FrameResource>, frame: ?Frame}>}
   */
  * walkTree () {
    /**
     * @type {FrameResourceTree[]}
     */
    const q = [this]
    let nextFrame
    let i, currFrameKids, currFrameNumKids
    while (q.length) {
      nextFrame = q.shift()
      yield { frame: nextFrame._frame, resources: nextFrame._resources }
      currFrameKids = nextFrame._children
      currFrameNumKids = currFrameKids.length
      for (i = 0; i < currFrameNumKids; i++) {
        q.push(currFrameKids[i])
      }
    }
  }

  toJSON () {
    return {
      frame: this._frame,
      resources: this._resources,
      children: this._children
    }
  }

  /**
   * @desc Walks the frame resources tree using breadth first traversal
   * @return {IterableIterator<{resouces: Array<FrameResource>, frame: ?Frame}>}
   */
  [Symbol.iterator]() {
    return this.walkTree()
  }

  _buildTree (resourceTree) {
    this._frame = this._frameManager.frame(resourceTree.frame.id)
    const resources = resourceTree.resources
    const numResources = resources.length
    for (let i = 0; i < numResources; i++) {
      this._resources.push(new FrameResource(resources[i]))
    }
    if (!resourceTree.childFrames) return
    const childFrames = resourceTree.childFrames
    for (let i = 0; i < childFrames.length; i++) {
      this._children.push(
        new FrameResourceTree(this._frameManager, childFrames[i])
      )
    }
  }
}

class FrameResource {
  constructor ({
    url,
    type,
    mimeType,
    lastModified,
    contentSize,
    failed,
    canceled
  }) {
    /**
     * @type {string}
     */
    this._url = url

    /**
     * @type {string}
     */
    this._type = type

    /**
     * @type {string}
     */
    this._mimeType = mimeType

    /**
     * @type {?number}
     */
    this._lastModified = lastModified

    /**
     * @type {?number}
     */
    this._contentSize = contentSize

    /**
     * @type {?boolean}
     */
    this._failed = failed

    /**
     * @type {?boolean}
     */
    this._canceled = canceled
  }

  /**
   * @return {string}
   */
  get url () {
    return this._url
  }

  /**
   * @return {string}
   */
  get type () {
    return this._type
  }

  /**
   * @return {string}
   */
  get mimeType () {
    return this._mimeType
  }

  /**
   * @return {?number}
   */
  get lastModified () {
    return this._lastModified
  }

  /**
   * @return {?number}
   */
  get contentSize () {
    return this._contentSize
  }

  /**
   * @return {?boolean}
   */
  get failed () {
    return this._failed
  }

  /**
   * @return {?boolean}
   */
  get canceled () {
    return this._canceled
  }

  toJSON () {
    return {
      url: this._url,
      type: this._type,
      mimeType: this._mimeType,
      lastModified: this._lastModified,
      contentSize: this._contentSize,
      failed: this._failed,
      canceled: this._canceled
    }
  }
}

function assertNoLegacyNavigationOptions (options) {
  assert(
    options['networkIdleTimeout'] === undefined,
    'ERROR: networkIdleTimeout option is no longer supported.'
  )
  assert(
    options['networkIdleInflight'] === undefined,
    'ERROR: networkIdleInflight option is no longer supported.'
  )
  assert(
    options.waitUntil !== 'networkidle',
    'ERROR: "networkidle" option is no longer supported. Use "networkidle2" instead'
  )
}

module.exports = { FrameManager, Frame, FrameResource, FrameResourceTree }
