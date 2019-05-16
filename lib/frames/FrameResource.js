const util = require('util')

/**
 * @see https://chromedevtools.github.io/devtools-protocol/tot/Page#type-FrameResource
 * @since chrome-remote-interface-extra
 */
class FrameResource {
  /**
   * @param {string} frameId - The id of the frame this resource is associated with
   * @param {CDPFrameResource} frameResourceInfo - Information about the Resource on the page
   * @param {FrameManager} frameManager - The frame manager for the page this resource's frame came from
   */
  constructor (frameId, frameResourceInfo, frameManager) {
    /** @type {string} */
    this._frameId = frameId
    /** @type {CDPFrameResource} */
    this._frameResourceInfo = frameResourceInfo
    /** @type {FrameManager} */
    this._frameManager = frameManager
  }

  /**
   * Retrieve the contents of this frame resource
   * @return {Promise<Buffer>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Page#method-getResourceContent
   */
  getContent () {
    return this._frameManager.getFrameResourceContent(
      this._frameId,
      this._frameResourceInfo.url
    )
  }

  /**
   * Resource URL
   * @return {string}
   */
  get url () {
    return this._frameResourceInfo.url
  }

  /**
   * Type of this resource
   * @return {string}
   */
  get type () {
    return this._frameResourceInfo.type
  }

  /**
   * Resource mimeType as determined by the browser
   * @return {string}
   */
  get mimeType () {
    return this._frameResourceInfo.mimeType
  }

  /**
   * last-modified timestamp as reported by server
   * @return {?number}
   */
  get lastModified () {
    return this._frameResourceInfo.lastModified
  }

  /**
   * Resource content size
   * @return {?number}
   */
  get contentSize () {
    return this._frameResourceInfo.contentSize
  }

  /**
   * True if the resource failed to load
   * @return {?boolean}
   */
  get failed () {
    return this._frameResourceInfo.failed
  }

  /**
   * True if the resource was canceled during loading
   * @return {?boolean}
   */
  get canceled () {
    return this._frameResourceInfo.canceled
  }

  /**
   * @return {Object}
   */
  toJSON () {
    return this._frameResourceInfo
  }

  /** @ignore */
  // eslint-disable-next-line space-before-function-paren
  [util.inspect.custom](depth, options) {
    if (depth < 0) {
      return options.stylize('[FrameResource]', 'special')
    }

    const newOptions = Object.assign({}, options, {
      depth: options.depth == null ? null : options.depth - 1
    })
    const inner = util.inspect(this._frameResourceInfo, newOptions)
    return `${options.stylize('FrameResource', 'special')} ${inner}`
  }
}

module.exports = FrameResource
