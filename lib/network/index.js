/**
 * @type {Cookie}
 */
exports.Cookie = require('./Cookie')

/**
 * @type {NetIdleWatcher}
 */
exports.NetIdleWatcher = require('./NetworkIdleWatcher')

/**
 * @type {NetworkManager}
 */
exports.NetworkManager = require('./NetworkManager')

/**
 * @type {Request}
 */
exports.Request = require('./Request')

/**
 * @type {Response}
 */
exports.Response = require('./Response')

/**
 * @type {SecurityDetails}
 */
exports.SecurityDetails = require('./SecurityDetails')

const fd = require('./Fetch')

exports.Fetch = fd.Fetch
exports.AuthChallengeResponses = fd.AuthChallengeResponses
exports.AuthChallengeSources = fd.AuthChallengeSources
exports.ErrorReasons = fd.ErrorReasons
