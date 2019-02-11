/* eslint-env node, browser */
const EventEmitter = require('eventemitter3')
const { assert } = require('../helper')
const { Events } = require('../Events')
const {
  ExecutionContext,
  EVALUATION_SCRIPT_URL
} = require('../ExecutionContext')
const { LifecycleWatcher } = require('../LifecycleWatcher')
const { Frame } = require('./Frame')
const { FrameResourceTree } = require('./FrameResourceTree')

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

module.exports = { FrameManager }
