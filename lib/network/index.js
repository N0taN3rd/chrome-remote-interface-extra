const { NetworkManager, NetworkEvents } = require('./manager')
const Request = require('./request')
const Response = require('./response')

/**
 * @type {{Response: Response, NetworkEvents: {Response: symbol, Request: symbol, RequestFailed: symbol, RequestFinished: symbol}, Request: Request, NetworkManager: (NetworkManager|NetworkManager)}}
 */
module.exports = { NetworkManager, NetworkEvents, Response, Request }
