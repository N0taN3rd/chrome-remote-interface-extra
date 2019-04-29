const {
  CRIClientPatched,
  adaptChromeRemoteInterfaceClient
} = require('./adaptor')

exports.CRIClientPatched = CRIClientPatched

exports.adaptChromeRemoteInterfaceClient = adaptChromeRemoteInterfaceClient

exports.CRIConnection = require('./CRIConnection')

exports.CDPSession = require('./CDPSession')

/**
 * @typedef {Chrome|CRIConnection|CDPSession|Object} ConnectionTypes
 */
