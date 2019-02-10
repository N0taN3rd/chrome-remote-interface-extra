const EventEmitter = require('eventemitter3')
const Chrome = require('chrome-remote-interface/lib/chrome')
const { Events } = require('./Events')
const { assert } = require('./helper')

const noop = () => {}

const CDPClientPatched = Symbol('chrome-remote-interface-client-patched')

/**
 * @desc Adapts the client object returned by the default module.export of the chrome-remote-interface to appear and behavie like the puppeteer classes
 * @param {Chrome|Object} cdpClient
 * @return {Chrome|CRIConnection|CRISession}
 */
function adaptChromeRemoteInterfaceClient (cdpClient) {
  if (cdpClient instanceof CRIConnection || cdpClient instanceof CRISession) {
    return cdpClient
  }

  if (cdpClient[CDPClientPatched]) return cdpClient

  /**
   * @type {!Map<string, !CRISession>}
   */
  cdpClient._sessions = new Map()

  /**
   * @type {boolean}
   */
  cdpClient._closed = false

  /**
   * @param {string} sessionId
   * @return {?CRISession}
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
   * @return {!Promise<!CRISession>}
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
   * @private
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
  cdpClient.__originalHandleMessage = cdpClient._handleMessage

  /**
   * @param {Object} message
   * @return {*}
   */
  cdpClient._handleMessage = function _handleMessage (message) {
    if (message.method === 'Target.attachedToTarget') {
      const sessionId = message.params.sessionId
      const session = new CRISession(
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
    return this.__originalHandleMessage(message)
  }

  Object.defineProperty(cdpClient, CDPClientPatched, {
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
  return cdpClient
}

class CRIConnection extends Chrome {
  constructor (options, notifier) {
    super(options, notifier)
    /**
     * @type {!Map<string, !CRISession>}
     */
    this._sessions = new Map()

    this.on(Events.CRIClient.Disconnected, this._onClose.bind(this))
  }

  static async connect (options) {
    const notifier = new EventEmitter()
    const connectOrError = new Promise((resolve, reject) => {
      notifier.once('connect', resolve)
      notifier.once('error', reject)
    })
    const connection = new CRIConnection(options, notifier)
    await connectOrError
    return connection
  }

  /**
   * @param {CRISession|Chrome|Object} session
   * @return {CRIConnection|Chrome|Object}
   */
  static fromSession (session) {
    if (session instanceof CRISession) {
      return session._connection
    }
    return session
  }

  get $$disconnectEvent () {
    return Events.CRIConnection.Disconnected
  }

  /**
   * @param {string} sessionId
   * @return {?CRISession}
   */
  session (sessionId) {
    return this._sessions.get(sessionId) || null
  }

  dispose () {
    this._onClose()
    this.close()
  }

  /**
   * @param {Object} targetInfo
   * @return {!Promise<!CRISession>}
   */
  async createSession (targetInfo) {
    const { sessionId } = await this.send('Target.attachToTarget', {
      targetId: targetInfo.targetId,
      flatten: true
    })
    return this._sessions.get(sessionId)
  }

  _onClose () {
    if (this._closed) return
    this._closed = true
    for (const session of this._sessions.values()) {
      session._onClosed()
    }
    this._sessions.clear()
    this.emit(Events.CRIClient.Disconnected)
  }

  _sessionSend (message, callback) {
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

  _handleMessage (message) {
    if (message.method === 'Target.attachedToTarget') {
      const sessionId = message.params.sessionId
      const session = new CRISession(
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
    return super._handleMessage(message)
  }
}

class CRISession extends EventEmitter {
  /**
   * @param {CRIConnection|Chrome|Object} connection
   * @param {string} targetType
   * @param {string} sessionId
   */
  constructor (connection, targetType, sessionId) {
    super()
    /**
     * @type {!Map<number, {resolve: function(value:*), reject: function(value: *), error: !Error, method: string}>}
     */
    this._callbacks = new Map()
    this._connection = connection
    this._targetType = targetType
    this._sessionId = sessionId
  }

  get $$disconnectEvent () {
    return Events.CDPSession.Disconnected
  }

  /**
   * @param {string} method
   * @param {!Object=} params
   * @return {!Promise<?Object>}
   */
  send (method, params = {}) {
    if (!this._connection) {
      return Promise.reject(
        new Error(
          `Protocol error (${method}): Session closed. Most likely the ${
            this._targetType
          } has been closed.`
        )
      )
    }

    const id = this._connection._sessionSend(
      {
        sessionId: this._sessionId,
        method,
        params
      },
      noop
    )
    return new Promise((resolve, reject) => {
      this._callbacks.set(id, { resolve, reject, error: new Error(), method })
    })
  }

  /**
   * @param {{id?: number, method: string, params: Object, error: {message: string, data: any}, result?: *}} object
   */
  _onMessage (object) {
    if (object.id && this._callbacks.has(object.id)) {
      const callback = this._callbacks.get(object.id)
      this._callbacks.delete(object.id)
      if (object.error) {
        callback.reject(
          createProtocolError(callback.error, callback.method, object)
        )
      } else {
        callback.resolve(object.result)
      }
    } else {
      assert(!object.id)
      this.emit(object.method, object.params)
    }
  }

  async detach () {
    if (!this._connection) {
      throw new Error(
        `Session already detached. Most likely the ${
          this._targetType
        } has been closed.`
      )
    }
    await this._connection.send('Target.detachFromTarget', {
      sessionId: this._sessionId
    })
  }

  _onClosed () {
    for (const callback of this._callbacks.values()) {
      callback.reject(
        rewriteError(
          callback.error,
          `Protocol error (${callback.method}): Target closed.`
        )
      )
    }
    this._callbacks.clear()
    this._connection = null
    this.emit(Events.CDPSession.Disconnected)
  }
}

/**
 * @param {!Error} error
 * @param {string} method
 * @param {{error: {message: string, data: any}}} object
 * @return {!Error}
 */
function createProtocolError (error, method, object) {
  let message = `Protocol error (${method}): ${object.error.message}`
  if ('data' in object.error) message += ` ${object.error.data}`
  return rewriteError(error, message)
}

/**
 * @param {!Error} error
 * @param {string} message
 * @return {!Error}
 */
function rewriteError (error, message) {
  error.message = message
  return error
}

module.exports = {
  CRIConnection,
  CRISession,
  adaptChromeRemoteInterfaceClient,
  CDPClientPatched
}
