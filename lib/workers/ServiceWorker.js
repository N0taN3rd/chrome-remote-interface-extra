const util = require('util')
const { URL } = require('url')
const EventEmitter = require('eventemitter3')
const Events = require('../Events')
const { ExecutionContext } = require('../executionContext')
const { JSHandle } = require('../JSHandle')
const { debugError } = require('../helper')

const RunningStates = {
  stopped: 'stopped',
  starting: 'starting',
  running: 'running',
  stopping: 'stopping'
}

const StatusStates = {
  new: 'new',
  installing: 'installing',
  installed: 'installed',
  activating: 'activating',
  activated: 'activated',
  redundant: 'redundant'
}

/**
 * @see https://chromedevtools.github.io/devtools-protocol/tot/ServiceWorker
 * @since chrome-remote-interface-extra
 */
class ServiceWorker extends EventEmitter {
  /**
   * @param {WorkerManager} manager
   */
  constructor (manager) {
    super()
    /**
     * @type {WorkerManager}
     * @private
     */
    this._manager = manager

    /**
     * @type {ServiceWorkerInfo}
     * @private
     */
    this._info = {}

    /**
     * @type {?string}
     * @private
     */
    this._origin = null
  }

  /**
   *
   * @return {string}
   */
  versionId () {
    return this._info.versionId
  }

  /**
   *
   * @return {string}
   */
  registrationId () {
    return this._info.registrationId
  }

  /**
   *
   * @return {string}
   */
  scopeURL () {
    return this._info.scopeURL
  }

  /**
   *
   * @return {boolean}
   */
  isDeleted () {
    return this._info.isDeleted
  }

  /**
   *
   * @return {string}
   */
  runningStatus () {
    return this._info.runningStatus
  }

  /**
   * Returns the ServiceWorkers status
   * Possible status:
   *  - new
   *  - installing
   *  - installed
   *  - activating
   *  - activated
   *  - redundant
   * @return {string}
   */
  status () {
    return this._info.status
  }

  /**
   * @return {?number}
   */
  scriptLastModified () {
    return this._info.scriptLastModified
  }

  /**
   * @return {?number}
   */
  scriptResponseTime () {
    return this._info.scriptResponseTime
  }

  /**
   * @return {string}
   */
  targetId () {
    return this._info.targetId
  }

  /**
   * @return {?Array<string>}
   */
  controlledClients () {
    return this._info.controlledClients
  }

  /**
   * @return {boolean}
   */
  isStopped () {
    return this._info.runningStatus === RunningStates.stopped
  }

  /**
   * @return {boolean}
   */
  isStarting () {
    return this._info.runningStatus === RunningStates.starting
  }

  /**
   * @return {boolean}
   */
  isRunning () {
    return this._info.runningStatus === RunningStates.running
  }

  /**
   * @return {boolean}
   */
  isStopping () {
    return this._info.runningStatus === RunningStates.stopping
  }

  /**
   * @return {boolean}
   */
  isNew () {
    return this._info.status === StatusStates.new
  }

  /**
   * @return {boolean}
   */
  isInstalling () {
    return this._info.status === StatusStates.installing
  }

  /**
   * @return {boolean}
   */
  isInstalled () {
    return this._info.status === StatusStates.installed
  }

  /**
   * @return {boolean}
   */
  isActivating () {
    return this._info.status === StatusStates.activating
  }

  /**
   * @return {boolean}
   */
  isActivated () {
    return this._info.status === StatusStates.activated
  }

  /**
   * @return {boolean}
   */
  isRedundant () {
    return this._info.status === StatusStates.redundant
  }

  /**
   * Delivers a push message to the supplied origin from the ServiceWorker
   * @param {string} data - The data of the message
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/ServiceWorker#method-deliverPushMessage
   */
  async deliverPushMessage (data) {
    await this._manager.swDeliverPushMessage({
      registrationId: this._info.registrationId,
      origin: this._origin,
      data
    })
  }

  /**
   *
   * @param {string} tag
   * @param {boolean} [lastChance]
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/ServiceWorker#method-dispatchSyncEvent
   */
  async dispatchSyncEvent (tag, lastChance) {
    await this._manager.swDispatchSyncEvent({
      origin: this._origin,
      registrationId: this._info.registrationId,
      tag,
      lastChance
    })
  }

  /**
   * Makes the ServiceWorker skip waiting
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/ServiceWorker#method-skipWaiting
   */
  async skipWaiting () {
    await this._manager.makeServiceWorkerSkipWaiting(this._info.scopeURL)
  }

  /**
   * Starts the ServiceWorker
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/ServiceWorker#method-startWorker
   */
  async start () {
    await this._manager.startServiceWorker(this._info.scopeURL)
  }

  /**
   * Stops the ServiceWorker
   * @param {string} versionId
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/ServiceWorker#method-stopWorker
   */
  async stop (versionId) {
    await this._manager.stopServiceWorker(this._info.versionId)
  }

  /**
   * Un-registers the ServiceWorker
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/ServiceWorker#method-unregister
   */
  async unregister () {
    await this._manager.unregisterServiceWorker(this._info.scopeURL)
  }

  /**
   * Updates the ServiceWorker's registrations
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/ServiceWorker#method-updateRegistration
   */
  async updateRegistration () {
    await this._manager.updateServiceWorkerRegistration(this._info.scopeURL)
  }

  /**
   * @param {CDPServiceWorkerErrorMessage} error
   */
  _errorReported (error) {
    this.emit(Events.ServiceWorker.Error, error)
  }

  /**
   * @param {CDPServiceWorkerRegistration|CDPServiceWorkerVersion} updateHow
   * @param {boolean} isVersion
   */
  _bookKeeping (updateHow, isVersion) {
    // console.log(`ServiceWorker._bookKeeping: isVersion: ${isVersion}`, updateHow)
    let prevRegId = this._info.registrationId
    if (isVersion) {
      this._info = Object.assign(this._info, updateHow)
      this.emit(Events.ServiceWorker.VersionUpdated)
      if (this._info.isDeleted) {
        this._manager._removeServiceWorker(this.registrationId())
        this.emit(Events.ServiceWorker.Deleted)
      }
    } else {
      if (this._info.scopeURL !== updateHow.scopeURL) {
        const purl = new URL(updateHow.scopeURL)
        this._origin = purl.origin
      }
      this._info = Object.assign(this._info, updateHow)
      this.emit(Events.ServiceWorker.RegistrationUpdated)
    }
    if (prevRegId != null && prevRegId !== this._info.registrationId) {
      this._manager._ensureServiceWorkerSwapped(this, prevRegId)
    }
  }

  _destroyed () {
    this.emit(Events.ServiceWorker.Closed)
  }

  /**
   * @return {ServiceWorkerInfo}
   */
  toJSON () {
    return this._info
  }

  /** @ignore */
  // eslint-disable-next-line space-before-function-paren
  [util.inspect.custom](depth, options) {
    if (depth < 0) {
      return options.stylize(`[ServiceWorker]`, 'special')
    }
    const newOptions = Object.assign({}, options, {
      depth: options.depth == null ? null : options.depth - 1
    })
    const inner = util.inspect(this._info, newOptions)
    return `${options.stylize('ServiceWorker', 'special')} ${inner}`
  }
}

module.exports = ServiceWorker
