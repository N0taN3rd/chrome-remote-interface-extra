const Chrome = require('chrome-remote-interface/lib/chrome')
const EventEmitter = require('eventemitter3')
const WebSocket = require('ws')
const { Events } = require('./Events')
const { assert } = require('./helper')

const noop = () => {}

/**
 * @desc A Symbol used to indicated we patched an original instance of chrome-remote-interface client (Chrome)
 * @type {symbol}
 */
const CRIClientPatched = Symbol('chrome-remote-interface-extra-client-patched')

class AdaptorHelper {
  static raiseErrorOnBadCDPSessionConnection (connection) {
    if (
      connection instanceof CRIConnection ||
      connection instanceof CDPSession
    ) {
      return
    }
    if (connection instanceof Chrome && !connection[CRIClientPatched]) {
      throw new Error(
        'A CDPSession was created using a chrome-remote-interface client object that was not patched'
      )
    }
  }

  static createProtocolError (error, method, object) {
    const extra = 'data' in object.error ? ` ${object.error.data}` : ''
    const message = `Protocol error (${method}): ${
      object.error.message
    }${extra}`
    return AdaptorHelper.rewriteError(error, message)
  }

  static rewriteError (error, message) {
    error.message = message
    return error
  }

  static addCommandToSession (session, domainName, commandName, fullCommand) {
    session[domainName][commandName] = params => {
      return session.send(fullCommand, params)
    }
  }

  static addCommandsToSession (session, domainName, commands) {
    const numCommands = commands.length
    let commandName
    let i = 0
    for (; i < numCommands; i++) {
      commandName = commands[i].name
      AdaptorHelper.addCommandToSession(
        session,
        domainName,
        commandName,
        `${domainName}.${commandName}`
      )
    }
  }

  static addEventToSession (session, domainName, eventName, fullEventName) {
    session[domainName][eventName] = handler => {
      if (typeof handler === 'function') {
        session.on(fullEventName, handler)
        return () => session.removeListener(fullEventName, handler)
      } else {
        return new Promise((resolve, reject) => {
          session.once(fullEventName, resolve)
        })
      }
    }
  }

  static addEventsToSession (session, domainName, events) {
    const numEvents = events.length
    let eventName
    let i = 0
    for (; i < numEvents; i++) {
      eventName = events[i].name
      AdaptorHelper.addEventToSession(
        session,
        domainName,
        eventName,
        `${domainName}.${eventName}`
      )
    }
  }

  static putCRIApiOnSession (session, protocol) {
    session.protocol = protocol
    if (protocol.domains) {
      const domains = protocol.domains
      const numDomains = domains.length
      let i = 0
      let domain
      let domainName
      for (; i < numDomains; i++) {
        domain = domains[i]
        domainName = domains[i].domain
        session[domainName] = {}
        if (domain.commands) {
          AdaptorHelper.addCommandsToSession(
            session,
            domainName,
            domain.commands
          )
        }
        if (domain.events) {
          AdaptorHelper.addEventsToSession(session, domainName, domain.events)
        }
      }
    }
  }
}

/**
 * @desc Adapts the client object returned by the default module.export of the chrome-remote-interface to appear and behavie like the puppeteer classes
 * @param {Chrome|Object} cdpClient
 * @return {Chrome|CRIConnection|CDPSession}
 */
function adaptChromeRemoteInterfaceClient (cdpClient) {
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
   * @return {!Promise<!CDPSession>}
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
  cdpClient.setMaxListeners(Infinity)
  return cdpClient
}

class CRIConnection extends Chrome {
  constructor (options, notifier) {
    super(options, notifier)
    /**
     * @type {!Map<string, !CDPSession>}
     */
    this._sessions = new Map()

    this.addCRIApiToSessions = !!(options && options.addCRIApiToSessions)

    this.on(Events.CRIClient.Disconnected, this._onClose.bind(this))
    this.setMaxListeners(Infinity)
  }

  /**
   * @param options
   * @return {Promise<CRIConnection>}
   */
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
   * @param {CDPSession|Chrome|Object} session
   * @return {CRIConnection|Chrome|Object}
   */
  static fromSession (session) {
    if (session instanceof CDPSession) {
      return session._connection
    }
    return session
  }

  get $$disconnectEvent () {
    return Events.CRIConnection.Disconnected
  }

  /**
   * @param {string} sessionId
   * @return {?CDPSession}
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
   * @return {!Promise<!CDPSession>}
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
    return super._handleMessage(message)
  }

  _connectToWebSocket () {
    return new Promise((resolve, reject) => {
      // create the WebSocket
      try {
        if (this.secure) {
          this.webSocketUrl = this.webSocketUrl.replace(/^ws:/i, 'wss:')
        }
        this._ws = new WebSocket(this.webSocketUrl, [], {
          perMessageDeflate: false
        })
      } catch (err) {
        // handles bad URLs
        reject(err)
        return
      }
      // set up event handlers
      this._ws.on('open', () => {
        resolve()
      })
      this._ws.on('message', data => {
        const message = JSON.parse(data)
        this._handleMessage(message)
      })
      this._ws.on('close', code => {
        this.emit('disconnect')
      })
      this._ws.on('error', err => {
        reject(err)
      })
    })
  }
}

class CDPSession extends EventEmitter {
  /**
   * @param {CRIConnection|Chrome|Object} connection
   * @param {string} targetType
   * @param {string} sessionId
   */
  constructor (connection, targetType, sessionId) {
    super()
    AdaptorHelper.raiseErrorOnBadCDPSessionConnection(connection)
    /**
     * @type {!Map<number, {resolve: function(value:*), reject: function(value: *), error: !Error, method: string}>}
     */
    this._callbacks = new Map()
    this._connection = connection
    this._targetType = targetType
    this._sessionId = sessionId
    if (connection.addCRIApiToSessions && connection.protocol) {
      AdaptorHelper.putCRIApiOnSession(this, connection.protocol)
    }
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
   * @param {{id?: number, method: string, params: Object, error: {message: string, data: *}, result?: *}} object
   */
  _onMessage (object) {
    if (object.id && this._callbacks.has(object.id)) {
      const callback = this._callbacks.get(object.id)
      this._callbacks.delete(object.id)
      if (object.error) {
        callback.reject(
          AdaptorHelper.createProtocolError(
            callback.error,
            callback.method,
            object
          )
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
        AdaptorHelper.rewriteError(
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

module.exports = {
  AdaptorHelper,
  CRIClientPatched,
  CRIConnection,
  CDPSession,
  adaptChromeRemoteInterfaceClient
}
