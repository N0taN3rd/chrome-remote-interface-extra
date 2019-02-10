const ChromeRemoteInterface = require('chrome-remote-interface')
const { CRIConnection } = require('./criConnectionAdaptor')

/**
 * @param {Object} [options]
 * @return {Promise<CRIConnection>}
 */
function CRIExtra (options) {
  return CRIConnection.connect(options)
}

/**
 * @type {function(opts: *, cb: *): Chrome}
 */
CRIExtra.CDP = ChromeRemoteInterface
CRIExtra.Protocol = ChromeRemoteInterface.Protocol
CRIExtra.List = ChromeRemoteInterface.List
CRIExtra.New = ChromeRemoteInterface.New
CRIExtra.Activate = ChromeRemoteInterface.Activate
CRIExtra.Close = ChromeRemoteInterface.Close
CRIExtra.Version = ChromeRemoteInterface.Version

module.exports = CRIExtra
