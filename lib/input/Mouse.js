const Keyboard = require('./Keyboard')

class Mouse {
  /**
   * @param {Chrome|CRIConnection|CDPSession|Object} client
   * @param {?Keyboard} [keyboard]
   */
  constructor (client, keyboard) {
    this._client = client
    this._keyboard = keyboard != null ? keyboard : new Keyboard(client)
    this._x = 0
    this._y = 0
    /** @type {'none'|'left'|'right'|'middle'} */
    this._button = 'none'
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {!{steps?: number}=} options
   */
  async move (x, y, options = {}) {
    const { steps = 1 } = options
    const fromX = this._x

    const fromY = this._y
    this._x = x
    this._y = y
    for (let i = 1; i <= steps; i++) {
      await this._client.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        button: this._button,
        x: fromX + (this._x - fromX) * (i / steps),
        y: fromY + (this._y - fromY) * (i / steps),
        modifiers: this._keyboard._modifiers
      })
    }
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {!{delay?: number, button?: "left"|"right"|"middle", clickCount?: number}=} options
   */
  async click (x, y, options = {}) {
    const { delay = null } = options
    await this.move(x, y)
    await this.down(options)
    if (delay !== null) await new Promise(resolve => setTimeout(resolve, delay))
    await this.up(options)
  }

  /**
   * @param {!{button?: "left"|"right"|"middle", clickCount?: number}=} options
   */
  async down (options = {}) {
    const { button = 'left', clickCount = 1 } = options
    this._button = button
    await this._client.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      button,
      x: this._x,
      y: this._y,
      modifiers: this._keyboard._modifiers,
      clickCount
    })
  }

  /**
   * @param {!{button?: "left"|"right"|"middle", clickCount?: number}=} options
   */
  async up (options = {}) {
    const { button = 'left', clickCount = 1 } = options
    this._button = 'none'
    await this._client.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      button,
      x: this._x,
      y: this._y,
      modifiers: this._keyboard._modifiers,
      clickCount
    })
  }
}

/**
 * @type {Mouse}
 */
module.exports = Mouse
