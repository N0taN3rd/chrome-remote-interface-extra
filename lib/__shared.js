const { helper, assert } = require('./helper')
const Cookie = require('./network/Cookie')

/**
 * @ignore
 * @param {Chrome|CDPSession|CRIConnection} client
 * @param {string} targetId - The id of the target to be closed
 * @param {boolean} [throwOnError] - If true and the command was un-successful the caught error is thrown
 * @return {Promise<boolean>}
 */
exports.closeTarget = async function closeTarget (
  client,
  targetId,
  throwOnError
) {
  let success = true
  try {
    await client.send('Target.closeTarget', {
      targetId
    })
  } catch (e) {
    if (throwOnError) throw e
    success = false
  }
  return success
}

/**
 * @ignore
 * Inject object to the target's main frame that provides a communication channel with browser target.
 *
 * Injected object will be available as window[bindingName].
 *
 * The object has the following API:
 *  * binding.send(json) - a method to send messages over the remote debugging protocol
 *  * binding.onmessage = json => handleMessage(json) - a callback that will be called for the protocol notifications and command responses.
 *
 * EXPERIMENTAL
 * @param {Chrome|CDPSession|CRIConnection} client
 * @param {string} targetId
 * @param {string} [bindingName] - Binding name, 'cdp' if not specified
 * @return {Promise<void>}
 * @see https://chromedevtools.github.io/devtools-protocol/tot/Target#method-exposeDevToolsProtocol
 */
exports.exposeCDPOnTarget = async function exposeCDPOnTarget (
  client,
  targetId,
  bindingName
) {
  await client.send('Target.exposeDevToolsProtocol', {
    targetId: targetId,
    bindingName: bindingName || undefined
  })
}

/**
 * @ignore
 * Get the browser window that contains the target. EXPERIMENTAL
 * @param {Chrome|CDPSession|CRIConnection} client
 * @param {string} [targetId] - Optional target id of the target to receive the window id and its bound for.
 * If called as a part of the session, associated targetId is used.
 * @return {Promise<{bounds: WindowBounds, windowId: number}>}
 * @see https://chromedevtools.github.io/devtools-protocol/tot/Browser#method-getWindowForTarget
 */
exports.getWindowForTarget = function getWindowForTarget (client, targetId) {
  return client.send('Browser.getWindowForTarget', {
    targetId: targetId || undefined
  })
}

/**
 * @ignore
 * Get position and size of the browser window. EXPERIMENTAL
 * @param {Chrome|CDPSession|CRIConnection} client
 * @param {number} windowId
 * @return {Promise<WindowBounds>}
 * @see https://chromedevtools.github.io/devtools-protocol/tot/Browser#method-getWindowBounds
 */
exports.getWindowBounds = function getWindowBounds (client, windowId) {
  assert(
    helper.isNumber(windowId),
    `The windowId param must be of type "Number", received type ${typeof windowId}`
  )
  return client.send('Browser.getWindowBounds', { windowId })
}

/**
 * @ignore
 * Set position and/or size of the browser window. EXPERIMENTAL
 * @param {Chrome|CDPSession|CRIConnection} client
 * @param {number} windowId - An browser window id
 * @param {WindowBounds} bounds - New window bounds. The 'minimized', 'maximized' and 'fullscreen' states cannot be combined with 'left', 'top', 'width' or 'height'. Leaves unspecified fields unchanged.
 * @return {Promise<void>}
 * @see https://chromedevtools.github.io/devtools-protocol/tot/Browser#method-setWindowBounds
 */
exports.setWindowBounds = async function setWindowBounds (
  client,
  windowId,
  bounds
) {
  assert(
    helper.isNumber(windowId),
    `The windowId param must be of type "Number", received type ${typeof windowId}`
  )
  await client.send('Browser.setWindowBounds', { windowId, bounds })
}

/**
 * @ignore
 * @param {Error} error
 * @param {string} message
 * @return {Error}
 */
function rewriteError (error, message) {
  error.message = message
  return error
}

/**
 * @ignore
 * @param {Error} error
 * @param {string} method
 * @param {Object} object
 * @return {Error}
 */
