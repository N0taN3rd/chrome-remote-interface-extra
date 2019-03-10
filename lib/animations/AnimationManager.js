const util = require('util')
const EventEmitter = require('eventemitter3')
const { assert, helper } = require('../helper')
const Events = require('../Events')
const Animation = require('./Animation')

/**
 * @see https://chromedevtools.github.io/devtools-protocol/tot/Animation
 * @since chrome-remote-interface-extra
 */
class AnimationManager extends EventEmitter {
  /**
   * @param {Chrome|CRIConnection|CDPSession|Object} client
   */
  constructor (client) {
    super()
    /** @type {Chrome|CRIConnection|CDPSession|Object} */
    this._client = client

    /**
     * @type {boolean}
     * @private
     */
    this._enabled = false

    /**
     * @type {Array<Object>}
     * @private
     */
    this._clientListeners = null

    this._onAnimationCreated = this._onAnimationCreated.bind(this)
    this._onAnimationCanceled = this._onAnimationCanceled.bind(this)
    this._onAnimationStarted = this._onAnimationStarted.bind(this)
  }

  /**
   * @return {boolean}
   */
  enabled () {
    return this._enabled
  }

  /**
   * Enables animation domain notifications.
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Animation#method-enable
   */
  async enable () {
    if (this._enabled) return
    await this._client.send('Animations.enable')
    this._clientListeners = [
      helper.addEventListener(
        this._client,
        'Animation.animationCanceled',
        this._onAnimationCanceled
      ),
      helper.addEventListener(
        this._client,
        'Animation.animationCreated',
        this._onAnimationCreated
      ),
      helper.addEventListener(
        this._client,
        'Animation.animationStarted',
        this._onAnimationStarted
      )
    ]
    this._enabled = true
  }

  /**
   * Disables animation domain notifications.
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Animation#method-disable
   */
  async disable () {
    if (!this._enabled) return
    await this._client.send('Animations.disable')
    this._enabled = false
    if (this._clientListeners) {
      helper.removeEventListeners(this._clientListeners)
    }
    this._clientListeners = null
  }

  /**
   * Gets the playback rate of the document timeline.
   * @return {Promise<number>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Animation#method-getPlaybackRate
   */
  async getPlaybackRate () {
    const { playbackRate } = await this._client.send(
      'Animation.getPlaybackRate'
    )
    return playbackRate
  }

  /**
   * Sets the playback rate of the document timeline.
   * @param {number} playbackRate - Playback rate for animations on page
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Animation#method-setPlaybackRate
   */
  async setPlaybackRate (playbackRate) {
    assert(
      helper.isNumber(playbackRate),
      `The playbackRate param must be of type "number", received ${typeof playbackRate}`
    )
    await this._client.send('Animation.setPlaybackRate', { playbackRate })
  }

  /**
   * Returns the current time of the an animation
   * @param {string} id - Id of animation
   * @return {Promise<number>} - Current time of the page
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Animation#method-getCurrentTime
   */
  async getAnimationsCurrentTime (id) {
    assert(
      helper.isString(id),
      `The id param must be of type "string", received ${typeof id}`
    )
    const { currentTime } = await this._client.send(
      'Animation.getCurrentTime',
      { id }
    )
    return currentTime
  }

  /**
   * Releases a set of animations to no longer be manipulated
   * @param {...string} ids - Ids of the animations to release
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Animation#method-releaseAnimations
   */
  async releaseAnimations (...ids) {
    assert(
      ids.every(id => helper.isString(id)),
      `The ids param must be an array of "strings", received an id in the array was not a string`
    )
    await this._client.send('Animation.releaseAnimations', { animations: ids })
  }

  /**
   * Releases the animation such that it is no longer be manipulated
   * @param {string} id - Id of the animations to release
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Animation#method-releaseAnimations
   */
  async releaseAnimation (id) {
    assert(
      helper.isString(id),
      `The id param must be of type "string", received ${typeof id}`
    )
    await this._client.send('Animation.releaseAnimations', { animations: [id] })
  }

