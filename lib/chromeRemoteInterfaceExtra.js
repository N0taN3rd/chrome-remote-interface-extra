const ChromeRemoteInterface = require('chrome-remote-interface')
const CRIConnection = require('./connection/CRIConnection')

/**
 * @typedef {Object} CRIOptions
 * @property {?string} [host] - HTTP frontend host. Defaults to localhost
 * @property {?number} [port] - HTTP frontend port. Defaults to 9222
 * @property {?boolean} [secure] - HTTPS/WSS frontend. Defaults to false
 * @property {?boolean} [useHostName] - do not perform a DNS lookup of the host. Defaults to false
 * @property {?(function|object|string)} [target] - determines which target this client should attach to. The behavior changes according to the type
 * - a function that takes the array returned by the List method and returns a target or its numeric index relative to the array
 * - a target object like those returned by the New and List methods
 * - a string representing the raw WebSocket URL, in this case host and port are not used to fetch the target list, yet they are used to complete the URL if relative
 * - a string representing the target id
 *
 * Defaults to a function which returns the first available target according to the implementation (note that at most one connection can be established to the same target)
 * @property {?Object} [protocol] - Chrome Debugging Protocol descriptor object. Defaults to use the protocol chosen according to the local option
 * @property {?boolean} [local] -  boolean indicating whether the protocol must be fetched remotely or if the local version must be used. It has no effect if the protocol option is set. Defaults to false
 */

/**
 * @param {?CRIOptions} [options]
 * @return {Promise<CRIConnection>}
 */
function CRIExtra (options) {
  return CRIConnection.connect(options)
}

/**
 * @type {function(opts: ?CRIOptions, cb: *): Chrome}
 */
CRIExtra.CDP = ChromeRemoteInterface
CRIExtra.Protocol = ChromeRemoteInterface.Protocol
CRIExtra.List = ChromeRemoteInterface.List
CRIExtra.New = ChromeRemoteInterface.New
CRIExtra.Activate = ChromeRemoteInterface.Activate
CRIExtra.Close = ChromeRemoteInterface.Close
CRIExtra.Version = ChromeRemoteInterface.Version

module.exports = CRIExtra
