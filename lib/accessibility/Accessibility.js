const util = require('util')
const AXNode = require('./AXNode')

/**
 * @param {!Set<AXNode>} collection
 * @param {!AXNode} node
 * @param {boolean} insideControl
 */
function collectInterestingNodes (collection, node, insideControl) {
  if (node.isInteresting(insideControl)) collection.add(node)
  if (node.isLeafNode()) return
  insideControl = insideControl || node.isControl()
  const nodeChildren = node._children
  for (let i = 0; i < nodeChildren.length; i++) {
    collectInterestingNodes(collection, nodeChildren[i], insideControl)
  }
}

/**
 * @param {!AXNode} node
 * @param {!Set<AXNode>=} whitelistedNodes
 * @return {Array<SerializedAXNode>}
 */
function serializeTree (node, whitelistedNodes) {
  /** @type {Array<SerializedAXNode>} */
  const children = []
  const nodeChildren = node._children
  for (let i = 0; i < nodeChildren.length; i++) {
    children.push(...serializeTree(nodeChildren[i], whitelistedNodes))
  }
  if (whitelistedNodes && !whitelistedNodes.has(node)) return children
  const serializedNode = node.serialize()
  if (children.length) serializedNode.children = children
  return [serializedNode]
}

class Accessibility {
  /**
   * @param {Chrome|CRIConnection|CDPSession|Object} client
   */
  constructor (client) {
    this._client = client
  }

  /**
   * @param {{interestingOnly?: boolean}=} options
   * @return {Promise<SerializedAXNode>}
   */
  async snapshot (options = {}) {
    const { interestingOnly = true } = options
    const { nodes } = await this._client.send('Accessibility.getFullAXTree')
    const root = AXNode.createTree(nodes)
    if (!interestingOnly) return serializeTree(root)[0]

    /** @type {!Set<AXNode>} */
    const interestingNodes = new Set()
    collectInterestingNodes(interestingNodes, root, false)
    return serializeTree(root, interestingNodes)[0]
  }

  /** @ignore */
  // eslint-disable-next-line space-before-function-paren
  [util.inspect.custom](depth, options) {
    return options.stylize('[Accessibility]', 'special')
  }
}

/**
 * @type {Accessibility}
 */
module.exports = Accessibility

/**
 * @typedef {Object} SerializedAXNode
 * @property {string} role
 *
 * @property {string} name
 * @property {string|number} value
 * @property {string} description
 *
 * @property {string} keyshortcuts
 * @property {string} roledescription
 * @property {string} valuetext
 *
 * @property {boolean} disabled
 * @property {boolean} expanded
 * @property {boolean} focused
 * @property {boolean} modal
 * @property {boolean} multiline
 * @property {boolean} multiselectable
 * @property {boolean} readonly
 * @property {boolean} required
 * @property {boolean} selected
 *
 * @property {boolean|"mixed"} checked
 * @property {boolean|"mixed"} pressed
 *
 * @property {number} level
 * @property {number} valuemin
 * @property {number} valuemax
 *
 * @property {string} autocomplete
 * @property {string} haspopup
 * @property {string} invalid
 * @property {string} orientation
 *
 * @property {Array<SerializedAXNode>} children
 */
