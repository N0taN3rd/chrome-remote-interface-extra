const util = require('util')
const { helper } = require('./helper')
const { createJSHandle } = require('./JSHandle')

/**
 * @typedef {Object} ConsoleMessage.Location
 * @property {string} url
 * @property {number} lineNumber
 * @property {number} columnNumber
 */

/**
 * @typedef {Object} ConsoleMessageArgsInit
 * @property {?ExecutionContext} [context]
 * @property {?function(arg: Object):JSHandle} [jsHandleFactory]
 */

/**
 * A thin wrapper around the Runtime.consoleAPICalled event
 * @see https://chromedevtools.github.io/devtools-protocol/tot/Runtime#event-consoleAPICalled
 */
class ConsoleMessage {
  /**
   * @param {Object} event - Runtime.consoleAPICalled event
   * @param {ConsoleMessageArgsInit} argsInit - An object containing either the The execution context the message was made in or a function to create jsHandles when made in the
   * worker context
   */
  constructor (event, argsInit) {
    /** @type {Object} */
    this._event = event
    /** @type {Array<JSHandle>} */
    this._args = []
    /** @type {string} */
    this._text = ''
    /** @type {?ConsoleMessage.Location} */
    this._location = null
    this.__init(argsInit)
  }

  /**
   * Type of the call
   * @return {string}
   */
  type () {
    return this._event.type
  }

  /**
   * @return {string}
   */
  text () {
    return this._text
  }

  /**
   * @return {Array<JSHandle>}
   */
  args () {
    return this._args
  }

  /**
   * @return {?Object}
   */
  location () {
    return this._location
  }

  /**
   * Call timestamp
   * @return {number}
   */
  timestamp () {
    return this._event.timestamp
  }

  /**
   * Identifier of the context where the call was made
   * @return {string}
   */
  executionContextId () {
    return this._event.event.executionContextId
  }

  /**
   * Stack trace captured when the call was made
   * @return {?Object}
   */
  stackTrace () {
    return this._event.stackTrace
  }

  /**
   * Console context descriptor for calls on non-default console context (not console.*):
   *  - 'anonymous#unique-logger-id' for call on unnamed context, 'name#unique-logger-id' for call on named context
   * @return {?string}
   */
  consoleContext () {
    return this._event.context
  }

  /**
   * @param {ConsoleMessageArgsInit} argsInit
   * @private
   */
  __init (argsInit) {
    const args = this._event.args
    const stackTrace = this._event.stackTrace
    const textTokens = []
    for (let i = 0; i < args.length; i++) {
      let arg
      if (argsInit.context) {
        arg = createJSHandle(argsInit.context, args[i])
      } else {
        arg = argsInit.jsHandleFactory(args[i])
      }
      this._args.push(arg)
      const remoteObject = arg._remoteObject
      if (remoteObject.objectId) {
        textTokens.push(arg.toString())
      } else {
        textTokens.push(helper.valueFromRemoteObject(remoteObject))
      }
    }
    let location
    if (stackTrace && stackTrace.callFrames.length) {
      location = {
        url: stackTrace.callFrames[0].url,
        lineNumber: stackTrace.callFrames[0].lineNumber,
        columnNumber: stackTrace.callFrames[0].columnNumber
      }
    }
    this._location = location
    this._text = textTokens.join(' ')
  }

  /**
   * @return {Object}
   */
  toJSON () {
    return this._event
  }

  /** @ignore */
  // eslint-disable-next-line space-before-function-paren
  [util.inspect.custom](depth, options) {
    if (depth < 0) {
      return options.stylize('[ConsoleMessage]', 'special')
    }

    const newOptions = Object.assign({}, options, {
      depth: options.depth == null ? null : options.depth - 1
    })
    const inner = util.inspect(
      {
        type: this._event.type,
        text: this._text,
        args: this._args,
        location: this._location
      },
      newOptions
    )
    return `${options.stylize('ConsoleMessage', 'special')} ${inner}`
  }
}

/**
 * @type {ConsoleMessage}
 */
module.exports = ConsoleMessage
