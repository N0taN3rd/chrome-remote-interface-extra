/* eslint-env node, browser */
const util = require('util')
const EventEmitter = require('eventemitter3')
const { assert, helper } = require('../helper')
const Events = require('../Events')
const ExecutionContext = require('../executionContext/ExecutionContext')
const EVALUATION_SCRIPT_URL = require('../executionContext/evalURL')
const LifecycleWatcher = require('../LifecycleWatcher')
const Frame = require('./Frame')
const FrameResourceTree = require('./FrameResourceTree')

const UTILITY_WORLD_NAME = '__chrome-remote-interface-extra_utility_world__'

/**
 * @typedef {Object} FrameManagerInit
 * @property {Chrome|CRIConnection|CDPSession|Object} client - The connection/client to be used to communicate with the remote Browser instance
 * @property {TimeoutSettings } timeoutSettings - The timeout settings to be used
 * @property {?NetworkManager} [networkManager] - Optional instance of NetworkManager the FrameManager is associated with
 * @property {?Page} [Page] - Optional instance of Page the frame manager is associated with
 */

class FrameManager extends EventEmitter {
  /**
   * Create a new instance of FrameManager and initialize it
   * @param {FrameManagerInit} init
   * @return {Promise<FrameManager>}
   */
  static async create (init) {
    const frameManager = new FrameManager(init)
    await frameManager.initialize()
    return frameManager
  }

