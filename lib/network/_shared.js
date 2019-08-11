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
 * Converts an HTTP request headers object into its string representation
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
 * Converts an HTTP request headers object into its string representation
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

function objectIsNullOrUndefined (obj) {
  return Object.is(obj, undefined) || Object.is(obj, null)
}

/**
 * @param {{name: string, value: string}|Array<{name: string, value: string}>} headers
 * @return {!Array<CDPHeaderEntry>}
 */
function headersArray (headers) {
  if (Array.isArray(headers)) return headers
  const result = []
  for (const name in headers) {
    if (!objectIsNullOrUndefined(headers[name])) {
      result.push({ name, value: `${headers[name]}` })
    }
  }
  return result
}

// List taken from https://www.iana.org/assignments/http-status-codes/http-status-codes.xhtml with extra 306 and 418 codes.
const StatusToMessage = {
  '100': 'Continue',
  '101': 'Switching Protocols',
  '102': 'Processing',
  '103': 'Early Hints',
  '200': 'OK',
  '201': 'Created',
  '202': 'Accepted',
  '203': 'Non-Authoritative Information',
  '204': 'No Content',
  '205': 'Reset Content',
  '206': 'Partial Content',
  '207': 'Multi-Status',
  '208': 'Already Reported',
  '226': 'IM Used',
  '300': 'Multiple Choices',
  '301': 'Moved Permanently',
  '302': 'Found',
  '303': 'See Other',
  '304': 'Not Modified',
  '305': 'Use Proxy',
  '306': 'Switch Proxy',
  '307': 'Temporary Redirect',
  '308': 'Permanent Redirect',
  '400': 'Bad Request',
  '401': 'Unauthorized',
  '402': 'Payment Required',
  '403': 'Forbidden',
  '404': 'Not Found',
  '405': 'Method Not Allowed',
  '406': 'Not Acceptable',
  '407': 'Proxy Authentication Required',
  '408': 'Request Timeout',
  '409': 'Conflict',
  '410': 'Gone',
  '411': 'Length Required',
  '412': 'Precondition Failed',
  '413': 'Payload Too Large',
  '414': 'URI Too Long',
  '415': 'Unsupported Media Type',
  '416': 'Range Not Satisfiable',
  '417': 'Expectation Failed',
  '418': "I'm a teapot",
  '421': 'Misdirected Request',
  '422': 'Unprocessable Entity',
  '423': 'Locked',
  '424': 'Failed Dependency',
  '425': 'Too Early',
  '426': 'Upgrade Required',
  '428': 'Precondition Required',
  '429': 'Too Many Requests',
  '431': 'Request Header Fields Too Large',
  '451': 'Unavailable For Legal Reasons',
  '500': 'Internal Server Error',
  '501': 'Not Implemented',
  '502': 'Bad Gateway',
  '503': 'Service Unavailable',
  '504': 'Gateway Timeout',
  '505': 'HTTP Version Not Supported',
  '506': 'Variant Also Negotiates',
  '507': 'Insufficient Storage',
  '508': 'Loop Detected',
  '510': 'Not Extended',
  '511': 'Network Authentication Required'
}

module.exports = {
  StatusToMessage,
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
  CRLF2x,
  headersArray
}
