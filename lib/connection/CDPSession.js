const util = require('util')
const EventEmitter = require('eventemitter3')
const Events = require('../Events')
const { assert } = require('../helper')
const { createProtocolError, rewriteError } = require('../__shared')

class CDPSession extends EventEmitter {
  /**
   * @param {CRIConnection|Chrome|Object} connection
   * @param {string} targetType
   * @param {string} sessionId
   */
  constructor (connection, targetType, sessionId) {
    super()

    /**
     * @type {Map<number, Object>}
     */
    this._callbacks = new Map()

    /**
     * @type {CRIConnection|Chrome|Object}
     * @private
     */
    this._connection = connection

    /**
     * @type {string}
     * @private
     */
    this._targetType = targetType

    /**
     * @type {string}
     * @private
     */
    this._sessionId = sessionId
  }

  /**
   * Get the actual event that is emitted when the connection has closed
   * @return {string}
   */
  get $$disconnectEvent () {
    return Events.CDPSession.Disconnected
  }

  /**
   * @param {string} method - protocol method name
   * @param {!Object} [params = {}] - Optional method parameters
   * @return {Promise<Object>}
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

    const id = this._connection._rawSend({
      sessionId: this._sessionId,
      method,
      params
    })
    return new Promise((resolve, reject) => {
      this._callbacks.set(id, { resolve, reject, error: new Error(), method })
    })
  }

  /**
   * @param {Object} targetInfo
   * @return {Promise<CDPSession>}
   */
  createSession (targetInfo) {
    return this._connection.createSession(targetInfo)
  }

  /**
   * Detaches the cdpSession from the target. Once detached, the cdpSession
   * object won't emit any events and can't be used to send messages
   * @return {Promise<void>}
   */
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

  /**
   * @param {{id: ?number, method: string, params: Object, error: {message: string, data: *}, result: *}} object
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
      return options.stylize('[CDPSession]', 'special')
    }
    const newOptions = Object.assign({}, options, {
      depth: options.depth == null ? null : options.depth - 1
    })
    const inner = util.inspect(
      {
        targetType: this._targetType,
        sessionId: this._sessionId
      },
      newOptions
    )
    return `${options.stylize('CDPSession', 'special')} ${inner}`
  }
}

module.exports = CDPSession
