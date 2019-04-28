const { assert } = require('../helper')
const keyDefinitions = require('./USKeyboardLayout')

class Keyboard {
  /**
   * @param {Chrome|CRIConnection|CDPSession|Object} client
   */
  constructor (client) {
    this._client = client
    this._modifiers = 0
    this._pressedKeys = new Set()

    /**
     * @type {?Object<string, KeyDefinition>}
     * @private
     */
    this._altKeyDef = null
  }

  /**
   * @param {Object<string, KeyDefinition>} keyDef
   */
  useAlternativeKeyDefinitions (keyDef) {
    this._altKeyDef = keyDef
  }

  /**
   * @param {string} key
   * @param {{text?: string}=} options
   */
  async down (key, options = { text: undefined }) {
    const description = this._keyDescriptionForString(key)

    const autoRepeat = this._pressedKeys.has(description.code)
    this._pressedKeys.add(description.code)
    this._modifiers |= this._modifierBit(description.key)

    const text = options.text === undefined ? description.text : options.text
    await this._client.send('Input.dispatchKeyEvent', {
      type: text ? 'keyDown' : 'rawKeyDown',
      modifiers: this._modifiers,
      windowsVirtualKeyCode: description.keyCode,
      code: description.code,
      key: description.key,
      text: text,
      unmodifiedText: text,
      autoRepeat,
      location: description.location,
      isKeypad: description.location === 3
    })
  }

  /**
   * @param {string} key
   * @return {number}
   */
  _modifierBit (key) {
    if (key === 'Alt') return 1
    if (key === 'Control') return 2
    if (key === 'Meta') return 4
    if (key === 'Shift') return 8
    return 0
  }

  /**
   * @param {string} key
   * @return {KeyDefinition}
   * @private
   */
  _getKeyDefValue (key) {
    if (this._altKeyDef != null) return this._altKeyDef[key]
    return keyDefinitions[key]
  }

  /**
   * @param {string} keyString
   * @return {KeyDescription}
   */
  _keyDescriptionForString (keyString) {
    const shift = this._modifiers & 8
    const description = {
      key: '',
      keyCode: 0,
      code: '',
      text: '',
      location: 0
    }

    const definition = this._getKeyDefValue(keyString)
    assert(definition, `Unknown key: "${keyString}"`)

    if (definition.key) description.key = definition.key
    if (shift && definition.shiftKey) description.key = definition.shiftKey

    if (definition.keyCode) description.keyCode = definition.keyCode
    if (shift && definition.shiftKeyCode) {
      description.keyCode = definition.shiftKeyCode
    }

    if (definition.code) description.code = definition.code

    if (definition.location) description.location = definition.location

    if (description.key.length === 1) description.text = description.key

    if (definition.text) description.text = definition.text
    if (shift && definition.shiftText) description.text = definition.shiftText

    // if any modifiers besides shift are pressed, no text should be sent
    if (this._modifiers & ~8) description.text = ''

    return description
  }

  /**
   * @param {string} key
   */
  async up (key) {
    const description = this._keyDescriptionForString(key)

    this._modifiers &= ~this._modifierBit(description.key)
    this._pressedKeys.delete(description.code)
    await this._client.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      modifiers: this._modifiers,
      key: description.key,
      windowsVirtualKeyCode: description.keyCode,
      code: description.code,
      location: description.location
    })
  }

  /**
   * @param {string} char
   */
  async sendCharacter (char) {
    await this._client.send('Input.insertText', { text: char })
  }

  /**
   * @param {string} text
   * @param {{delay: (number|undefined)}} [options]
   */
  async type (text, options) {
    let delay = 0
    if (options && options.delay) delay = options.delay
    for (let i = 0; i < text.length; i++) {
      const char = text[i]
      if (this._getKeyDefValue(char)) {
        await this.press(char, { delay })
      } else {
        await this.sendCharacter(char)
      }
      if (delay) {
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  /**
   * @param {string} key
   * @param {!{delay?: number, text?: string}} [options]
   */
  async press (key, options = {}) {
    const { delay = null } = options
    await this.down(key, options)
    if (delay !== null) {
      await new Promise(resolve => setTimeout(resolve, options.delay))
    }
    await this.up(key)
  }
}

module.exports = Keyboard

/**
 * @typedef {Object} KeyDescription
 * @property {number} keyCode
 * @property {string} key
 * @property {string} text
 * @property {string} code
 * @property {number} location
 */
