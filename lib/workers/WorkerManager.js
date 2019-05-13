const util = require('util')
const EventEmitter = require('eventemitter3')
const { CRIConnection } = require('../connection')
const ConsoleMessage = require('../ConsoleMessage')
const Events = require('../Events')
const { assert, helper, debugError } = require('../helper')
const ServiceWorker = require('./ServiceWorker')
const Worker = require('./Worker')

/**
 * Combination manger that juggles both Web Workers and ServiceWorkers
 * @see https://chromedevtools.github.io/devtools-protocol/tot/ServiceWorker
 * @since chrome-remote-interface-extra
 */
class WorkerManager extends EventEmitter {
  /**
   * @param {Chrome|CRIConnection|CDPSession|Object} client
   */
  constructor (client) {
    super()
    /** @type {Chrome|CRIConnection|CDPSession|Object} */
    this._client = client

    /** @type {Map<string, Worker>} */
    this._workers = new Map()

    /**
     * @type {Map<string, ServiceWorker>}
     */
    this._serviceWorkers = new Map()

    /**
     * @type {Map<string, string>}
     * @private
     */
    this._serviceWorkerTargets = new Map()

    /**
     * @type {boolean}
     * @private
     */
    this._serviceWorkersEnabled = false

    /**
     * @type {boolean}
     * @private
     */
    this._workersEnabled = false

    /**
     * @type {boolean}
     * @private
     */
    this._autoAttachEnabled = false

    this._client.on(
      'ServiceWorker.workerErrorReported',
      this._onWorkerErrorReported.bind(this)
    )

    this._client.on(
      'ServiceWorker.workerRegistrationUpdated',
      this._onWorkerRegistrationUpdated.bind(this)
    )

    this._client.on(
      'ServiceWorker.workerVersionUpdated',
      this._onWorkerVersionUpdated.bind(this)
    )

    this._client.on(
      'Target.attachedToTarget',
      this._onAttachedToTarget.bind(this)
    )

    this._client.on(
      'Target.detachedFromTarget',
      this._onDetachedFromTarget.bind(this)
    )

    this._addWorkerConsoleMessage = this._addWorkerConsoleMessage.bind(this)
    this._handleException = this._handleException.bind(this)
  }

  /**
   * Returns all ServiceWorkers the manager knows about
   * @return {Array<ServiceWorker>}
   */
  serviceWorkers () {
    return Array.from(this._serviceWorkers.values())
  }

  /**
   * Retrieve the ServiceWorker associated with the supplied registration id
   * @param {string} registrationId - The registration id of the desired ServiceWorker
   * @return {ServiceWorker}
   */
  serviceWorker (registrationId) {
    return this._serviceWorkers.get(registrationId)
  }

  /**
   * @return {Array<Worker>}
   */
  workers () {
    return Array.from(this._workers.values())
  }

  /**
   * @return {boolean}
   */
  serviceWorkerDomainEnabled () {
    return this._serviceWorkersEnabled
  }

  /**
   * @return {boolean}
   */
  workerMonitoringEnabled () {
    return this._workersEnabled
  }

  async initialize ({ workers, serviceWorkers } = {}) {
    if (typeof workers === 'boolean' && workers) {
      await this.enableWorkerMonitoring()
    }
    if (typeof serviceWorkers === 'boolean' && serviceWorkers) {
      await this.enableServiceWorkerDomain()
    }
  }

  /**
   * Enables receiving service worker events
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/ServiceWorker#method-enable
   */
  async enableServiceWorkerDomain () {
    if (this._serviceWorkersEnabled) return
    this._serviceWorkersEnabled = true
    await this._enableAutoAttach()
    await this._client.send('ServiceWorker.enable')
  }

  /**
   * Disables receiving service worker events
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/ServiceWorker#method-disable
   */
  async disableServiceWorkerDomain () {
    if (!this._serviceWorkersEnabled) return
    this._serviceWorkersEnabled = false
    await this._disableAutoAttach()
    await this._client.send('ServiceWorker.disable')
  }

  /**
   * Enables the monitoring of Worker creation and removal
   * @return {Promise<void>}
   */
  async enableWorkerMonitoring () {
    if (this._workersEnabled) return
    this._workersEnabled = true
    await this._enableAutoAttach()
  }

