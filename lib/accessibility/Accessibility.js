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
   * @param {{interestingOnly?: boolean, root?: ?ElementHandle}=} [options]
   * @return {Promise<SerializedAXNode>}
   */
  async snapshot (options = {}) {
    const { interestingOnly = true, root = null } = options
    const { nodes } = await this._client.send('Accessibility.getFullAXTree')
    let backendNodeId = null
    if (root) {
      const { node } = await this._client.send('DOM.describeNode', {
        objectId: root._remoteObject.objectId
      })
      backendNodeId = node.backendNodeId
    }
    const defaultRoot = AXNode.createTree(nodes)
    let needle = defaultRoot
    if (backendNodeId) {
      needle = defaultRoot.find(
        node => node._payload.backendDOMNodeId === backendNodeId
      )
      if (!needle) return null
    }

    if (!interestingOnly) return serializeTree(needle)[0]

    /** @type {!Set<!AXNode>} */
    const interestingNodes = new Set()
    collectInterestingNodes(interestingNodes, defaultRoot, false)
    if (!interestingNodes.has(needle)) return null
    return serializeTree(needle, interestingNodes)[0]
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

module.exports = Accessibility
