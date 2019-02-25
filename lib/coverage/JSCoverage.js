const { helper, debugError, assert } = require('../helper')
const { EVALUATION_SCRIPT_URL } = require('../executionContext')
const { convertToDisjointRanges } = require('./_shared')

class JSCoverage {
  /**
   * @param {Chrome|CRIConnection|CDPSession|Object} client
   */
  constructor (client) {
    /**
     * @type {Chrome|CRIConnection|CDPSession|Object}
     * @private
     */
    this._client = client
    /**
     * @type {boolean}
     * @private
     */
    this._enabled = false
    this._scriptURLs = new Map()
    this._scriptSources = new Map()
    this._eventListeners = []
    this._resetOnNavigation = false
  }

  /**
   * @param {!{resetOnNavigation?: boolean, reportAnonymousScripts?: boolean}} options
   */
  async start (options = {}) {
    assert(!this._enabled, 'JSCoverage is already enabled')
    const { resetOnNavigation = true, reportAnonymousScripts = false } = options
    this._resetOnNavigation = resetOnNavigation
    this._reportAnonymousScripts = reportAnonymousScripts
    this._enabled = true
    this._scriptURLs.clear()
    this._scriptSources.clear()
    this._eventListeners = [
      helper.addEventListener(
        this._client,
        'Debugger.scriptParsed',
        this._onScriptParsed.bind(this)
      ),
      helper.addEventListener(
        this._client,
        'Runtime.executionContextsCleared',
        this._onExecutionContextsCleared.bind(this)
      )
    ]
    await Promise.all([
      this._client.send('Profiler.enable'),
      this._client.send('Profiler.startPreciseCoverage', {
        callCount: false,
        detailed: true
      }),
      this._client.send('Debugger.enable'),
      this._client.send('Debugger.setSkipAllPauses', { skip: true })
    ])
  }

  _onExecutionContextsCleared () {
    if (!this._resetOnNavigation) return
    this._scriptURLs.clear()
    this._scriptSources.clear()
  }

  /**
   * @param {!Object} event
   */
  async _onScriptParsed (event) {
    // Ignore puppeteer-injected scripts
    if (event.url === EVALUATION_SCRIPT_URL) return
    // Ignore other anonymous scripts unless the reportAnonymousScripts option is true.
    if (!event.url && !this._reportAnonymousScripts) return
    try {
      const response = await this._client.send('Debugger.getScriptSource', {
        scriptId: event.scriptId
      })
      this._scriptURLs.set(event.scriptId, event.url)
      this._scriptSources.set(event.scriptId, response.scriptSource)
    } catch (e) {
      // This might happen if the page has already navigated away.
      debugError(e)
    }
  }

  /**
   * @return {Promise<Array<CoverageEntry>>}
   */
  async stop () {
    assert(this._enabled, 'JSCoverage is not enabled')
    this._enabled = false
    const [profileResponse] = await Promise.all([
      this._client.send('Profiler.takePreciseCoverage'),
      this._client.send('Profiler.stopPreciseCoverage'),
      this._client.send('Profiler.disable'),
      this._client.send('Debugger.disable')
    ])
    helper.removeEventListeners(this._eventListeners)

    const coverage = []
    for (const entry of profileResponse.result) {
      let url = this._scriptURLs.get(entry.scriptId)
      if (!url && this._reportAnonymousScripts) {
        url = 'debugger://VM' + entry.scriptId
      }
      const text = this._scriptSources.get(entry.scriptId)
      if (text === undefined || url === undefined) continue
      const flattenRanges = []
      for (const func of entry.functions) flattenRanges.push(...func.ranges)
      const ranges = convertToDisjointRanges(flattenRanges)
      coverage.push({ url, ranges, text })
    }
    return coverage
  }
}

/**
 * @type {JSCoverage}
 */
module.exports = JSCoverage