  /**
   * Disables the monitoring of Worker creation and removal
   * @return {Promise<void>}
   */
  async disableWorkerMonitoring () {
    if (!this._workersEnabled) return
    this._workersEnabled = false
    await this._disableAutoAttach()
  }

  /**
   * @param {boolean} forceUpdateOnPageLoad
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/ServiceWorker#method-setForceUpdateOnPageLoad
   */
  async swSetForceUpdateOnPageLoad (forceUpdateOnPageLoad) {
    if (!this._serviceWorkersEnabled) {
      throw new Error('Must enable service worker domain')
    }
    assert(
      helper.isBoolean(forceUpdateOnPageLoad),
      `The forceUpdateOnPageLoad param must be of type "string", received ${typeof forceUpdateOnPageLoad}`
    )
    this._forceUpdateState = forceUpdateOnPageLoad
    await this._client.send('ServiceWorker.setForceUpdateOnPageLoad', {
      forceUpdateOnPageLoad
    })
  }
  /**
   * Delivers a push message to the supplied origin from the ServiceWorker who's registrationId is the one supplied
   * @param {{origin: string, registrationId: string, data: string}} pushMessage
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/ServiceWorker#method-deliverPushMessage
   */
  async swDeliverPushMessage ({ origin, registrationId, data }) {
    if (!this._serviceWorkersEnabled) {
      throw new Error('Must enable service worker domain')
    }
    assert(
      helper.isString(origin),
      `The origin must be of type "string", received ${typeof origin}`
    )
    assert(
      helper.isString(registrationId),
      `The registrationId must be of type "string", received ${typeof registrationId}`
    )
    assert(
      helper.isString(data),
      `The data sent must be of type "string", received ${typeof data}`
    )
    await this._client.send('ServiceWorker.deliverPushMessage', {
      origin,
      registrationId,
      data
    })
  }
  /**
   * Delivers a sync event to the supplied origin from the ServiceWorker who's registrationId is the one supplied
   * @param {{origin: string, registrationId: string, tag: string, lastChance: boolean}} syncEvent
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/ServiceWorker#method-dispatchSyncEvent
   */
  async swDispatchSyncEvent ({ origin, registrationId, tag, lastChance }) {
    if (!this._serviceWorkersEnabled) {
      throw new Error('Must enable service worker domain')
    }
    assert(
      helper.isString(origin),
      `The origin must be of type "string", received ${typeof origin}`
    )
    assert(
      helper.isString(registrationId),
      `The registrationId must be of type "string", received ${typeof registrationId}`
    )
    assert(
      helper.isString(tag),
      `The data sent must be of type "string", received ${typeof data}`
    )
    await this._client.send('ServiceWorker.dispatchSyncEvent', {
      origin,
      registrationId,
      tag,
      lastChance: lastChance || false
    })
  }
  /**
   * Makes the ServiceWorker(s) under the supplied scope URL skip waiting
   * @param {string} scopeURL - The scope URL for the ServiceWorker(s)
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/ServiceWorker#method-skipWaiting
   */
  async makeServiceWorkerSkipWaiting (scopeURL) {
    if (!this._serviceWorkersEnabled) {
      throw new Error('Must enable service worker domain')
    }
    assert(
      helper.isString(scopeURL),
      `The scopeURL param must be of type "string", received ${typeof scopeURL}`
    )
    await this._client.send('ServiceWorker.skipWaiting', { scopeURL })
  }

  /**
   * Starts the ServiceWorker(s) under the supplied scope URL
   * @param {string} scopeURL - The scope URL for the ServiceWorker(s) to be started
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/ServiceWorker#method-startWorker
   */
  async startServiceWorker (scopeURL) {
    if (!this._serviceWorkersEnabled) {
      throw new Error('Must enable service worker domain')
    }
    assert(
      helper.isString(scopeURL),
      `The scopeURL param must be of type "string", received ${typeof scopeURL}`
    )
    await this._client.send('ServiceWorker.startWorker', { scopeURL })
  }

  /**
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/ServiceWorker#method-stopAllWorkers
   */
  async stopAllServiceWorker () {
    await this._client.send('ServiceWorker.stopAllWorkers')
  }

