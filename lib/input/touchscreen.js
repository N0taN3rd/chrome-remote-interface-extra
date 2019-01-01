class Touchscreen {
  /**
   * @param {Object} client
   * @param {Keyboard} keyboard
   */
  constructor (client, keyboard) {
    this._client = client
    this._keyboard = keyboard
  }

  /**
   * @param {number} x
   * @param {number} y
   */
  async tap (x, y) {
    // Touches appear to be lost during the first frame after navigation.
    // This waits a frame before sending the tap.
    // @see https://crbug.com/613219
    await this._client.send('Runtime.evaluate', {
      expression:
        'new Promise(x => requestAnimationFrame(() => requestAnimationFrame(x)))',
      awaitPromise: true
    })

    const touchPoints = [{ x: Math.round(x), y: Math.round(y) }]
    await this._client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints,
      modifiers: this._keyboard._modifiers
    })
    await this._client.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
      modifiers: this._keyboard._modifiers
    })
  }
}

/**
 * @type {Touchscreen}
 */
module.exports = Touchscreen
