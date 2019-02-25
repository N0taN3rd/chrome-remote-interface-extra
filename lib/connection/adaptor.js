const CRIConnection = require('./CRIConnection')
const CDPSession = require('./CDPSession')
const Events = require('../Events')

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

  /**
   * @type {boolean}
   */
  cdpClient._closed = false

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
   * @param {function(...*)} callback
   * @return {number}
   */
  cdpClient._sessionSend = function _sessionSend (message, callback) {
    const id = this._nextCommandId++
    this._ws.send(JSON.stringify(Object.assign({}, message, { id })), err => {
      if (err) {
        // handle low-level WebSocket errors
        if (typeof callback === 'function') {
          callback(err)
        }
      } else {
        this._callbacks[id] = callback
      }
    })
    return id
  }

  /**
   * @param {Object} message
   * @return {*}
   */
  cdpClient.__originalHandleMessage$$ = cdpClient._handleMessage

  /**
   * @param {Object} message
   * @return {*}
   */
  cdpClient._handleMessage = function _handleMessage (message) {
    if (message.method === 'Target.attachedToTarget') {
      const sessionId = message.params.sessionId
      const session = new CDPSession(
        this,
        message.params.targetInfo.type,
        sessionId
      )
      this._sessions.set(sessionId, session)
    } else if (message.method === 'Target.detachedFromTarget') {
      const session = this._sessions.get(message.params.sessionId)
      if (session) {
        session._onClosed()
        this._sessions.delete(message.params.sessionId)
      }
    }
    if (message.sessionId) {
      const session = this._sessions.get(message.sessionId)
      if (session) session._onMessage(message)
    }
    return this.__originalHandleMessage$$(message)
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
  return cdpClient
}
