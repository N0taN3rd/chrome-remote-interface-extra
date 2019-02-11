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

  toJSON () {
    return {
      frame: this._frame,
      resources: this._resources,
      children: this._children
    }
  }

  /**
   * @desc Walks the frame resources tree using breadth first traversal
   * @return {IterableIterator<{resouces: Array<FrameResource>, frame: ?Frame}>}
   */
  [Symbol.iterator]() {
    return this.walkTree()
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
}

class FrameResource {
  constructor ({
    url,
    type,
    mimeType,
    lastModified,
    contentSize,
    failed,
    canceled
  }) {
    /**
     * @type {string}
     */
    this._url = url

    /**
     * @type {string}
     */
    this._type = type

    /**
     * @type {string}
     */
    this._mimeType = mimeType

    /**
     * @type {?number}
     */
    this._lastModified = lastModified

    /**
     * @type {?number}
     */
    this._contentSize = contentSize

    /**
     * @type {?boolean}
     */
    this._failed = failed

    /**
     * @type {?boolean}
     */
    this._canceled = canceled
  }

  /**
   * @return {string}
   */
  get url () {
    return this._url
  }

  /**
   * @return {string}
   */
  get type () {
    return this._type
  }

  /**
   * @return {string}
   */
  get mimeType () {
    return this._mimeType
  }

  /**
   * @return {?number}
   */
  get lastModified () {
    return this._lastModified
  }

  /**
   * @return {?number}
   */
  get contentSize () {
    return this._contentSize
  }

  /**
   * @return {?boolean}
   */
  get failed () {
    return this._failed
  }

  /**
   * @return {?boolean}
   */
  get canceled () {
    return this._canceled
  }

  toJSON () {
    return {
      url: this._url,
      type: this._type,
      mimeType: this._mimeType,
      lastModified: this._lastModified,
      contentSize: this._contentSize,
      failed: this._failed,
      canceled: this._canceled
    }
  }
}

module.exports = { FrameResourceTree, FrameResource }
