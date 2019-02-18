const util = require('util')
const { helper, assert } = require('./helper')

class EmulationManager {
  /**
   * @param {Chrome|CRIConnection|CDPSession|Object} client
   */
  constructor (client) {
    this._client = client
    this._emulatingMedia = ''
    this._emulatingMobile = false
    this._hasTouch = false
    this._scriptExecutionDisabled = false
  }

  /**
   * @return {boolean}
   */
  isEmulatingMobile () {
    return this._emulatingMobile
  }

  /**
   * @return {boolean}
   */
  isEmulatingHasTouch () {
    return this._hasTouch
  }

  /**
   * @return {boolean}
   */
  isScriptExecutionDisabled () {
    return this._scriptExecutionDisabled
  }

  /**
   * Clears the overridden device metrics
   * @return {Promise<void>}
   */
  async clearDeviceMetricsOverride () {
    await this._client.send('Emulation.clearDeviceMetricsOverride', {})
  }

  /**
   * Clears the overridden Geolocation Position and Error
   * @return {Promise<void>}
   */
  async clearGeolocationOverride () {
    await this._client.send('Emulation.clearGeolocationOverride', {})
  }

  /**
   * @param {!Object} viewport
   * @return {Promise<boolean>}
   */
  async emulateViewport (viewport) {
    const mobile = viewport.isMobile || false
    const width = viewport.width
    const height = viewport.height
    const deviceScaleFactor = viewport.deviceScaleFactor || 1
    /** @type {Object} */
    const screenOrientation = viewport.isLandscape
      ? { angle: 90, type: 'landscapePrimary' }
      : { angle: 0, type: 'portraitPrimary' }
    const hasTouch = viewport.hasTouch || false

    await Promise.all([
      this._client.send('Emulation.setDeviceMetricsOverride', {
        mobile,
        width,
        height,
        deviceScaleFactor,
        screenOrientation
      }),
      await this._client.send('Emulation.setTouchEmulationEnabled', {
        enabled: hasTouch
      })
    ])

    const reloadNeeded =
      this._emulatingMobile !== mobile || this._hasTouch !== hasTouch
    this._emulatingMobile = mobile
    return reloadNeeded
  }

  /**
   * @param {!{longitude: number, latitude: number, accuracy: (number|undefined)}} options
   */
  async setGeolocation (options) {
    const { longitude, latitude, accuracy = 0 } = options
    if (longitude < -180 || longitude > 180) {
      throw new Error(
        `Invalid longitude "${longitude}": precondition -180 <= LONGITUDE <= 180 failed.`
      )
    }
    if (latitude < -90 || latitude > 90) {
      throw new Error(
        `Invalid latitude "${latitude}": precondition -90 <= LATITUDE <= 90 failed.`
      )
    }
    if (accuracy < 0) {
      throw new Error(
        `Invalid accuracy "${accuracy}": precondition 0 <= ACCURACY failed.`
      )
    }
    await this._client.send('Emulation.setGeolocationOverride', {
      longitude,
      latitude,
      accuracy
    })
  }

  /**
   * Sets or clears an override of the default background color of the frame.
   * This override is used if the content does not specify one.
   * @param {DOMRGBA} [color]
   * @return {Promise<void>}
   */
  async setDefaultBackgroundColorOverride (color) {
    if (color) {
      if (color.r < 0 || color.r > 255) {
        throw new Error(
          `Invalid r value "${color.r}": precondition 0 <= r <= 255 failed.`
        )
      }
      if (color.g < 0 || color.g > 255) {
        throw new Error(
          `Invalid g value "${color.g}": precondition 0 <= g <= 255 failed.`
        )
      }
      if (color.b < 0 || color.b > 255) {
        throw new Error(
          `Invalid b value "${color.b}": precondition 0 <= b <= 255 failed.`
        )
      }
      if (color.a && (color.a < 0 || color.a > 1)) {
        throw new Error(
          `Invalid a value "${color.a}": precondition 0 <= a <= 1 failed.`
        )
      }
    }
    await this._client.send(
      'Emulation.setDefaultBackgroundColorOverride',
      color != null ? { color } : {}
    )
  }

