const Chrome = require('chrome-remote-interface/lib/chrome')
const EventEmitter = require('eventemitter3')
const WebSocket = require('ws')
const Events = require('../Events')
const CDPSession = require('./CDPSession')

/**
 * @desc An exact replica of puppeteer's Connection class that simply re-uses the prior art
 * that is the one and only chrome-remote-interface by cyrus-and
 */
class CRIConnection extends Chrome {
  /**
   * @param {Object} [options]
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

  constructor (options, notifier) {
    super(options, notifier)
    /**
     * @type {!Map<string, CDPSession>}
     */
    this._sessions = new Map()

    /**
     * @desc Should the chrome remote interface wonderful abstractions around calling CDP methods be added to
     * CDP sessions
     * @type {boolean}
     */
    this.addCRIApiToSessions = !!(options && options.addCRIApiToSessions)

    this.on(Events.CRIClient.Disconnected, this._onClose.bind(this))
    this.setMaxListeners(Infinity)
  }

  /**
   * @desc Get the actual event that is emitted when the connection has closed
   * @return {string}
   */
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
   * @return {Promise<CDPSession>}
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

  /**
   * @desc In order to have CDP sessions and allow them to operate as they do in Puppeteer we need to provide them a special
   * method for them to send their messages and this is it :)
   * @param {Object} message
   * @param {*} callback
   * @return {number}
   * @protected
   */
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

  /**
   * @desc A very simple override of the original _handleMessage function that adds the handling of the creation and
   * removal of CDPSessions, as well as, message passing to them. It only took an extra 20 lines of formatted code to do this :)
   * @param {Object} message
   * @return {*}
   * @private
   */
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

  /**
   * @desc This override really on exists to turn off perMessageDeflate when creating the web socket
   * @return {Promise<*>}
   * @private
   */
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
      this._ws.on('close', () => {
        this.emit('disconnect')
      })
      this._ws.on('error', err => {
        reject(err)
      })
    })
  }
}

/**
 * @type {CRIConnection}
 */
module.exports = CRIConnection
