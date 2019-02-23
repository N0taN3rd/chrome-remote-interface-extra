/**
 * @type {string}
 */
const CRLF = '\r\n'

exports.CRLF = CRLF

/**
 * @type {string}
 */
exports.CRLF2x = '\r\n\r\n'

/**
 * @type {Set<string>}
 */
exports.NonHTTP2Protocols = new Set([
  'HTTP/0.9',
  'HTTP/1.0',
  'HTTP/1.1',
  'DATA'
])

/**
 * @type {string}
 */
exports.SpaceChar = ' '

/**
 * @type {string}
 */
exports.DashChar = '-'

/**
 * @type {string}
 */
exports.H2Method = ':method'

/**
 * @type {string}
 */
exports.H2path = ':path'

/**
 * @type {string}
 */
exports.HTTP11 = 'HTTP/1.1'

/**
 * @desc Converts an HTTP request headers object into its string representation
 * @param {Object} headers - The HTTP headers object for the request
 * @param {string} host - The host for the request to be used if the HTTP headers object does not contain the Host field
 * @returns {string}
 */
exports.stringifyRequestHeaders = function stringifyRequestHeaders (headers, host) {
  let hasHost = false
  let headerKey
  let outString = []
  for (headerKey in headers) {
    if (headerKey === 'host' || headerKey === 'Host') {
      hasHost = true
    }
    outString.push(`${headerKey}: ${headers[headerKey]}${CRLF}`)
  }
  if (!hasHost) {
    outString.push(`Host: ${host}${CRLF}`)
  }
  // join used to fix memory issue caused by concatenation: https://bugs.chromium.org/p/v8/issues/detail?id=3175#c4
  // affects node
  return outString.join('')
}

/**
 * @desc Converts an HTTP request headers object into its string representation
 * @param {Object} headers - The HTTP headers object for the request
 * the supplied host is used as its value
 * @returns {string}
 */
exports.stringifyHeaders = function stringifyHeaders (headers) {
  let headerKey
  let outString = []
  for (headerKey in headers) {
    outString.push(`${headerKey}: ${headers[headerKey]}${CRLF}`)
  }
  // join used to fix memory issue caused by concatenation: https://bugs.chromium.org/p/v8/issues/detail?id=3175#c4
  // affects node
  return outString.join('')
}
