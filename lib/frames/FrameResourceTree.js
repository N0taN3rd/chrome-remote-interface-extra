const util = require('util')

class FrameResourceTree {
  /**
   *
   * @param {FrameManager} frameManager
   * @param {Object} resourceTree
   */
  constructor (frameManager, resourceTree) {
    this._frameManager = frameManager
    /**
     * @type {?Frame}
     */
    this._frame = null

    /**
     * @type {Array<FrameResource>}
     */
    this._resources = []

    /**
     * @type {Array<FrameResourceTree>}
     */
    this._children = []
    this._buildTree(resourceTree)
  }

  /**
   * @desc Walks the frame resources tree using breadth first traversal
   * @return {IterableIterator<{resources: Array<FrameResource>, frame: ?Frame}>}
   */
  * walkTree () {
    /**
     * @type {FrameResourceTree[]}
     */
    const q = [this]
    let nextFrame
    let i, currFrameKids, currFrameNumKids
    while (q.length) {
      nextFrame = q.shift()
      yield { frame: nextFrame._frame, resources: nextFrame._resources }
      currFrameKids = nextFrame._children
      currFrameNumKids = currFrameKids.length
      for (i = 0; i < currFrameNumKids; i++) {
        q.push(currFrameKids[i])
      }
    }
  }

  _buildTree (resourceTree) {
    this._frame = this._frameManager.frame(resourceTree.frame.id)
    const resources = resourceTree.resources
    const numResources = resources.length
    for (let i = 0; i < numResources; i++) {
      this._resources.push(new FrameResource(resources[i]))
    }
    if (!resourceTree.childFrames) return
    const childFrames = resourceTree.childFrames
    for (let i = 0; i < childFrames.length; i++) {
      this._children.push(
        new FrameResourceTree(this._frameManager, childFrames[i])
      )
    }
  }

  toJSON () {
    return {
      frame: this._frame,
      resources: this._resources,
      children: this._children
    }
  }

  // eslint-disable-next-line space-before-function-paren
  [Symbol.iterator]() {
    return this.walkTree()
  }

  // eslint-disable-next-line space-before-function-paren
  [util.inspect.custom](depth, options) {
    if (depth < 0) {
      return options.stylize('[FrameResourceTree]', 'special')
    }

    const newOptions = Object.assign({}, options, {
      depth: options.depth === null ? null : options.depth - 1
    })
    const inner = util.inspect(
      {
        frame: this._frame,
        resources: this._resources,
        children: this._children
      },
      newOptions
    )
    return `${options.stylize('FrameResourceTree', 'special')} ${inner}`
  }
}

class FrameResource {
  constructor (frameResourceInfo) {
    this._frameResourceInfo = frameResourceInfo
  }

  /**
   * @return {string}
   */
  get url () {
    return this._frameResourceInfo.url
  }

  /**
   * @return {string}
   */
  get type () {
    return this._frameResourceInfo.type
  }

  /**
   * @return {string}
   */
  get mimeType () {
    return this._frameResourceInfo.mimeType
  }

  /**
   * @return {?number}
   */
  get lastModified () {
    return this._frameResourceInfo.lastModified
  }

  /**
   * @return {?number}
   */
  get contentSize () {
    return this._frameResourceInfo.contentSize
  }

  /**
   * @return {?boolean}
   */
  get failed () {
    return this._frameResourceInfo.failed
  }

  /**
   * @return {?boolean}
   */
  get canceled () {
    return this._frameResourceInfo.canceled
  }

  toJSON () {
    return this._frameResourceInfo
  }

  // eslint-disable-next-line space-before-function-paren
  [util.inspect.custom](depth, options) {
    if (depth < 0) {
      return options.stylize('[FrameResource]', 'special')
    }

    const newOptions = Object.assign({}, options, {
      depth: options.depth === null ? null : options.depth - 1
    })
    const inner = util.inspect(this._frameResourceInfo, newOptions)
    return `${options.stylize('FrameResource', 'special')} ${inner}`
  }
}

module.exports = { FrameResourceTree, FrameResource }
