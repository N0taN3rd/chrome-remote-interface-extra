const EventEmitter = require('eventemitter3')
const { assert } = require('../helper')
const { ExecutionContext } = require('../runtime')
const Frame = require('./frame')
const LifecycleWatcher = require('./lifecycleWatcher')

class FrameManager extends EventEmitter {
  /**
   * @param {!Object} cdpClient
   * @param {!Object} frameTree
   * @param {NetworkManager} [networkManager]
   */
  constructor (cdpClient, frameTree, networkManager) {
    super()
    this._cdpClient = cdpClient
    this._networkManager = networkManager
    this._defaultNavigationTimeout = 30000
    /** @type {!Map<string, !Frame>} */
    this._frames = new Map()
    /** @type {!Map<number, !ExecutionContext>} */
    this._contextIdToContext = new Map()

    this._cdpClient.on('Page.frameAttached', event =>
      this._onFrameAttached(event)
    )
    this._cdpClient.on('Page.frameNavigated', event =>
      this._onFrameNavigated(event.frame)
    )
    this._cdpClient.on('Page.navigatedWithinDocument', event =>
      this._onFrameNavigatedWithinDocument(event.frameId, event.url)
    )
    this._cdpClient.on('Page.frameDetached', event =>
      this._onFrameDetached(event.frameId)
    )
    this._cdpClient.on('Page.frameStoppedLoading', event =>
      this._onFrameStoppedLoading(event.frameId)
    )
    this._cdpClient.on('Runtime.executionContextCreated', event =>
      this._onExecutionContextCreated(event.context)
    )
    this._cdpClient.on('Runtime.executionContextDestroyed', event =>
      this._onExecutionContextDestroyed(event.executionContextId)
    )
    this._cdpClient.on('Runtime.executionContextsCleared', event =>
      this._onExecutionContextsCleared()
    )
    this._cdpClient.on('Page.lifecycleEvent', event =>
      this._onLifecycleEvent(event)
    )

    this._handleFrameTree(frameTree)
  }

  /**
   * @param {number} timeout
   */
  setDefaultNavigationTimeout (timeout) {
    this._defaultNavigationTimeout = timeout
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
      referer = this._networkManager.extraHTTPHeaders()['referer'],
      waitUntil = ['load'],
      timeout = this._defaultNavigationTimeout
    } = options

    const watcher = new LifecycleWatcher(this, frame, waitUntil, timeout)
    let ensureNewDocumentNavigation = false
    let error = await Promise.race([
      navigate(this._cdpClient, url, referer, frame._id),
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
     * @param {!Object} client
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
      timeout = this._defaultNavigationTimeout
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
   * @param {!Object} event
   */
  _onLifecycleEvent (event) {
    const frame = this._frames.get(event.frameId)
    if (!frame) return
    frame._onLifecycleEvent(event.loaderId, event.name)
    this.emit(FrameManager.Events.LifecycleEvent, frame)
  }

  /**
   * @param {string} frameId
   */
  _onFrameStoppedLoading (frameId) {
    const frame = this._frames.get(frameId)
    if (!frame) return
    frame._onLoadingStopped()
    this.emit(FrameManager.Events.LifecycleEvent, frame)
  }

  /**
   * @param {!Object} frameTree
   */
  _handleFrameTree (frameTree) {
    if (frameTree.frame.parentId) {
      if (!this._frames.has(frameTree.frame.id)) {
        const parentFrame = this._frames.get(frameTree.frame.parentId)
        const frame = new Frame(this, this._cdpClient, parentFrame, frameTree.frame.id)
        this._frames.set(frame._id, frame)
      }
    }
    this._onFrameNavigated(frameTree.frame)
    if (!frameTree.childFrames) return

    for (const child of frameTree.childFrames) this._handleFrameTree(child)
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
   * @param {string} frameId
   * @param {?string} parentFrameId
   */
  _onFrameAttached (frameId, parentFrameId) {
    if (this._frames.has(frameId)) return
    assert(parentFrameId)
    const parentFrame = this._frames.get(parentFrameId)
    const frame = new Frame(this, this._cdpClient, parentFrame, frameId)
    this._frames.set(frame._id, frame)
    this.emit(FrameManager.Events.FrameAttached, frame)
  }

  /**
   * @param {!Object} framePayload
   */
  _onFrameNavigated (framePayload) {
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
        frame = new Frame(this, this._cdpClient, null, framePayload.id)
      }
      this._frames.set(framePayload.id, frame)
      this._mainFrame = frame
    }

    // Update frame payload.
    frame._navigated(framePayload)

    this.emit(FrameManager.Events.FrameNavigated, frame)
  }

  /**
   * @param {string} frameId
   * @param {string} url
   */
  _onFrameNavigatedWithinDocument (frameId, url) {
    const frame = this._frames.get(frameId)
    if (!frame) return
    frame._navigatedWithinDocument(url)
    this.emit(FrameManager.Events.FrameNavigatedWithinDocument, frame)
    this.emit(FrameManager.Events.FrameNavigated, frame)
  }

  /**
   * @param {string} frameId
   */
  _onFrameDetached (frameId) {
    const frame = this._frames.get(frameId)
    if (frame) this._removeFramesRecursively(frame)
  }

  _onExecutionContextCreated (contextPayload) {
    const frameId = contextPayload.auxData
      ? contextPayload.auxData.frameId
      : null
    const frame = this._frames.get(frameId) || null
    /** @type {!ExecutionContext} */
    const context = new ExecutionContext(this._cdpClient, contextPayload, frame)
    this._contextIdToContext.set(contextPayload.id, context)
    if (frame) frame._addExecutionContext(context)
  }

  /**
   * @param {number} executionContextId
   */
  _onExecutionContextDestroyed (executionContextId) {
    const context = this._contextIdToContext.get(executionContextId)
    if (!context) return
    this._contextIdToContext.delete(executionContextId)
    if (context.frame()) context.frame()._removeExecutionContext(context)
  }

  _onExecutionContextsCleared () {
    for (const context of this._contextIdToContext.values()) {
      if (context.frame()) context.frame()._removeExecutionContext(context)
    }
    this._contextIdToContext.clear()
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
   * @param {!Frame} frame
   */
  _removeFramesRecursively (frame) {
    for (const child of frame.childFrames()) {
      this._removeFramesRecursively(child)
    }
    frame._detach()
    this._frames.delete(frame._id)
    this.emit(FrameManager.Events.FrameDetached, frame)
  }
}

/** @enum {symbol} */
const FrameManagerEvents = {
  FrameAttached: Symbol('FrameManager.frameattached'),
  FrameNavigated: Symbol('FrameManager.framenavigated'),
  FrameDetached: Symbol('FrameManager.framedetached'),
  LifecycleEvent: Symbol('FrameManager.lifecycleevent'),
  FrameNavigatedWithinDocument: Symbol(
    'FrameManager.framenavigatedwithindocument'
  ),
  ExecutionContextCreated: Symbol('FrameManager.executioncontextcreated'),
  ExecutionContextDestroyed: Symbol('FrameManager.executioncontextdestroyed')
}

/** @enum {symbol} */
FrameManager.Events = FrameManagerEvents

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

/**
 * @type {{FrameManagerEvents: {ExecutionContextDestroyed: symbol, FrameAttached: symbol, FrameDetached: symbol, ExecutionContextCreated: symbol, FrameNavigatedWithinDocument: symbol, LifecycleEvent: symbol, FrameNavigated: symbol}, FrameManager: FrameManager}}
 */
module.exports = { FrameManager, FrameManagerEvents }
