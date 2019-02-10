class EmulationManager {
  /**
   * @param {!Object} client
   */
  constructor (client) {
    this._client = client
    this._emulatingMobile = false
    this._hasTouch = false
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
      this._client.send('Emulation.setTouchEmulationEnabled', {
        enabled: hasTouch
      })
    ])

    const reloadNeeded =
      this._emulatingMobile !== mobile || this._hasTouch !== hasTouch
    this._emulatingMobile = mobile
    this._hasTouch = hasTouch
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
}

module.exports = { EmulationManager }
