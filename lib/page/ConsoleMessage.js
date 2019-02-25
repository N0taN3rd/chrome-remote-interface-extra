const util = require('util')

/**
 * @typedef {Object} ConsoleMessage.Location
 * @property {string} url
 * @property {number} lineNumber
 * @property {number} columnNumber
 */

class ConsoleMessage {
  /**
   * @param {string} type
   * @param {string} text
   * @param {Array<JSHandle>} args
   * @param {ConsoleMessage.Location} location
   */
  constructor (type, text, args, location = {}) {
    this._type = type
    this._text = text
    this._args = args
    this._location = location
  }

  /**
   * @return {string}
   */
  type () {
    return this._type
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
   * @return {Object}
   */
  location () {
    return this._location
  }

  /**
   * @return {{location: Object, text: string, type: string}}
   */
  toJSON () {
    return {
      type: this._type,
      text: this._text,
      location: this._location
    }
  }

  /** @ignore */
  // eslint-disable-next-line space-before-function-paren
  [util.inspect.custom](depth, options) {
    if (depth < 0) {
      return options.stylize('[ConsoleMessage]', 'special')
    }

    const newOptions = Object.assign({}, options, {
      depth: options.depth === null ? null : options.depth - 1
    })
    const inner = util.inspect(
      {
        type: this._type,
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