  /**
   * @param {FrameManagerInit} init
   */
  constructor ({ client, timeoutSettings, networkManager, page }) {
    super()
    /**
     * @type {!Chrome|CRIConnection|CDPSession|Object}
     */
    this._client = client

    /**
     * @type {!TimeoutSettings}
     */
    this._timeoutSettings = timeoutSettings

    /**
     * @type {?NetworkManager}
     */
    this._networkManager = networkManager

    /**
     * @type {?Page}
     */
    this._page = page

    /**
     * @type {Frame}
     */
    this._mainFrame = null

    /** @type {Map<string, Frame>} */
    this._frames = new Map()
    /** @type {Map<number, ExecutionContext>} */
    this._contextIdToContext = new Map()
    /** @type {Set<string>} */
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
    this._client.on('Runtime.executionContextsCleared', () =>
      this._onExecutionContextsCleared()
    )
    this._client.on('Page.lifecycleEvent', event =>
      this._onLifecycleEvent(event)
    )
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
   * @return {!Array<Frame>}
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
   * Initializes the FrameManager by enabling the following domains
   *   - Page
   *   - Runtime
   *
   * Also populates the initial set of tracked frames (Page.getFrameTree) and enables frame life cycle
   * event tracking (Page.setLifecycleEventsEnabled).
   *
   * This method must be called for the FrameManager and other classes provided by CRIE to work properly
   * @return {Promise<void>}
   */
  async initialize () {
    const [, { frameTree }] = await Promise.all([
      this._client.send('Page.enable'),
      this._client.send('Page.getFrameTree')
    ])
    this._handleFrameTree(frameTree, true)
    await Promise.all([
      this._client.send('Page.setLifecycleEventsEnabled', { enabled: true }),
      this._client
        .send('Runtime.enable', {})
        .then(() => this._ensureIsolatedWorld(UTILITY_WORLD_NAME))
    ])
  }

  /**
   * @param {!Frame} frame
   * @param {string} url
   * @param {!{referer?: string, timeout?: number, waitUntil?: string|Array<string>, transitionType?: string}=} options
   * @return {Promise<Response|undefined>}
   */
  async navigateFrame (frame, url, options = {}) {
    assertNoLegacyNavigationOptions(options)
    const {
      waitUntil = ['load'],
      timeout = this._timeoutSettings.navigationTimeout(),
      transitionType
    } = options
    let referer = options.referer
    if (referer == null) {
      if (this._networkManager != null) {
        referer = this._networkManager.extraHTTPHeaders()['referer']
      }
    }
    const watcher = new LifecycleWatcher(this, frame, waitUntil, timeout)
    const endnObj = { ensureNewDocumentNavigation: false }
    const navigationParams = {
      url,
      transitionType,
      referrer: referer,
      frameId: frame._id
    }
    let error = await Promise.race([
      this._navigate(navigationParams, endnObj),
      watcher.timeoutOrTerminationPromise()
    ])
    if (!error) {
      error = await Promise.race([
        watcher.timeoutOrTerminationPromise(),
        endnObj.ensureNewDocumentNavigation
          ? watcher.newDocumentNavigationPromise()
          : watcher.sameDocumentNavigationPromise()
      ])
    }
    watcher.dispose()
    if (error) throw error
    return watcher.navigationResponse()
  }

  /**
   * @param {!Frame} frame
   * @param {!{timeout?: number, waitUntil?: string|Array<string>}=} options
   * @return {Promise<Response|undefined>}
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

  /**
   * @return {Promise<FrameResourceTree>}
   * @since chrome-remote-interface-extra
   */
  async getResourceTree () {
    const { frameTree } = await this._client.send('Page.getResourceTree')
    return new FrameResourceTree(frameTree, this)
  }

  /**
   * Returns content of the given resource. EXPERIMENTAL
   * @param {string} frameId - Frame id to get resource for
   * @param {string} url - URL of the resource to get content for
   * @return {Promise<Buffer>} - Resource content
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Page#method-getResourceContent
   * @since chrome-remote-interface-extra
   */
  async getFrameResourceContent (frameId, url) {
    const { content, base64Encoded } = await this._client.send(
      'Page.getResourceContent',
      { frameId, url }
    )
    return Buffer.from(content, base64Encoded ? 'base64' : 'utf8')
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
        this._client
          .send('Page.createIsolatedWorld', {
            frameId: frame._id,
            grantUniveralAccess: true,
            worldName: name
          })
          .catch(helper.noop)
      )
    )
  }
  /**
   * @param {{transitionType: ?string, frameId: string, url: string, referrer: ?string}} navigationParams
   * @param {{ensureNewDocumentNavigation: boolean}} endnObj
   * @return {Promise<Error|undefined>}
   * @since chrome-remote-interface-extra
   */
  async _navigate (navigationParams, endnObj) {
    try {
      const response = await this._client.send(
        'Page.navigate',
        navigationParams
      )
      endnObj.ensureNewDocumentNavigation = !!response.loaderId
      return response.errorText
        ? new Error(`${response.errorText} at ${navigationParams.url}`)
        : null
    } catch (error) {
      return error
    }
  }

  /**
   * @param {number} contextId
   * @return {!ExecutionContext}
   * @since chrome-remote-interface-extra
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
      const childFrames = frame.childFrames()
      for (let i = 0; i < childFrames.length; i++) {
        this._removeFramesRecursively(childFrames[i])
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
      /*
      console.log(
        'A frame detached from the document but we do not have that frame',
        event
      )
      */
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
      } else if (
        contextPayload.name === UTILITY_WORLD_NAME &&
        !frame._secondaryWorld._hasContext()
      ) {
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
    const childFrames = frame.childFrames()
    for (let i = 0; i < childFrames.length; i++) {
      this._removeFramesRecursively(childFrames[i])
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

  toJSON () {
    return { mainFrame: this._mainFrame, frames: this.frames() }
  }

  /** @ignore */
  // eslint-disable-next-line space-before-function-paren
  [util.inspect.custom](depth, options) {
    if (depth < 0) {
      return options.stylize('[FrameManager]', 'special')
    }

    const newOptions = Object.assign({}, options, {
      depth: options.depth == null ? null : options.depth - 1
    })
    const inner = util.inspect(
      { mainFrame: this._mainFrame, frames: this.frames() },
      newOptions
    )
    return `${options.stylize('FrameManager', 'special')} ${inner}`
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

module.exports = FrameManager
