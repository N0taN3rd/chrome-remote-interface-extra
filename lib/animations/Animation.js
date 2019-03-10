const util = require('util')

/**
 * Utility class for working with CDP Animation type
 * @see https://chromedevtools.github.io/devtools-protocol/tot/Animation#type-Animation
 * @since chrome-remote-interface-extra
 */
class Animation {
  /**
   * @param {AnimationManager} manager
   * @param {CDPAnimation} cdpAnimation
   */
  constructor (manager, cdpAnimation) {
    /**
     * @type {AnimationManager}
     * @private
     */
    this._manager = manager

    /**
     * @type {CDPAnimation}
     * @private
     */
    this._animation = cdpAnimation

    /**
     * @type {boolean}
     * @private
     */
    this._released = false
  }

  /**
   * @return {string}
   */
  id () {
    return this._animation.id
  }

  /**
   * @return {string}
   */
  name () {
    return this._animation.name
  }

  /**
   * @return {boolean}
   */
  pausedState () {
    return this._animation.pausedState
  }

  /**
   * @return {string}
   */
  playState () {
    return this._animation.playState
  }

  /**
   * @return {number}
   */
  playbackRate () {
    return this._animation.playbackRate
  }

  /**
   * @return {number}
   */
  startTime () {
    return this._animation.startTime
  }

  /**
   * @return {number}
   */
  currentTime () {
    return this._animation.currentTime
  }

  /**
   * @return {string}
   */
  type () {
    return this._animation.type
  }

  /**
   * @return {CDPAnimationEffect}
   */
  source () {
    return this._animation.source
  }

  /**
   * @return {string}
   */
  cssId () {
    return this._animation.cssId
  }

  /**
   * @return {boolean}
   */
  released () {
    return this._released
  }

  /**
   * Retrieves and updates this instances currentTime value
   * @return {Promise<number>}
   */
  async updateCurrentTime () {
    this._assertNotReleased()
    const ctime = await this._manager.getAnimationsCurrentTime(this.id())
    this._animation.currentTime = ctime
    return ctime
  }

  /**
   * Releases the animation such that it is no longer be manipulated
   * @return {Promise<void>}
   */
  async release () {
    this._assertNotReleased()
    this._released = true
    await this._manager.releaseAnimation(this.id())
  }

  /**
   * Seeks the animation to a particular time within each animation
   * @param {number} currentTime - Set the current time of each animation
   * @return {Promise<void>}
   */
  async seek (currentTime) {
    this._assertNotReleased()
    await this._manager.seekAnimation(this.id(), currentTime)
  }

  /**
   * Pause the animation
   * @return {Promise<void>}
   */
  async pause () {
    this._assertNotReleased()
    await this._manager.pauseAnimation(this.id(), true)
    this._animation.pausedState = true
  }

  /**
   * Un-pause the animation
   * @return {Promise<void>}
   */
  async unpause () {
    this._assertNotReleased()
    await this._manager.pauseAnimation(this.id(), false)
    this._animation.pausedState = false
  }

  /**
   * Sets the timing of the animation.
   * @param {number} duration - Duration of the animation
   * @param {number} delay - Delay of the animation
   * @return {Promise<void>}
   */
  async setTiming (duration, delay) {
    this._assertNotReleased()
    await this._manager.setAnimationTiming(this.id(), duration, delay)
  }

  _assertNotReleased () {
    if (this._released) {
      throw new Error(`This animation, id = ${this.id()} , is already released`)
    }
  }

  /**
   * @return {string}
   */
  toString () {
    return util.inspect(this, { depth: null })
  }

  /**
   * @return {CDPAnimation}
   */
  toJSON () {
    return this._animation
  }

  /** @ignore */
  // eslint-disable-next-line space-before-function-paren
  [util.inspect.custom](depth, options) {
    if (depth < 0) {
      return options.stylize('[Animation]', 'special')
    }
    const newOptions = Object.assign({}, options, {
      depth: options.depth == null ? null : options.depth - 1
    })
    const inner = util.inspect(this._animation, newOptions)
    return `${options.stylize('Animation', 'special')} ${inner}`
  }
}

/**
 * @type {Animation}
 */
module.exports = Animation
