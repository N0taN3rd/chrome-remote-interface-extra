/// This file is from https://github.com/N0taN3rd/Squidwarc Copyright John Berlin <n0tan3rd@gmail.com> Apache 2.0
const EventEmitter = require('eventemitter3')
const Events = require('../Events')
const { helper } = require('../helper')

/**
 * Monitors the HTTP requests made by a page and emits the 'network-idle' event when it has been determined the network is idle
 * @extends {EventEmitter}
 * @since chrome-remote-interface-extra
 */
class NetIdleWatcher extends EventEmitter {
  /**
   * @param {NetworkManager} networkManager - Page object for the page being crawled
   * @param {?NetIdleOptions} [options = {}] - Optional options to control fine tune network idle determination
   */
  constructor (networkManager, options = {}) {
    super()

    /**
     * Maximum amount of time a crawler going to visit a page
     * @type {number}
     * @private
     */
    this._timeout = options.globalWait || 40000

    /**
     * The amount of time no new HTTP requests should be made before emitting the network-idle event
     * @type {number}
     * @private
     */
    this._idleTime = options.inflightIdle || 1500

    /**
     * The number of in-flight requests there should be before starting the network-idle timer
     * @type {number}
     * @private
     */
    this._idleInflight = options.numInflight || 2

    /**
     * Set of the HTTP requests ids, used for tracking network-idle
     * @type {Set<string>}
     * @private
     */
    this._requestIds = new Set()

    /**
     * The id of the setTimeout for the network-idle timer
     * @type {?number}
     * @private
     */
    this._idleTimer = null

    /**
     * Flag indicating if we are in a network tracking state of not
     * @type {boolean}
     * @private
     */
    this._doneTimers = false

    /**
     * The id of the global crawler setTimeout timer
     * @type {?number}
     * @private
     */
    this._globalWaitTimer = null

    /**
     * The page object of the current page the crawler is visting
     * @type {NetworkManager}
     */
    this._networkManager = networkManager

    /**
     * An array of listeners registered on the page object
     * @type {Object[]}
     * @private
     */
    this._pageListenrs = []

    this.reqFinished = this.reqFinished.bind(this)
    this.reqStarted = this.reqStarted.bind(this)
    this._networkIdled = this._networkIdled.bind(this)
    this._globalNetworkTimeout = this._globalNetworkTimeout.bind(this)
    this._clearTimers = this._clearTimers.bind(this)
    this._emitNetIdle = this._emitNetIdle.bind(this)
  }

  /**
   * Start monitoring the network and receive a Promise that resolves once network idle occurred or the global wait time has been reached
   * @param {NetworkManager} networkManager - NetworkManager object for the page being crawled
   * @param {?NetIdleOptions} [options = {}] - Optional options to control fine tune network idle determination
   * @return {Promise<void>}
   */
  static idlePromise (networkManager, options) {
    const im = new NetIdleWatcher(networkManager, options)
    return new Promise(resolve => {
      im.start()
      im.on(Events.NetworkIdleMonitor.NetworkIdle, resolve)
    })
  }

  /**
   * Setup the necessary listeners
   */
  start () {
    this._pageListenrs = [
      helper.addEventListener(
        this._networkManager,
        Events.NetworkManager.Request,
        this.reqStarted
      ),
      helper.addEventListener(
        this._networkManager,
        Events.NetworkManager.Response,
        this.reqFinished
      ),
      helper.addEventListener(
        this._networkManager,
        Events.NetworkManager.RequestFailed,
        this.reqFinished
      )
    ]
    this._requestIds.clear()
    this._doneTimers = false
    this._globalWaitTimer = setTimeout(
      this._globalNetworkTimeout,
      this._timeout
    )
  }

  /**
   * Indicate that a request was made
   * @param {Request} info - Puppeteer Request object
   */
  reqStarted (info) {
    if (!this._doneTimers) {
      this._requestIds.add(info.requestId())
      if (this._requestIds.size > this._idleInflight) {
        clearTimeout(this._idleTimer)
        this._idleTimer = null
      }
    }
  }

  /**
   * Indicate that a request has finished
   * @param {Response | Request} info - Puppeteer Request or Response object
   */
  reqFinished (info) {
    if (!this._doneTimers) {
      if (info.requestId()) {
        this._requestIds.delete(info.requestId())
      } else {
        this._requestIds.delete(info.request().requestId())
      }
      if (this._requestIds.size <= this._idleInflight && !this._idleTimer) {
        this._idleTimer = setTimeout(this._networkIdled, this._idleTime)
      }
    }
  }

  /**
   * Called when the global time limit was hit
   * @private
   */
  _globalNetworkTimeout () {
    if (!this._doneTimers) {
      this._doneTimers = true
    }
    this._clearTimers()
    process.nextTick(this._emitNetIdle)
  }

  /**
   * Called when the network idle has been determined
   * @private
   */
  _networkIdled () {
    if (!this._doneTimers) {
      this._doneTimers = true
    }
    this._clearTimers()
    process.nextTick(this._emitNetIdle)
  }

  /**
   * Emit the network-idle event
   * @private
   */
  _emitNetIdle () {
    helper.removeEventListeners(this._pageListenrs)
    this.emit(Events.NetworkIdleMonitor.NetworkIdle)
  }

  /**
   * Clear all timers
   * @private
   */
  _clearTimers () {
    if (this._globalWaitTimer) {
      clearTimeout(this._globalWaitTimer)
      this._globalWaitTimer = null
    }
    if (this._idleTimer) {
      clearTimeout(this._idleTimer)
      this._idleTimer = null
    }
  }
}

module.exports = NetIdleWatcher

/**
 * @typedef {Object} NetIdleOptions
 * @property {number} [globalWait = 40000]  - Maximum amount of time, in milliseconds, to wait for network idle to occur
 * @property {number} [numInflight = 2]     - The number of inflight requests (requests with no response) that should exist before starting the inflightIdle timer
 * @property {number} [inflightIdle = 1500] - Amount of time, in milliseconds, that should elapse when there are only numInflight requests for network idle to be determined
 */
