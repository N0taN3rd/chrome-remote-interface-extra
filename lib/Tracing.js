const fs = require('fs-extra')
const { assert } = require('./helper')

class Tracing {
  /**
   * @param {Chrome|CRIConnection|CDPSession|Object} client
   */
  constructor (client) {
    /**
     * @type {Chrome|CRIConnection|CDPSession|Object}
     * @private
     */
    this._client = client
    this._recording = false
    this._path = ''
  }

  /**
   * @param {!{path: string, screenshots?: boolean, categories?: Array<string>}} options
   */
  async start (options) {
    assert(
      !this._recording,
      'Cannot start recording trace while already recording trace.'
    )

    const defaultCategories = [
      '-*',
      'devtools.timeline',
      'v8.execute',
      'disabled-by-default-devtools.timeline',
      'disabled-by-default-devtools.timeline.frame',
      'toplevel',
      'blink.console',
      'blink.user_timing',
      'latencyInfo',
      'disabled-by-default-devtools.timeline.stack',
      'disabled-by-default-v8.cpu_profiler',
      'disabled-by-default-v8.cpu_profiler.hires'
    ]
    const {
      path = null,
      screenshots = false,
      categories = defaultCategories
    } = options

    if (screenshots) categories.push('disabled-by-default-devtools.screenshot')

    this._path = path
    this._recording = true
    await this._client.send('Tracing.start', {
      transferMode: 'ReturnAsStream',
      categories: categories.join(',')
    })
  }

  /**
   * @return {Promise<Buffer>}
   */
  async stop () {
    let fulfill
    const contentPromise = new Promise(resolve => (fulfill = resolve))
    this._client.once('Tracing.tracingComplete', event => {
      this._readStream(event.stream, this._path).then(fulfill)
    })
    await this._client.send('Tracing.end')
    this._recording = false
    return contentPromise
  }

  /**
   * @param {string} handle
   * @param {string} path
   */
  async _readStream (handle, path) {
    let eof = false
    let file
    if (path) file = await fs.open(path, 'w')
    const bufs = []
    while (!eof) {
      const response = await this._client.send('IO.read', { handle })
      eof = response.eof
      bufs.push(Buffer.from(response.data))
      if (path) await fs.write(file, response.data)
    }
    if (path) await fs.close(file)
    await this._client.send('IO.close', { handle })
    let resultBuffer = null
    try {
      resultBuffer = Buffer.concat(bufs)
    } catch (_) {}
    return resultBuffer
  }
}

module.exports = Tracing