  /**
   * @param {string} versionId
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/ServiceWorker#method-stopWorker
   */
  async stopServiceWorker (versionId) {
    if (!this._serviceWorkersEnabled) {
      throw new Error('Must enable service worker domain')
    }
    assert(
      helper.isString(versionId),
      `The scopeURL param must be of type "string", received ${typeof versionId}`
    )
    await this._client.send('ServiceWorker.stopWorker', { versionId })
  }
  /**
   * Un-registers the ServiceWorker(s) registered under the supplied scope URL
   * @param {string} scopeURL - The scope URL to unregister the ServiceWorker(s) for
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/ServiceWorker#method-unregister
   */
  async unregisterServiceWorker (scopeURL) {
    if (!this._serviceWorkersEnabled) {
      throw new Error('Must enable service worker domain')
    }
    assert(
      helper.isString(scopeURL),
      `The scopeURL param must be of type "string", received ${typeof scopeURL}`
    )
    await this._client.send('ServiceWorker.unregister', { scopeURL })
  }
  /**
   * Updates the ServiceWorker(s) registrations under the supplied scope URL
   * @param {string} scopeURL - The scope URL for the ServiceWorker(s) to update their registrations
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/ServiceWorker#method-updateRegistration
   */
  async updateServiceWorkerRegistration (scopeURL) {
    assert(
      helper.isString(scopeURL),
      `The scopeURL param must be of type "string", received ${typeof scopeURL}`
    )
    await this._client.send('ServiceWorker.updateRegistration', { scopeURL })
  }

  /**
   * Clears the known service workers.
   * {@link Page} uses this method to get rid of them when navigating
   */
  _clearKnownWorkers () {
    for (const sw of this._serviceWorkers.values()) {
      sw._destroyed()
    }
    this._serviceWorkers.clear()
  }

  _removeServiceWorker (registrationId) {
    const sw = this._serviceWorkers.get(registrationId)
    if (sw) {
      this.emit(Events.WorkerManager.ServiceWorkerDeleted, sw)
    }
    this._serviceWorkers.delete(registrationId)
  }

  /**
   *
   * @param {ServiceWorker} swappedSW
   * @param {string} prevRegId
   */
  _ensureServiceWorkerSwapped (swappedSW, prevRegId) {
    const maybeSwappedOut = this._serviceWorkers.get(prevRegId)
    if (maybeSwappedOut && maybeSwappedOut !== swappedSW) {
      if (!this._serviceWorkers.has(swappedSW.registrationId())) {
        this._serviceWorkers.set(swappedSW.registrationId(), swappedSW)
      }
      this._removeServiceWorker(prevRegId)
    }
  }

  /**
   * @param {CDPServiceWorkerErrorMessage} errorMessage
   * @private
   */
  _onWorkerErrorReported ({ errorMessage }) {
    const sw = this._serviceWorkers.get(errorMessage.registrationId)
    if (sw) {
      sw._errorReported(errorMessage)
    }
  }

  /**
   * @param {{registrations: Array<CDPServiceWorkerRegistration>}} event
   * @private
   */
  _onWorkerRegistrationUpdated ({ registrations }) {
    for (let i = 0; i < registrations.length; i++) {
      this._updateSW(registrations[i])
    }
  }

  /**
   * @param {{versions: Array<CDPServiceWorkerVersion>}} event
   * @private
   */
  _onWorkerVersionUpdated ({ versions }) {
    for (let i = 0; i < versions.length; i++) {
      this._updateSW(versions[i], true)
    }
  }

  /**
   *
   * @param {CDPServiceWorkerRegistration|CDPServiceWorkerVersion} updateHow
   * @param {boolean} [isVersion = false]
   * @private
   */
  _updateSW (updateHow, isVersion = false) {
    // version or registration updates both have the registrationId property
    const regId = updateHow.registrationId
    let serviceWorker = this._serviceWorkers.get(regId)
    const isAdd = serviceWorker == null
    if (isAdd) {
      serviceWorker = new ServiceWorker(this)
      this._serviceWorkers.set(regId, serviceWorker)
    }
    serviceWorker._bookKeeping(updateHow, isVersion)
    if (isAdd) {
      this.emit(Events.WorkerManager.ServiceWorkerAdded, serviceWorker)
    }
  }

