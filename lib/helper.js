/* eslint no-useless-call: "off", no-undef: "off" */
const debugError = require('debug')(`cri-extra:error`)
const { TimeoutError } = require('./Errors')

/**
 * @param {*} value
 * @param {string=} message
 */
function assert (value, message) {
  if (!value) throw new Error(message)
}

/**
 * @param {*} arg
 * @return {string}
 */
function serializeArgument (arg) {
  if (Object.is(arg, undefined)) return 'undefined'
  return JSON.stringify(arg)
}

class Helper {
  /**
   * @param {Function|string} fun
   * @param {...*} args
   * @return {string}
   */
  static evaluationString (fun, ...args) {
    if (Helper.isString(fun)) {
      assert(args.length === 0, 'Cannot evaluate a string with arguments')
      return /** @type {string} */ (fun)
    }
    return `(${fun})(${args.map(serializeArgument).join(',')})`
  }

  /**
   * @param {!Object} exceptionDetails
   * @return {string}
   */
  static getExceptionMessage (exceptionDetails) {
    if (exceptionDetails.exception) {
      return (
        exceptionDetails.exception.description ||
        exceptionDetails.exception.value
      )
    }
    let message = [exceptionDetails.text]
    if (exceptionDetails.stackTrace) {
      const callFrames = exceptionDetails.stackTrace.callFrame
      for (let i = 0; i < callFrames.length; i++) {
        const callFrame = callFrames[i]
        const location = `${callFrame.url}:${callFrame.lineNumber}:${
          callFrame.columnNumber
        }`
        const functionName = callFrame.functionName || '<anonymous>'
        message.push(`\n    at ${functionName} (${location})`)
      }
    }
    return message.join('')
  }

  /**
   * @param {!Object} remoteObject
   * @return {*}
   */
  static valueFromRemoteObject (remoteObject) {
    assert(
      !remoteObject.objectId,
      'Cannot extract value when objectId is given'
    )
    if (remoteObject.unserializableValue) {
      if (remoteObject.type === 'bigint' && typeof BigInt !== 'undefined') {
        return BigInt(remoteObject.unserializableValue.replace('n', ''))
      }
      switch (remoteObject.unserializableValue) {
        case '-0':
          return -0
        case 'NaN':
          return NaN
        case 'Infinity':
          return Infinity
        case '-Infinity':
          return -Infinity
        default:
          throw new Error(
            'Unsupported unserializable value: ' +
              remoteObject.unserializableValue
          )
      }
    }
    return remoteObject.value
  }

  /**
   * @param {Chrome|CRIConnection|CDPSession|Object} client
   * @param {!Protocol.Runtime.RemoteObject} remoteObject
   */
  static async releaseObject (client, remoteObject) {
    if (!remoteObject.objectId) return
    await client
      .send('Runtime.releaseObject', { objectId: remoteObject.objectId })
      .catch(error => {
        // Exceptions might happen in case of a page been navigated or closed.
        // Swallow these since they are harmless and we don't leak anything in this case.
        debugError(error)
      })
  }

  /**
   * @param {!Object} classType
   */
  static installAsyncStackHooks (classType) {
    for (const methodName of Reflect.ownKeys(classType.prototype)) {
      const method = Reflect.get(classType.prototype, methodName)
      if (
        methodName === 'constructor' ||
        typeof methodName !== 'string' ||
        methodName.startsWith('_') ||
        typeof method !== 'function' ||
        method.constructor.name !== 'AsyncFunction'
      ) {
        continue
      }
      Reflect.set(classType.prototype, methodName, function (...args) {
        const syncStack = new Error()
        return method.call(this, ...args).catch(e => {
          const stack = syncStack.stack.substring(
            syncStack.stack.indexOf('\n') + 1
          )
          const clientStack = stack.substring(stack.indexOf('\n'))
          if (!e.stack.includes(clientStack)) {
            e.stack += '\n  -- ASYNC --\n' + stack
          }
          throw e
        })
      })
    }
  }

  /**
   * @param {Object} emitter
   * @param {(string|symbol)} eventName
   * @param {function(?)} handler
   * @return {{emitter: !Object, eventName: (string|symbol), handler: function(?)}}
   */
  static addEventListener (emitter, eventName, handler) {
    emitter.on(eventName, handler)
    return { emitter, eventName, handler }
  }

  /**
   * @param {!Array<{emitter: !Object, eventName: (string|symbol), handler: function(?)}>} listeners
   */
  static removeEventListeners (listeners) {
    let listener
    for (let i = 0; i < listeners.length; i++) {
      listener = listeners[i]
      listener.emitter.removeListener(listener.eventName, listener.handler)
    }
    listeners.splice(0, listeners.length)
  }

  /**
   * @param {!Object} obj
   * @return {boolean}
   */
  static isString (obj) {
    return typeof obj === 'string' || obj instanceof String
  }

  /**
   * @param {!Object} obj
   * @return {boolean}
   */
  static isNumber (obj) {
    return typeof obj === 'number' || obj instanceof Number
  }

  static promisify (nodeFunction) {
    function promisified (...args) {
      return new Promise((resolve, reject) => {
        function callback (err, ...result) {
          if (err) return reject(err)
          if (result.length === 1) return resolve(result[0])
          return resolve(result)
        }
        nodeFunction.call(null, ...args, callback)
      })
    }
    return promisified
  }

  /**
   * @param {!NodeJS.EventEmitter} emitter
   * @param {string} eventName
   * @param {function} predicate
   * @param timeout
   * @return {!Promise}
   */
  static waitForEvent (emitter, eventName, predicate, timeout) {
    let eventTimeout, resolveCallback, rejectCallback
    const promise = new Promise((resolve, reject) => {
      resolveCallback = resolve
      rejectCallback = reject
    })
    const listener = Helper.addEventListener(emitter, eventName, event => {
      if (!predicate(event)) return
      cleanup()
      resolveCallback(event)
    })
    if (timeout) {
      eventTimeout = setTimeout(() => {
        cleanup()
        rejectCallback(
          new TimeoutError('Timeout exceeded while waiting for event')
        )
      }, timeout)
    }
    function cleanup () {
      Helper.removeEventListeners([listener])
      clearTimeout(eventTimeout)
    }
    return promise
  }

  /**
   * @template T
   * @param {!Promise<T>} promise
   * @param {string} taskName
   * @param {number} timeout
   * @return {!Promise<T>}
   */
  static async waitWithTimeout (promise, taskName, timeout) {
    let reject_
    const timeoutError = new TimeoutError(
      `waiting for ${taskName} failed: timeout ${timeout}ms exceeded`
    )
    const timeoutPromise = new Promise((resolve, reject) => (reject_ = reject))
    const timeoutTimer = setTimeout(() => reject_(timeoutError), timeout)
    try {
      return await Promise.race([promise, timeoutPromise])
    } finally {
      clearTimeout(timeoutTimer)
    }
  }

  static noop () {}
}

module.exports = {
  debugError,
  assert,
  helper: Helper
}