  /**
   * Overrides the values of device screen dimensions
   *  - window.screen.width
   *  - window.screen.height
   *  - window.innerWidth
   *  - window.innerHeight
   *
   * and "device-width"/"device-height"-related CSS media query results).
   * @param {Object} options
   * @return {Promise<void>}
   */
  async setDeviceMetricsOverride (options) {
    const MinWH = 0
    const MaxWH = 10000000
    helper.assertNumberWithin(options.width, MinWH, MaxWH, 'width')
    helper.assertNumberWithin(options.height, MinWH, MaxWH, 'height')
    if (options.screenWidth) {
      helper.assertNumberWithin(
        options.screenWidth,
        MinWH,
        MaxWH,
        'screenWidth'
      )
    }
    if (options.screenHeight) {
      helper.assertNumberWithin(
        options.screenHeight,
        MinWH,
        MaxWH,
        'screenHeight'
      )
    }
    if (options.positionX) {
      helper.assertNumberWithin(options.positionX, MinWH, MaxWH, 'positionX')
    }
    if (options.positionY) {
      helper.assertNumberWithin(options.positionY, MinWH, MaxWH, 'positionY')
    }
    if (options.screenOrientation) {
      assert(
        helper.isNumber(options.screenOrientation.angle),
        'The screenOrientation angle should be a number'
      )
      assert(
        helper.isString(options.screenOrientation.type),
        'The screenOrientation type should be a string'
      )
      assert(
        options.screenOrientation.type === 'portraitPrimary' ||
          options.screenOrientation.type === 'portraitSecondary' ||
          options.screenOrientation.type === 'landscapePrimary' ||
          options.screenOrientation.type === 'landscapeSecondary',
        'The screenOrientation type should be equal to one of: portraitPrimary, portraitSecondary, landscapePrimary, or landscapeSecondary'
      )
    }
    if (options.mobile) {
      assert(
        helper.isBoolean(options.mobile),
        `The mobile override should be a boolean value received ${typeof options.mobile}`
      )
    }
    await this._client.send('Emulation.setDeviceMetricsOverride', options)
    if (options.mobile) {
      this._emulatingMobile = options.mobile
    }
  }

  /**
   * Enables touch on platforms which do not support them
   * @param {boolean} enabled
   * @param {number} [maxTouchPoints]
   * @return {Promise<void>}
   */
  async setTouchEmulationEnabled (enabled, maxTouchPoints) {
    assert(
      helper.isBoolean(enabled),
      `The value of enable for setTouchEmulationEnabled should be a boolean value received ${typeof enabled}`
    )
    const params = { enabled }
    if (maxTouchPoints) {
      assert(
        helper.isNumber(maxTouchPoints),
        `The value of maxTouchPoints for setTouchEmulationEnabled should be a number received ${typeof maxTouchPoints}`
      )
      params.maxTouchPoints = maxTouchPoints
    }
    await this._client.send('Emulation.setTouchEmulationEnabled', params)
    this._hasTouch = enabled
  }

  /**
   * Emulates the given media for CSS media queries
   * @param {string} media - Media type to emulate. Empty string disables the override
   * @return {Promise<void>}
   */
  async setEmulatedMedia (media) {
    assert(
      media === 'screen' || media === 'print' || media === null,
      'Unsupported media type: ' + media
    )
    await this._client.send('Emulation.setEmulatedMedia', { media })
    this._emulatingMedia = media
  }

  async setScriptExecutionDisabled (disabled) {
    assert(
      helper.isBoolean(disabled),
      `The value of disabled for setScriptExecutionDisabled should be a boolean value received ${typeof disabled}`
    )
    await this._client.send('Emulation.setScriptExecutionDisabled', {
      value: disabled
    })
    this._scriptExecutionDisabled = disabled
  }

  // eslint-disable-next-line space-before-function-paren
  [util.inspect.custom](depth, options) {
    if (depth < 0) {
      return options.stylize('[EmulationManager]', 'special')
    }

    const newOptions = Object.assign({}, options, {
      depth: options.depth === null ? null : options.depth - 1
    })
    const inner = util.inspect(
      {
        emulatingMobile: this._emulatingMobile,
        hasTouch: this._hasTouch,
        emulatingMedia: this._emulatingMedia,
        scriptExecutionDisabled: this._scriptExecutionDisabled
      },
      newOptions
    )
    return `${options.stylize('EmulationManager', 'special')} ${inner}`
  }
}

/**
 * @typedef {Object} DOMRGBA
 * @property {number} r
 * @property {number} g
 * @property {number} b
 * @property {?number} [a]
 */

module.exports = { EmulationManager }
