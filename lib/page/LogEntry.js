const util = require('util')
const { createJSHandle } = require('../JSHandle')
const { helper } = require('../helper')

/**
 * @see https://chromedevtools.github.io/devtools-protocol/tot/Log#type-LogEntry
 */
class LogEntry {
  /**
   * @param {CDPLogEntry} entry
   */
  constructor (entry) {
    /**
     * @type {CDPLogEntry}
     * @private
     */
    this._entry = entry
    const stackTrace = this._entry.stackTrace
    let location = {}
    if (stackTrace && stackTrace.callFrames.length) {
      location = {
        url: stackTrace.callFrames[0].url,
        lineNumber: stackTrace.callFrames[0].lineNumber,
        columnNumber: stackTrace.callFrames[0].columnNumber
      }
    }
    this._location = location
  }

  /**
   *
   * @return {string}
   */
  source () {
    return this._entry.source
  }

  /**
   *
   * @return {string}
   */
  level () {
    return this._entry.level
  }

  /**
   *
   * @return {string}
   */
  type () {
    return this.level()
  }

  /**
   * @return {?Object}
   */
  location () {
    return this._location
  }

  /**
   *
   * @return {string}
   */
  text () {
    return this._entry.text
  }

  /**
   *
   * @return {?string}
   */
  url () {
    return this._entry.url
  }

  /**
   *
   * @return {?number}
   */
  lineNumber () {
    return this._entry.lineNumber
  }

  /**
   *
   * @return {?Object}
   */
  stackTrace () {
    return this._entry.stackTrace
  }

  /**
   *
   * @return {?string}
   */
  workerId () {
    return this._entry.workerId
  }

  /**
   * @return {string}
   */
  toString () {
    return util.inspect(this, { depth: null })
  }

  /**
   * @return {CDPLogEntry}
   */
  toJSON () {
    return this._entry
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
    const inner = util.inspect(this._entry, newOptions)
    return `${options.stylize('ConsoleMessage', 'special')} ${inner}`
  }
}

/**
 * @typedef {Object} CDPLogEntry - Log entry.
 * @property {string} source - Log entry source. Values: xml, javascript, network, storage, appcache, rendering, security, deprecation, worker, violation, intervention, recommendation, other
 * @property {string} level - Log entry severity. Values: verbose, info, warning, error
 * @property {string} text - Logged text.
 * @property {number} timestamp - Timestamp when this entry was added.
 * @property {string} [url] - URL of the resource if known.
 * @property {number} [lineNumber] - Line number in the resource.
 * @property {Object} [stackTrace] - JavaScript stack trace.
 * @property {string} [networkRequestId] - Identifier of the network request associated with this entry.
 * @property {string} [workerId] - Identifier of the worker associated with this entry.
 * @property {Array<Object>} [args] - Call arguments.
 */

module.exports = LogEntry
