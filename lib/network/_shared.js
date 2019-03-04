/**
 * @type {string}
 * @ignore
 */
const CRLF = '\r\n'

/**
 * @ignore
 * @type {string}
 */
const CRLF2x = '\r\n\r\n'

/**
 * @ignore
 * @type {Set<string>}
 */
const NonHTTP2Protocols = new Set(['HTTP/0.9', 'HTTP/1.0', 'HTTP/1.1', 'DATA'])

/**
 * @ignore
 * @type {string}
 */
const SpaceChar = ' '

/**
 * @ignore
 * @type {string}
 */
const DashChar = '-'

/**
 * @type {string}
 */
const H2Method = ':method'

/**
 * @ignore
 * @type {string}
 */
const H2path = ':path'

/**
 * @ignore
 * @type {string}
 */
const HTTP11 = 'HTTP/1.1'

/**
 * @ignore
 * @desc Converts an HTTP request headers object into its string representation
 * @param {Object} headers - The HTTP headers object for the request
 * @param {string} host - The host for the request to be used if the HTTP headers object does not contain the Host field
 * @returns {string}
 */
function stringifyRequestHeaders (headers, host) {
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
 * @ignore
 * @desc Converts an HTTP request headers object into its string representation
 * @param {Object} headers - The HTTP headers object for the request
 * the supplied host is used as its value
 * @returns {string}
 */
function stringifyHeaders (headers) {
  let headerKey
  let outString = []
  for (headerKey in headers) {
    outString.push(`${headerKey}: ${headers[headerKey]}${CRLF}`)
  }
  // join used to fix memory issue caused by concatenation: https://bugs.chromium.org/p/v8/issues/detail?id=3175#c4
  // affects node
  return outString.join('')
}

/**
 * @ignore
 * @param {Object} headers
 * @return {Object}
 */
function headersToLowerCase (headers) {
  let headerKey
  const lowerHeaders = {}
  for (headerKey in headers) {
    lowerHeaders[headerKey.toLowerCase()] = headers[headerKey]
  }
  return lowerHeaders
}

module.exports = {
  stringifyHeaders,
  stringifyRequestHeaders,
  headersToLowerCase,
  CRLF,
  HTTP11,
  H2path,
  H2Method,
  SpaceChar,
  DashChar,
  NonHTTP2Protocols,
  CRLF2x
}