exports.createProtocolError = function createProtocolError (
  error,
  method,
  object
) {
  const extra = 'data' in object.error ? ` ${object.error.data}` : ''
  const message = `Protocol error (${method}): ${object.error.message}${extra}`
  return rewriteError(error, message)
}

/** @ignore */
exports.rewriteError = rewriteError

/**
 * @param {Array<{startOffset:number, endOffset:number, count:number}>} nestedRanges
 * @return {Array<{start:number, end:number}>}
 * @ignore
 */
exports.convertToDisjointRanges = function convertToDisjointRanges (
  nestedRanges
) {
  const points = []
  for (const range of nestedRanges) {
    points.push({ offset: range.startOffset, type: 0, range })
    points.push({ offset: range.endOffset, type: 1, range })
  }
  // Sort points to form a valid parenthesis sequence.
  points.sort((a, b) => {
    // Sort with increasing offsets.
    if (a.offset !== b.offset) return a.offset - b.offset
    // All "end" points should go before "start" points.
    if (a.type !== b.type) return b.type - a.type
    const aLength = a.range.endOffset - a.range.startOffset
    const bLength = b.range.endOffset - b.range.startOffset
    // For two "start" points, the one with longer range goes first.
    if (a.type === 0) return bLength - aLength
    // For two "end" points, the one with shorter range goes first.
    return aLength - bLength
  })

  const hitCountStack = []
  const results = []
  let lastOffset = 0
  // Run scanning line to intersect all ranges.
  for (const point of points) {
    if (
      hitCountStack.length &&
      lastOffset < point.offset &&
      hitCountStack[hitCountStack.length - 1] > 0
    ) {
      const lastResult = results.length ? results[results.length - 1] : null
      if (lastResult && lastResult.end === lastOffset)
        lastResult.end = point.offset
      else results.push({ start: lastOffset, end: point.offset })
    }
    lastOffset = point.offset
    if (point.type === 0) hitCountStack.push(point.range.count)
    else hitCountStack.pop()
  }
  // Filter out empty ranges.
  return results.filter(range => range.end - range.start > 1)
}

/** @ignore */
function addCommand (connection, domainName, command) {
  const fullCommand = `${domainName}.${command.name}`
  const handler = (params, callback) => {
    return connection._interopSend(fullCommand, params, callback)
  }
  const ohandler = connection[domainName][command.name]
  const existingDecorations = Object.keys(ohandler)
  for (let i = 0; i < existingDecorations.length; i++) {
    handler[existingDecorations[i]] = ohandler[existingDecorations[i]]
  }
  connection[domainName][command.name] = handler
}

/** @ignore */
exports.interopCRIApi = function interopCRIApi (connection) {
  if (connection.protocol && connection.protocol.domains) {
    const domains = connection.protocol.domains
    const numDomains = domains.length
    let numCommands
    let i = 0
    let j = 0
    let domain
    let domainName
    for (; i < numDomains; i++) {
      domain = domains[i]
      if (domain.commands) {
        domainName = domain.domain
        numCommands = domain.commands.length
        for (j = 0; j < numCommands; j++) {
          addCommand(connection, domainName, domain.commands[j])
        }
      }
    }
  }
}

/**
 *
 * @param {CDPCookie|Cookie|string} cookie
 * @param {string} url
 * @param {boolean} setURLIfMissing
 * @return {CDPCookie}
 */
exports.ensureCookie = function ensureCookie (cookie, url, setURLIfMissing) {
  let ensuredCookie
  if (typeof cookie === 'string') {
    if (cookie.includes('=')) {
      const nameValue = cookie.split('=')
      ensuredCookie = { name: nameValue[0], value: nameValue[1] }
    } else {
      ensuredCookie = { name: cookie }
    }
  } else if (cookie instanceof Cookie) {
    ensuredCookie = cookie.toJSON()
  } else {
    ensuredCookie = Object.assign({}, cookie)
  }
  if (!ensuredCookie.url && setURLIfMissing) {
    ensuredCookie.url = url
  }
  return ensuredCookie
}
