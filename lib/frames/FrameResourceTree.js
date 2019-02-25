const util = require('util')
const FrameResource = require('./FrameResource')

/**
 * @see https://chromedevtools.github.io/devtools-protocol/tot/Page#type-FrameResourceTree
 */
class FrameResourceTree {
  /**
   *
   * @param {Object} resourceTree - Information about the Frame hierarchy along with their cached resources
   * @param {FrameManager} frameManager - The frame manager for the page this resource's frame came from
   */
  constructor (resourceTree, frameManager) {
    /**
     * @type {FrameManager}
     * @private
     */
    this._frameManager = frameManager

    /**
     * @type {?Frame}
     * @private
     */
    this._frame = null

    /**
     * @type {Array<FrameResource>}
     * @private
     */
    this._resources = []

    /**
     * @type {Array<FrameResourceTree>}
     * @private
     */
    this._children = []
    this._buildTree(resourceTree)
  }

  /**
   * @return {Array<FrameResource>}
   */
  get resources () {
    return this._resources
  }

  /**
   * @return {Array<FrameResourceTree>}
   */
  get children () {
    return this._children
  }

  /**
   * @desc Walks the frame resources tree using breadth first traversal
   * @return {Iterator<{resources: Array<FrameResource>, frame: ?Frame}>}
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

  /**
   * @desc Recursively creates the resource tree from the values returned by the CDP
   * @param {Object} resourceTree
   * @private
   */
  _buildTree (resourceTree) {
    this._frame = this._frameManager.frame(resourceTree.frame.id)
    const resources = resourceTree.resources
    const numResources = resources.length
    for (let i = 0; i < numResources; i++) {
      this._resources.push(
        new FrameResource(
          resourceTree.frame.id,
          resources[i],
          this._frameManager
        )
      )
    }
    if (!resourceTree.childFrames) return
    const childFrames = resourceTree.childFrames
    for (let i = 0; i < childFrames.length; i++) {
      this._children.push(
        new FrameResourceTree(childFrames[i], this._frameManager)
      )
    }
  }

  /**
   * @return {{children: Array<FrameResourceTree>, resources: Array<FrameResource>, frame: ?Frame}}
   */
  toJSON () {
    return {
      frame: this._frame,
      resources: this._resources,
      children: this._children
    }
  }

  /**
   * @return {Iterator<{resources: Array<FrameResource>, frame: ?Frame}>}
   */
  // eslint-disable-next-line space-before-function-paren
  [Symbol.iterator]() {
    return this.walkTree()
  }

  /** @ignore */
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

/**
 * @type {FrameResourceTree}
 */
module.exports = FrameResourceTree