  _onAttachedToTarget (event) {
    // console.log(helper.inspect(event, { colors: true }))
    switch (event.targetInfo.type) {
      case 'worker':
      case 'shared_worker':
        if (!this._workersEnabled) break
        const session = CRIConnection.fromSession(this._client).session(
          event.sessionId
        )
        const worker = new Worker(
          session,
          event.targetInfo.url,
          this._addWorkerConsoleMessage,
          this._handleException
        )
        this._workers.set(event.sessionId, worker)
        this.emit(Events.WorkerManager.WorkerCreated, worker)
        return
      case 'service_worker':
        // TODO evaluation
        // console.log(helper.inspect(event, { colors: true }))
        // this._serviceWorkerTargets.set(
        //   event.targetInfo.targetId,
        //   event.sessionId
        // )
        break
    }
    // service_worker type et al
    this._client
      .send('Target.detachFromTarget', {
        sessionId: event.sessionId
      })
      .catch(debugError)
  }

  /**
   * @param targetId
   * @return {boolean}
   */
  _isActiveServiceWorkerTarget (targetId) {
    return this._serviceWorkerTargets.has(targetId)
  }

  /**
   * @param {string} targetId
   * @return {?CDPSession}
   */
  _workerSession (targetId) {
    const sessionId = this._serviceWorkerTargets.get(targetId)
    if (!sessionId) return null
    return CRIConnection.fromSession(this._client).session(sessionId)
  }

  _onDetachedFromTarget (event) {
    const worker = this._workers.get(event.sessionId)
    if (!worker) return
    this._workers.delete(event.sessionId)
    this.emit(Events.WorkerManager.WorkerDestroyed, worker)
    // TODO sw evaluation
    // if (this._serviceWorkerTargets.has(event.targetId)) {
    //   this._serviceWorkerTargets.delete(event.targetId)
    //   console.log('detached from service worker target')
    //   let regID
    //   for (const sw of this._serviceWorkers.values()) {
    //     if (sw.targetId() === event.targetId) {
    //       regID = sw.registrationId()
    //       break
    //     }
    //   }
    //   if (regID) {
    //     this._removeServiceWorker(regID)
    //   }
    // }
  }

  /**
   * @param {Object} event
   * @param {function(arg: Object):JSHandle} jsHandleFactory
   */
  _addWorkerConsoleMessage (event, jsHandleFactory) {
    const message = new ConsoleMessage(event, { jsHandleFactory })
    this.emit(Events.WorkerManager.Console, message)
  }

  /**
   * @param {!Object} exceptionDetails
   */
  _handleException (exceptionDetails) {
    const message = helper.getExceptionMessage(exceptionDetails)
    const err = new Error(message)
    err.stack = '' // Don't report client-side error with a node stack attached
    this.emit(Events.WorkerManager.Error, err)
  }

  async _enableAutoAttach () {
    if (
      !this._autoAttachEnabled &&
      !this._workersEnabled &&
      !this._serviceWorkersEnabled
    ) {
      return
    }
    this._autoAttachEnabled = true
    await this._client.send('Target.setAutoAttach', {
      autoAttach: true,
      waitForDebuggerOnStart: false,
      flatten: true
    })
  }

  async _disableAutoAttach () {
    if (
      this._autoAttachEnabled &&
      ((this._workersEnabled && !this._serviceWorkersEnabled) ||
        (!this._workersEnabled && this._serviceWorkersEnabled))
    ) {
      return
    }
    this._autoAttachEnabled = false
    await this._client.send('Target.setAutoAttach', {
      autoAttach: false,
      waitForDebuggerOnStart: false,
      flatten: true
    })
  }

  /**
   * @return {{serviceWorkers: Array<ServiceWorker>}}
   */
  toJSON () {
    return { serviceWorkers: this.serviceWorkers(), workers: this.workers() }
  }

  /** @ignore */
  // eslint-disable-next-line space-before-function-paren
  [util.inspect.custom](depth, options) {
    if (depth < 0) {
      return options.stylize(`[ServiceWorkerManager]`, 'special')
    }
    const newOptions = Object.assign({}, options, {
      depth: options.depth == null ? null : options.depth - 1
    })
    const inner = util.inspect(
      {
        serviceWorkersDomainEnabled: this._serviceWorkersEnabled,
        workerMonitoringEnabled: this._workersEnabled,
        workers: this.workers(),
        serviceWorkers: this.serviceWorkers()
      },
      newOptions
    )
    return `${options.stylize('ServiceWorkerManager', 'special')} ${inner}`
  }
}

module.exports = WorkerManager
