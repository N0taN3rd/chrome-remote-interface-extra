const util = require('util')
const Chrome = require('chrome-remote-interface/lib/chrome')
const EventEmitter = require('eventemitter3')
const WebSocket = require('ws')
const Events = require('../Events')
const CDPSession = require('./CDPSession')
const { createProtocolError, interopCRIApi } = require('../__shared')
const { helper } = require('../helper')

/**
 * An exact replica of puppeteer's Connection class that simply re-uses the prior art
 * that is the one and only chrome-remote-interface by cyrus-and
 * @since chrome-remote-interface-extra
 */
class CRIConnection extends Chrome {
  /**
   * @param {CRIOptions} [options]
   * @return {Promise<CRIConnection>}
   */
  static async connect (options) {
    const notifier = new EventEmitter()
    const connectOrError = new Promise((resolve, reject) => {
      notifier.once('connect', resolve)
      notifier.once('error', reject)
    })
    const connection = new CRIConnection(options || {}, notifier)
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

  /**
   * @param {CRIOptions} [options]
   * @param {EventEmitter} [notifier]
   */
  constructor (options, notifier) {
    super(options, notifier)
    /** @type {!Map<string, CDPSession>} */
    this._sessions = new Map()
    /** @type {!Map<number, {resolve: function(value: *): void, reject: function(reason: *): void, error: !Error, method: string}>} */
    this._crieCallbacks = new Map()
    if (this.setMaxListeners) {
      this.setMaxListeners(Infinity)
    }
    this.on(Events.CRIClient.Disconnected, this._onClose.bind(this))
    /**
     * @type {number}
     * @private
     */
    this._delay = options && helper.isNumber(options.delay) ? options.delay : 0
  }

  /**
   * Get the actual event that is emitted when the connection has closed
   * @return {string}
   */
  get $$disconnectEvent () {
    return Events.CRIConnection.Disconnected
  }

  get delay () {
    return this._delay
  }

  clearDelay () {
    this._delay = 0
  }

  setDelay (value) {
    if (helper.isNumber(value)) {
      this._delay = value
    }
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

  /**
   * @param {string} method - protocol method name
   * @param {!Object} [params = {}] - Optional method parameters
   * @return {Promise<Object>}
   */
  send (method, params = {}) {
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
   * Utility function for maintaining the original CRI API
   * @param {string} method
   * @param {Object} [params]
   * @param {*} [callback]
   * @return {*}
   */
  _interopSend (method, params, callback) {
    return super.send(method, params, callback)
  }

  /**
   * In order to have CDP sessions and allow them to operate as they do in Puppeteer we need to provide them a special
   * method for them to send their messages and this is it :)
   * @param {Object} message
   * @return {number}
   */
  _rawSend (message) {
    const id = this._nextCommandId++
    const msg = JSON.stringify(Object.assign({}, message, { id }))
    this._ws.send(msg)
    return id
  }

  /**
   * A very simple override of the original _handleMessage function that adds the handling both the puppeteer
   * API and the original CRI API (minus direct sends)
   * @param {Object} object
   * @return {*}
   * @private
   */
  _handleMessage (object) {
    if (this._delay) {
      helper.delay(this._delay).then(() => {
        this._handleMessage(object)
      })
      return
    }
    if (object.id && object.id in this._callbacks) {
      return super._handleMessage(object)
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
      if (session) {
        session._onMessage(object)
      }
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

  /**
   * This override really on exists to turn off perMessageDeflate when creating the web socket
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
          perMessageDeflate: false,
          maxPayload: 256 * 1024 * 1024 // 256Mb
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
      this._ws.on('message', message => {
        this._handleMessage(JSON.parse(message))
      })
      this._ws.on('close', () => {
        this.emit('disconnect')
      })
      this._ws.on('error', err => {
        reject(err)
      })
    })
  }

  _start () {
    return super._start().then(() => {
      interopCRIApi(this)
    })
  }

  /**
   * @return {string}
   */
  toString () {
    return util.inspect(this, { depth: null })
  }

  /** @ignore */
  // eslint-disable-next-line space-before-function-paren
  [util.inspect.custom](depth, options) {
    if (depth < 0) {
      return options.stylize('[CRIConnection]', 'special')
    }

    const newOptions = Object.assign({}, options, {
      depth: options.depth == null ? null : options.depth - 1
    })
    const inner = util.inspect(
      {
        webSocketUrl: this.webSocketUrl,
        host: this.host,
        port: this.port,
        secure: this.secure,
        useHostName: this.useHostName,
        target: this.target,
        sessions: this._sessions
      },
      newOptions
    )
    return `${options.stylize('CRIConnection', 'special')} ${inner}`
  }
}

module.exports = CRIConnection
