/* eslint no-new-func: "off", no-new: "off", valid-typeof: "off" */
const util = require('util')
const { helper, assert } = require('../helper')
const { createJSHandle, JSHandle } = require('../JSHandle')
const EVALUATION_SCRIPT_URL = require('./evalURL')

const SOURCE_URL_REGEX = /^[\040\t]*\/\/[@#] sourceURL=\s*(\S*?)\s*$/m
const SUFFIX = `//# sourceURL=${EVALUATION_SCRIPT_URL}`

class ExecutionContext {
  /**
   * @param {Chrome|CRIConnection|CDPSession|Object} client
   * @param {!Object} contextPayload
   * @param {?DOMWorld} world
   */
  constructor (client, contextPayload, world) {
    /**
     * @type {Chrome|CRIConnection|CDPSession|Object}
     */
    this._client = client
    /**
     * @type {?DOMWorld}
     * @private
     */
    this._world = world
    /**
     * @type {string}
     * @private
     */
    this._contextId = contextPayload.id

    /**
     * @type {!Object}
     * @private
     */
    this._contextPayload = contextPayload
  }

  /**
   * @return {?Frame}
   */
  frame () {
    return this._world ? this._world.frame() : null
  }

  /**
   * @param {Function|string} pageFunction
   * @param {...*} args
   * @return {Promise<Object>}
   */
  async evaluate (pageFunction, ...args) {
    const handle = await this.evaluateHandle(pageFunction, ...args)
    const result = await handle.jsonValue().catch(error => {
      if (error.message.includes('Object reference chain is too long')) return
      if (error.message.includes("Object couldn't be returned by value")) return
      throw error
    })
    await handle.dispose()
    return result
  }

  /**
   * @param {Function|string} pageFunction
   * @param {...*} args
   * @return {Promise<JSHandle>}
   */
  async evaluateHandle (pageFunction, ...args) {
    if (helper.isString(pageFunction)) {
      const contextId = this._contextId
      const expression = /** @type {string} */ (pageFunction)
      const expressionWithSourceUrl = SOURCE_URL_REGEX.test(expression)
        ? expression
        : expression + '\n' + SUFFIX
      const { exceptionDetails, result: remoteObject } = await this._client
        .send('Runtime.evaluate', {
          expression: expressionWithSourceUrl,
          contextId,
          returnByValue: false,
          awaitPromise: true,
          userGesture: true
        })
        .catch(rewriteError)
      if (exceptionDetails) {
        throw new Error(
          'Evaluation failed: ' + helper.getExceptionMessage(exceptionDetails)
        )
      }
      return createJSHandle(this, remoteObject)
    }

    if (typeof pageFunction !== 'function') {
      throw new Error(
        `Expected to get |string| or |function| as the first argument, but got "${pageFunction}" instead.`
      )
    }

    let functionText = pageFunction.toString()
    try {
      new Function('(' + functionText + ')')
    } catch (e1) {
      // This means we might have a function shorthand. Try another
      // time prefixing 'function '.
      if (functionText.startsWith('async ')) {
        functionText =
          'async function ' + functionText.substring('async '.length)
      } else {
        functionText = 'function ' + functionText
      }
      try {
        new Function('(' + functionText + ')')
      } catch (e2) {
        // We tried hard to serialize, but there's a weird beast here.
        throw new Error('Passed function is not well-serializable!')
      }
    }
    let callFunctionOnPromise
    try {
      callFunctionOnPromise = this._client.send('Runtime.callFunctionOn', {
        functionDeclaration: functionText + '\n' + SUFFIX + '\n',
        executionContextId: this._contextId,
        arguments: args.map(convertArgument.bind(this)),
        returnByValue: false,
        awaitPromise: true,
        userGesture: true
      })
    } catch (err) {
      if (
        err instanceof TypeError &&
        err.message === 'Converting circular structure to JSON'
      ) {
        err.message += ' Are you passing a nested JSHandle?'
      }
      throw err
    }
    const {
      exceptionDetails,
      result: remoteObject
    } = await callFunctionOnPromise.catch(rewriteError)
    if (exceptionDetails) {
      throw new Error(
        'Evaluation failed: ' + helper.getExceptionMessage(exceptionDetails)
      )
    }
    return createJSHandle(this, remoteObject)
  }

  /**
   * @param {!JSHandle} prototypeHandle
   * @return {Promise<JSHandle>}
   */
  async queryObjects (prototypeHandle) {
    assert(!prototypeHandle._disposed, 'Prototype JSHandle is disposed!')
    assert(
      prototypeHandle._remoteObject.objectId,
      'Prototype JSHandle must not be referencing primitive value'
    )
    const response = await this._client.send('Runtime.queryObjects', {
      prototypeObjectId: prototypeHandle._remoteObject.objectId
    })
    return createJSHandle(this, response.objects)
  }

  /**
   * @param {ElementHandle} elementHandle
   * @return {Promise<ElementHandle>}
   */
  async _adoptElementHandle (elementHandle) {
    assert(
      elementHandle.executionContext() !== this,
      'Cannot adopt handle that already belongs to this execution context'
    )
    assert(this._world, 'Cannot adopt handle without DOMWorld')
    const nodeInfo = await this._client.send('DOM.describeNode', {
      objectId: elementHandle._remoteObject.objectId
    })
    const { object } = await this._client.send('DOM.resolveNode', {
      backendNodeId: nodeInfo.node.backendNodeId,
      executionContextId: this._contextId
    })
    return /** @type {ElementHandle} */ (createJSHandle(this, object))
  }

  /** @ignore */
  // eslint-disable-next-line space-before-function-paren
  [util.inspect.custom](depth, options) {
    if (depth < 0) {
      return options.stylize('[ExecutionContext]', 'special')
    }

    const newOptions = Object.assign({}, options, {
      depth: options.depth == null ? null : options.depth - 1
    })
    const inner = util.inspect(this._contextPayload, newOptions)
    return `${options.stylize('ExecutionContext', 'special')} ${inner}`
  }
}

/**
 * @param {*} arg
 * @return {*}
 * @this {ExecutionContext}
 */
function convertArgument (arg) {
  if (typeof arg === 'bigint') {
    return { unserializableValue: `${arg.toString()}n` }
  }
  if (Object.is(arg, -0)) return { unserializableValue: '-0' }
  if (Object.is(arg, Infinity)) return { unserializableValue: 'Infinity' }
  if (Object.is(arg, -Infinity)) return { unserializableValue: '-Infinity' }
  if (Object.is(arg, NaN)) return { unserializableValue: 'NaN' }
  const objectHandle = arg && arg instanceof JSHandle ? arg : null
  if (objectHandle) {
    if (objectHandle._context !== this) {
      throw new Error(
        'JSHandles can be evaluated only in the context they were created!'
      )
    }
    if (objectHandle._disposed) throw new Error('JSHandle is disposed!')
    if (objectHandle._remoteObject.unserializableValue) {
      return {
        unserializableValue: objectHandle._remoteObject.unserializableValue
      }
    }
    if (!objectHandle._remoteObject.objectId) {
      return { value: objectHandle._remoteObject.value }
    }
    return { objectId: objectHandle._remoteObject.objectId }
  }
  return { value: arg }
}

/**
 * @param {!Error} error
 */
function rewriteError (error) {
  if (error.message.endsWith('Cannot find context with specified id')) {
    throw new Error(
      'Execution context was destroyed, most likely because of a navigation.'
    )
  }
  throw error
}

/**
 * @type {ExecutionContext}
 */
module.exports = ExecutionContext
