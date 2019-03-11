const util = require('util')
const { assert } = require('./helper')

/**
 * Utility class for handling dialogs
 * @see https://chromedevtools.github.io/devtools-protocol/tot/Page#method-handleJavaScriptDialog
 */
class Dialog {
  /**
   * @ignore
   * @param {Object} event
   */
  static assertKnownDialogType (event) {
    switch (event.type) {
      case 'alert':
      case 'beforeunload':
      case 'confirm':
      case 'prompt':
        break
      default:
        throw new Error(`Unknown javascript dialog type: ${event.type}`)
    }
  }

  /**
   * @param {Chrome|CRIConnection|CDPSession|Object} client
   * @param {Object} event
   */
  constructor (client, event) {
    /** @type {Chrome|CRIConnection|CDPSession|Object} */
    this._client = client
    /** @type {Object} */
    this._event = event
    /** @type {boolean} */
    this._handled = false
  }

  /**
   * Dialog type
   * @return {string}
   */
  type () {
    return this._event.type
  }

  /**
   * Message that will be displayed by the dialog
   * @return {string}
   */
  message () {
    return this._event.message
  }

  /**
   * Default dialog prompt
   * @return {?string}
   */
  defaultValue () {
    return this._event.defaultPrompt
  }

  /**
   * The URL of the Frame the dialog opened in
   * @return {string}
   */
  url () {
    return this._event.url
  }

  /**
   * True iff browser is capable showing or acting on the given dialog. When browser has no dialog handler for given target, calling alert while Page domain is engaged will stall the page execution. Execution can be resumed via calling either {@link accept} or {@link dismiss}
   * @return {boolean}
   */
  hasBrowserHandler () {
    return this._event.hasBrowserHandler
  }

  /**
   * Accepts this JavaScript initiated dialog (alert, confirm, prompt, or onbeforeunload).
   * @param {string?} [promptText] - The text to enter into the dialog prompt before accepting. Used only if this is a prompt dialog
   * @return {Promise<void>}
   */
  async accept (promptText) {
    assert(!this._handled, 'Cannot accept dialog which is already handled!')
    this._handled = true
    await this._client.send('Page.handleJavaScriptDialog', {
      accept: true,
      promptText: promptText || undefined
    })
  }

  /**
   * Dismisses this JavaScript initiated dialog (alert, confirm, prompt, or onbeforeunload)
   * @return {Promise<void>}
   */
  async dismiss () {
    assert(!this._handled, 'Cannot dismiss dialog which is already handled!')
    this._handled = true
    await this._client.send('Page.handleJavaScriptDialog', {
      accept: false
    })
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
      return options.stylize('[Dialog]', 'special')
    }

    const newOptions = Object.assign({}, options, {
      depth: options.depth == null ? null : options.depth - 1
    })
    const inner = util.inspect(
      Object.assign({ handled: this._handled }, this._event),
      newOptions
    )
    return `${options.stylize('Dialog', 'special')} ${inner}`
  }
}

/**
 * @type {{BeforeUnload: string, Confirm: string, Alert: string, Prompt: string}}
 */
Dialog.Type = {
  Alert: 'alert',
  BeforeUnload: 'beforeunload',
  Confirm: 'confirm',
  Prompt: 'prompt'
}

/**
 * @type {Dialog}
 */
module.exports = Dialog
