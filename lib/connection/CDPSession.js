const EventEmitter = require('eventemitter3')
const Events = require('../Events')
const { assert } = require('../helper')
const { AdaptorHelper } = require('./_shared')

const noop = () => {}

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
    if (connection.addCRIApiToSessions && connection.protocol) {
      AdaptorHelper.putCRIApiOnSession(this, connection.protocol)
    }
  }

  /**
   * @desc Get the actual event that is emitted when the connection has closed
   * @return {string}
   */
  get $$disconnectEvent () {
    return Events.CDPSession.Disconnected
  }

  /**
   * @param {string} method
   * @param {!Object} [params = {}]
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
   * @param {{id: ?number, method: string, params: Object, error: {message: string, data: *}, result: *}} object
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

/**
 * @type {CDPSession}
 */
module.exports = CDPSession
