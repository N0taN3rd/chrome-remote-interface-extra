const path = require('path')
const util = require('util')
const { assert } = require('../helper')

class FileChooser {
  /**
   * @param {Chrome|CRIConnection|CDPSession|Object} client
   * @param {Object} event
   */
  constructor (client, event) {
    /**
     * @type {Chrome|CRIConnection|CDPSession|Object}
     * @private
     */
    this._client = client
    /**
     * @type {Object}
     * @private
     */
    this._event = event

    /**
     * @type {boolean}
     * @private
     */
    this._handled = false
  }

  /**
   * @return {boolean}
   */
  handled () {
    return this._handled
  }

  /**
   * @return {Object}
   */
  cdpEvent () {
    return this._event
  }

  /**
   * @return {string}
   */
  mode () {
    return this._event.mode
  }

  /**
   * @return {boolean}
   */
  isMultiple () {
    return this._event.mode === 'selectMultiple'
  }

  /**
   * Accepts the intercepted file chooser dialog
   * @param {Array<string>} filePaths - Array of absolute file paths to set
   * @return {Promise<void>}
   */
  async accept (filePaths) {
    assert(
      !this._handled,
      'Cannot accept FileChooser which is already handled!'
    )
    this._handled = true
    const files = new Array(filePaths.length)
    for (let i = 0; i < filePaths.length; i++) {
      files[i] = path.resolve(filePaths[i])
    }
    await this._client.send('Page.handleFileChooser', {
      action: 'accept',
      files
    })
  }

  /**
   * Cancels the intercepted file chooser dialog
   * @return {!Promise<void>}
   */
  async cancel () {
    assert(
      !this._handled,
      'Cannot cancel FileChooser which is already handled!'
    )
    this._handled = true
    await this._client.send('Page.handleFileChooser', {
      action: 'cancel'
    })
  }

  /** @ignore */
  // eslint-disable-next-line space-before-function-paren
  [util.inspect.custom](depth, options) {
    if (depth < 0) {
      return options.stylize('[FileChooser]', 'special')
    }

    const newOptions = Object.assign({}, options, {
      depth: options.depth == null ? null : options.depth - 1
    })
    const inner = util.inspect(
      {
        handled: this._handled,
        mode: this.mode()
      },
      newOptions
    )
    return `${options.stylize('FileChooser', 'special')} ${inner}`
  }
}

module.exports = FileChooser
