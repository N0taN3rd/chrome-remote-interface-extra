const { helper, assert } = require('./helper')
const Events = require('./Events')
const { TimeoutError } = require('./Errors')

/**
 * @desc An utility class that watches the supplied frame and its children (if any)
 * to determine if they reach the specified lifecycle(s)
 *
 * Lifecycle mapping in the form of supplied to CDP value:
 *  - load: load
 *  - domcontentloaded: DOMContentLoaded
 *  - networkIdle: networkIdle
 *  - networkAlmostIdle: networkAlmostIdle
 *  - networkidle0: networkIdle
 *  - networkidle2: networkAlmostIdle
 */
class LifecycleWatcher {
  /**
   * @param {!FrameManager} frameManager - The frame manager for the page containing the frame being navigated
   * @param {!Frame} frame - The frame being navigated
   * @param {string|Array<string>} waitUntil - The lifecycle(s) desired to be obtained by the frame and its children
   * @param {number} [timeout] - An optional timeout value
   */
  constructor (frameManager, frame, waitUntil, timeout) {
    let waitUntilArray
    if (Array.isArray(waitUntil)) {
      waitUntilArray = waitUntil.slice()
    } else if (typeof waitUntil === 'string') {
      waitUntilArray = [waitUntil]
    }

    /**
     * @type {Array<string>}
     * @private
     */
    this._expectedLifecycle = waitUntilArray.map(value => {
      const protocolEvent = protocolLifecycle[value]
      assert(protocolEvent, 'Unknown value for options.waitUntil: ' + value)
      return protocolEvent
    })

    /**
     * @type {!FrameManager}
     * @private
     */
    this._frameManager = frameManager

    /**
     * @type {?NetworkManager}
     * @private
     */
    this._networkManager = frameManager._networkManager

    /**
     * @type {!Frame}
     * @private
     */
    this._frame = frame

    /**
     * @type {string}
     * @private
     */
    this._initialLoaderId = frame._loaderId

    /**
     * @type {number}
     * @private
     */
    this._timeout = timeout
    /** @type {?Request} */
    this._navigationRequest = null

    /**
     * @type {{emitter: !EventEmitter, eventName: (string|symbol), handler: (function(*))}[]}
     * @private
     */
    this._eventListeners = [
      helper.addEventListener(
        frameManager._client,
        frameManager._client.$$disconnectEvent || Events.CRIClient.Disconnected,
        this._onConnectionDisconnected.bind(this)
      ),
      helper.addEventListener(
        this._frameManager,
        Events.FrameManager.LifecycleEvent,
        this._checkLifecycleComplete.bind(this)
      ),
      helper.addEventListener(
        this._frameManager,
        Events.FrameManager.FrameNavigatedWithinDocument,
        this._navigatedWithinDocument.bind(this)
      ),
      helper.addEventListener(
        this._frameManager,
        Events.FrameManager.FrameDetached,
        this._onFrameDetached.bind(this)
      )
    ]

    if (this._networkManager) {
      this._eventListeners.push(
        helper.addEventListener(
          this._networkManager,
          Events.NetworkManager.Request,
          this._onRequest.bind(this)
        )
      )
    }

    /**
     * @desc A Promise that resolves if the frame navigated within the same document (History.pushState etc)
     * @type {Promise<*>}
     */
    this._sameDocumentNavigationPromise = new Promise(resolve => {
      this._sameDocumentNavigationCompleteCallback = resolve
    })

    /**
     * @desc A Promise that resolves if the frame being navigated reached the expected lifecycle
     * @type {Promise<*>}
     */
    this._lifecyclePromise = new Promise(resolve => {
      this._lifecycleCallback = resolve
    })

    /**
     * @desc A Promise that resolves if the frame being navigated navigated to a new page
     * @type {Promise<*>}
     */
    this._newDocumentNavigationPromise = new Promise(resolve => {
      this._newDocumentNavigationCompleteCallback = resolve
    })

    /**
     * @desc A Promise that resolves if the frame being navigated did not navigate within the
     * supplied timeout if any
     * @type {Promise<*>}
     */
    this._timeoutPromise = this._createTimeoutPromise()

    /**
     * @desc A Promise that resolves if the the watcher is terminated
     * @type {Promise<*>}
     */
    this._terminationPromise = new Promise(resolve => {
      this._terminationCallback = resolve
    })

    this._checkLifecycleComplete()
  }

