const { helper, assert } = require('../helper')
const { TimeoutError } = require('../errors')

class LifecycleWatcher {
  /**
   * @param {!FrameManager} frameManager
   * @param {!Frame} frame
   * @param {string|!Array<string>} waitUntil
   * @param {number} timeout
   */
  constructor (frameManager, frame, waitUntil, timeout) {
    if (Array.isArray(waitUntil)) waitUntil = waitUntil.slice()
    else if (typeof waitUntil === 'string') waitUntil = [waitUntil]
    this._expectedLifecycle = waitUntil.map(value => {
      const protocolEvent = puppeteerToProtocolLifecycle[value]
      assert(protocolEvent, 'Unknown value for options.waitUntil: ' + value)
      return protocolEvent
    })

    this._frameManager = frameManager
    this._networkManager = frameManager._networkManager
    this._frame = frame
    this._initialLoaderId = frame._loaderId
    this._timeout = timeout
    /** @type {?Request} */
    this._navigationRequest = null
    this._eventListeners = [
      helper.addEventListener(frameManager._cdpClient, 'disconnect', () =>
        this._terminate(
          new Error('Navigation failed because browser has disconnected!')
        )
      ),
      helper.addEventListener(
        this._frameManager,
        frameManager.Events.LifecycleEvent,
        this._checkLifecycleComplete.bind(this)
      ),
      helper.addEventListener(
        this._frameManager,
        frameManager.Events.FrameNavigatedWithinDocument,
        this._navigatedWithinDocument.bind(this)
      ),
      helper.addEventListener(
        this._frameManager,
        frameManager.Events.FrameDetached,
        this._onFrameDetached.bind(this)
      )
    ]

    if (this._networkManager) {
      this._eventListeners.push(
        helper.addEventListener(
          this._networkManager,
          this._networkManager.Events.Request,
          this._onRequest.bind(this)
        )
      )
    }

    this._sameDocumentNavigationPromise = new Promise(resolve => {
      this._sameDocumentNavigationCompleteCallback = resolve
    })

    this._lifecyclePromise = new Promise(resolve => {
      this._lifecycleCallback = resolve
    })

    this._newDocumentNavigationPromise = new Promise(resolve => {
      this._newDocumentNavigationCompleteCallback = resolve
    })

    this._timeoutPromise = this._createTimeoutPromise()
    this._terminationPromise = new Promise(resolve => {
      this._terminationCallback = resolve
    })
    this._checkLifecycleComplete()
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
   * @return {!Promise<?Error>}
   */
  sameDocumentNavigationPromise () {
    return this._sameDocumentNavigationPromise
  }

  /**
   * @return {!Promise<?Error>}
   */
  newDocumentNavigationPromise () {
    return this._newDocumentNavigationPromise
  }

  /**
   * @return {!Promise}
   */
  lifecyclePromise () {
    return this._lifecyclePromise
  }

  /**
   * @return {!Promise<?Error>}
   */
  timeoutOrTerminationPromise () {
    return Promise.race([this._timeoutPromise, this._terminationPromise])
  }

  /**
   * @return {!Promise<?Error>}
   */
  _createTimeoutPromise () {
    if (!this._timeout) return new Promise(() => {})
    const errorMessage =
      'Navigation Timeout Exceeded: ' + this._timeout + 'ms exceeded'
    return new Promise(
      resolve => (this._maximumTimer = setTimeout(resolve, this._timeout))
    ).then(() => new TimeoutError(errorMessage))
  }

  /**
   * @param {!Frame} frame
   */
  _navigatedWithinDocument (frame) {
    if (frame !== this._frame) return
    this._hasSameDocumentNavigation = true
    this._checkLifecycleComplete()
  }

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

    /**
     * @param {!Frame} frame
     * @param {!Array<string>} expectedLifecycle
     * @return {boolean}
     */
    function checkLifecycle (frame, expectedLifecycle) {
      for (const event of expectedLifecycle) {
        if (!frame._lifecycleEvents.has(event)) return false
      }
      for (const child of frame.childFrames()) {
        if (!checkLifecycle(child, expectedLifecycle)) return false
      }
      return true
    }
  }

  dispose () {
    helper.removeEventListeners(this._eventListeners)
    clearTimeout(this._maximumTimer)
  }
}

const puppeteerToProtocolLifecycle = {
  load: 'load',
  domcontentloaded: 'DOMContentLoaded',
  networkidle0: 'networkIdle',
  networkidle2: 'networkAlmostIdle'
}

/**
 * @type {LifecycleWatcher}
 */
module.exports = LifecycleWatcher
