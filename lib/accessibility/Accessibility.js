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
  for (const child of node._children) {
    collectInterestingNodes(collection, child, insideControl)
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
  for (const child of node._children) {
    children.push(...serializeTree(child, whitelistedNodes))
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

  /**
   * @return {string}
   */
  toString () {
    return util.inspect(this, { depth: null })
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