  _onConnectionDisconnected () {
    this._terminate(
      new Error('Navigation failed because browser has disconnected!')
    )
  }

  /**
   * @param {!Request} request
   */
  _onRequest (request) {
    if (request.frame() !== this._frame || !request.isNavigationRequest()) {
      return
    }
    this._navigationRequest = request
  }

  /**
   * @param {!Frame} frame
   */
  _onFrameDetached (frame) {
    if (this._frame === frame) {
      this._terminationCallback.call(
        null,
        new Error('Navigating frame was detached')
      )
      return
    }
    this._checkLifecycleComplete()
  }

  /**
   * @return {?Response}
   */
  navigationResponse () {
    return this._navigationRequest ? this._navigationRequest.response() : null
  }

  /**
   * @param {!Error} error
   */
  _terminate (error) {
    this._terminationCallback.call(null, error)
  }

  /**
   * @return {Promise<Error|undefined>}
   */
  sameDocumentNavigationPromise () {
    return this._sameDocumentNavigationPromise
  }

  /**
   * @return {Promise<Error|undefined>}
   */
  newDocumentNavigationPromise () {
    return this._newDocumentNavigationPromise
  }

  /**
   * @return {Promise<*>}
   */
  lifecyclePromise () {
    return this._lifecyclePromise
  }

  /**
   * @return {Promise<Error|undefined>}
   */
  timeoutOrTerminationPromise () {
    return Promise.race([this._timeoutPromise, this._terminationPromise])
  }

  /**
   * @return {Promise<Error|undefined>}
   */
  _createTimeoutPromise () {
    if (!this._timeout) return new Promise(() => {})
    const errorMessage =
      'Navigation Timeout Exceeded: ' + this._timeout + 'ms exceeded'

    return new Promise(resolve => {
      this._maximumTimer = setTimeout(resolve, this._timeout)
    }).then(() => new TimeoutError(errorMessage))
  }

  /**
   * @param {!Frame} frame
   */
  _navigatedWithinDocument (frame) {
    if (frame !== this._frame) return
    this._hasSameDocumentNavigation = true
    this._checkLifecycleComplete()
  }

  /**
   * @desc Checks the frame being navigated and all its child frames for the expected lifecycle(s)
   * @private
   */
  _checkLifecycleComplete () {
    // We expect navigation to commit.
    if (!checkLifecycle(this._frame, this._expectedLifecycle)) return
    this._lifecycleCallback()
    if (
      this._frame._loaderId === this._initialLoaderId &&
      !this._hasSameDocumentNavigation
    ) {
      return
    }
    if (this._hasSameDocumentNavigation) {
      this._sameDocumentNavigationCompleteCallback()
    }
    if (this._frame._loaderId !== this._initialLoaderId) {
      this._newDocumentNavigationCompleteCallback()
    }
  }

  /**
   * @desc Dispose of the LifecycleWatcher (i.e. clean up)
   */
  dispose () {
    helper.removeEventListeners(this._eventListeners)
    clearTimeout(this._maximumTimer)
  }
}

/**
 * @param {!Frame} frame
 * @param {Array<string>} expectedLifecycle
 * @return {boolean}
 */
function checkLifecycle (frame, expectedLifecycle) {
  let i = 0
  for (; i < expectedLifecycle.length; i++) {
    if (!frame._lifecycleEvents.has(expectedLifecycle[i])) return false
  }
  const childFrames = frame.childFrames()
  for (i = 0; i < childFrames.length; i++) {
    if (!checkLifecycle(childFrames[i], expectedLifecycle)) return false
  }
  return true
}

const protocolLifecycle = {
  load: 'load',
  domcontentloaded: 'DOMContentLoaded',
  networkIdle: 'networkIdle',
  networkAlmostIdle: 'networkAlmostIdle',
  networkidle0: 'networkIdle',
  networkidle2: 'networkAlmostIdle'
}

/**
 * @type {LifecycleWatcher}
 */
module.exports = LifecycleWatcher