  /**
   * Seek a set of animations to a particular time within each animation
   * @param {{ids: Array<string>, currentTime: number}} - toBeSeeked
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Animation#method-seekAnimations
   */
  async seekAnimations ({ ids, currentTime }) {
    assert(
      ids.every(id => helper.isString(id)),
      `The ids must be an array of "strings", received an id in the array that was not a string`
    )
    assert(
      helper.isNumber(currentTime),
      `The value for currentTime must be of type "number", received ${typeof currentTime}`
    )
    await this._client.send('Animation.seekAnimations', {
      animations: ids,
      currentTime
    })
  }

  /**
   * Seeks the animation to a particular time within each animation
   * @param {string} id - Id of the animation to seek.
   * @param {number} currentTime - Set the current time of each animation
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Animation#method-seekAnimations
   */
  async seekAnimation (id, currentTime) {
    assert(
      helper.isString(id),
      `The id param must be of type "string", received ${typeof id}`
    )
    assert(
      helper.isNumber(currentTime),
      `The value for currentTime must be of type "number", received ${typeof currentTime}`
    )
    await this._client.send('Animation.seekAnimations', {
      animations: [id],
      currentTime
    })
  }

  /**
   * Sets the paused state of a set of animations
   * @param {{ids: Array<string>, pausedState: boolean}} animations
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Animation#method-setPaused
   */
  async pauseAnimations ({ ids, pausedState }) {
    assert(
      ids.every(id => helper.isString(id)),
      `The ids param must be an array of "strings", received an id in the array that was not a string`
    )
    await this._client.send('Animation.setPaused', {
      animations: ids,
      paused: pausedState
    })
  }

  /**
   * Sets the paused state of the animation
   * @param {string} id - Id of the animations to set the pause state of
   * @param {boolean} pausedState - Paused state to set to
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Animation#method-setPaused
   */
  async pauseAnimation (id, pausedState) {
    assert(
      helper.isString(id),
      `The id param must be of type "string", received ${typeof id}`
    )
    await this._client.send('Animation.setPaused', {
      animations: [id],
      paused: pausedState
    })
  }

  /**
   * Sets the timing of an animation node
   * @param {string} id - Animation id
   * @param {number} duration - Duration of the animation
   * @param {number} delay - Delay of the animation
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Animation#method-setAnimationTiming
   */
  async setAnimationTiming (id, duration, delay) {
    assert(
      helper.isString(id),
      `The id param must be of type "string", received ${typeof id}`
    )
    assert(
      helper.isNumber(duration),
      `The value for duration must be of type "number", received ${typeof duration}`
    )
    assert(
      helper.isNumber(delay),
      `The value for delay must be of type "number", received ${typeof delay}`
    )
    await this._client.send('Animation.setAnimationTiming', {
      animationId: id,
      duration,
      delay
    })
  }

  /**
   * Event for when an animation has been cancelled
   * @param {{id: string}} event
   * @private
   */
  _onAnimationCanceled (event) {
    this.emit(Events.Animations.canceled, event.id)
  }

  /**
   * Event for each animation that has been created
   * @param {{id: string}} event
   * @private
   */
  _onAnimationCreated (event) {
    this.emit(Events.Animations.created, event.id)
  }

  /**
   * Event for animation that has been started.
   * @param {{animation: CDPAnimation}} event
   * @private
   */
  _onAnimationStarted (event) {
    this.emit(Events.Animations.started, new Animation(this, event.animation))
  }

  /** @ignore */
  // eslint-disable-next-line space-before-function-paren
  [util.inspect.custom](depth, options) {
    return options.stylize(`AnimationManager<enabled=${this._enabled}>`, 'special')
  }
}

/**
 * @type {AnimationManager}
 */
module.exports = AnimationManager
