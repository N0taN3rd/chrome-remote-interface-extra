const CRIConnection = require('./CRIConnection')
const CDPSession = require('./CDPSession')
const Events = require('../Events')
const { interopCRIApi, createProtocolError } = require('../__shared')

/**
 * @desc A Symbol used to indicated we patched an original instance of chrome-remote-interface client (Chrome)
 * @type {symbol}
 */
const CRIClientPatched = Symbol('chrome-remote-interface-extra-client-patched')

/**
 * @desc A Symbol used to indicated we patched an original instance of chrome-remote-interface client (Chrome)
 * @type {symbol}
 */
exports.CRIClientPatched = CRIClientPatched

/**
 * @desc Adapts the client object returned by the default module.export of the chrome-remote-interface to appear and behave like the puppeteer classes
 * @param {Chrome|CRIConnection|CDPSession|Object} cdpClient
 * @return {Chrome|CRIConnection|CDPSession}
 */
exports.adaptChromeRemoteInterfaceClient = function adaptChromeRemoteInterfaceClient (
  cdpClient
) {
  if (cdpClient instanceof CRIConnection || cdpClient instanceof CDPSession) {
    return cdpClient
  }

  if (cdpClient[CRIClientPatched]) return cdpClient

  /**
   * @type {!Map<string, !CDPSession>}
   */
  cdpClient._sessions = new Map()
  cdpClient._crieCallbacks = new Map()

  /**
   * @type {boolean}
   */
  cdpClient._closed = false

  /**
   * @param {Object} message
   * @return {*}
   */
  cdpClient.__originalHandleMessage$$ = cdpClient._handleMessage.bind(cdpClient)
  cdpClient.__originalSend$$ = cdpClient.send.bind(cdpClient)

  /**
   * @param {string} sessionId
   * @return {?CDPSession}
   */
  cdpClient.session = function session (sessionId) {
    return this._sessions.get(sessionId) || null
  }

  /**
   *
   */
  cdpClient.dispose = function dispose () {
    this._onClose()
    this.close()
  }

  /**
   * @param {Object} targetInfo
   * @return {Promise<CDPSession>}
   */
  cdpClient.createSession = async function createSession (targetInfo) {
    const { sessionId } = await this.send('Target.attachToTarget', {
      targetId: targetInfo.targetId,
      flatten: true
    })
    return this._sessions.get(sessionId)
  }

  cdpClient.send = function send (method, params = {}) {
    const id = this._rawSend({ method, params })
    return new Promise((resolve, reject) => {
      this._crieCallbacks.set(id, {
        resolve,
        reject,
        error: new Error(),
        method
      })
    })
  }

  /**
   */
  cdpClient._onClose = function _onClose () {
    if (this._closed) return
    this._closed = true
    for (const session of this._sessions.values()) {
      session._onClosed()
    }
    this._sessions.clear()
    this.emit(Events.CRIConnection.Disconnected)
  }

  /**
   *
   * @param {Object} message
   * @return {number}
   */
  cdpClient._rawSend = function _rawSend (message) {
    const id = this._nextCommandId++
    const msg = JSON.stringify(Object.assign({}, message, { id }))
    this._ws.send(msg)
    return id
  }

  /**
   * @param {Object} object
   * @return {*}
   */
  cdpClient._handleMessage = function _handleMessage (object) {
    if (object.id && object.id in this._callbacks) {
      return this.__originalHandleMessage$$(object)
    }
    if (object.method === 'Target.attachedToTarget') {
      const sessionId = object.params.sessionId
      const session = new CDPSession(
        this,
        object.params.targetInfo.type,
        sessionId
      )
      this._sessions.set(sessionId, session)
    } else if (object.method === 'Target.detachedFromTarget') {
      const session = this._sessions.get(object.params.sessionId)
      if (session) {
        session._onClosed()
        this._sessions.delete(object.params.sessionId)
      }
    }
    if (object.sessionId) {
      const session = this._sessions.get(object.sessionId)
      if (session) session._onMessage(object)
    } else if (object.id) {
      const cb = this._crieCallbacks.get(object.id)
      if (cb) {
        this._crieCallbacks.delete(object.id)
        if (object.error) {
          cb.reject(createProtocolError(cb.error, cb.method, object))
        } else {
          cb.resolve(object.result)
        }
      }
    } else {
      this.emit(object.method, object.params)
    }
  }

  cdpClient._interopSend = function _interopSend (method, params, callback) {
    return this.__originalSend$$(method, params, callback)
  }

  Object.defineProperty(cdpClient, CRIClientPatched, {
    value: true,
    writable: false,
    enumerable: false
  })

  Object.defineProperty(cdpClient, '$$disconnectEvent', {
    value: Events.CRIConnection.Disconnected,
    writable: false,
    enumerable: false
  })

  cdpClient.on(
    Events.CRIClient.Disconnected,
    cdpClient._onClose.bind(cdpClient)
  )
  if (cdpClient.setMaxListeners) {
    cdpClient.setMaxListeners(Infinity)
  }
  interopCRIApi(cdpClient)
  return cdpClient
}
