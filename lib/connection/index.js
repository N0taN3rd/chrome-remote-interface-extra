const {
  CRIClientPatched,
  adaptChromeRemoteInterfaceClient
} = require('./adaptor')

/**
 * @type {symbol}
 */
exports.CRIClientPatched = CRIClientPatched

/**
 * @type {function(connection: ConnectionTypes): ConnectionTypes}
 */
exports.adaptChromeRemoteInterfaceClient = adaptChromeRemoteInterfaceClient

/**
 * @type {CRIConnection}
 */
exports.CRIConnection = require('./CRIConnection')

/**
 * @type {CDPSession}
 */
exports.CDPSession = require('./CDPSession')

/**
 * @typedef {Chrome|CRIConnection|CDPSession|Object} ConnectionTypes
 */
