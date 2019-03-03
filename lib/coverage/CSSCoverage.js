const { helper, debugError, assert } = require('../helper')
const { convertToDisjointRanges } = require('../__shared')

class CSSCoverage {
  /**
   * @param {!Chrome|CRIConnection|CDPSession|Object} client
   */
  constructor (client) {
    this._client = client
    this._enabled = false
    this._stylesheetURLs = new Map()
    this._stylesheetSources = new Map()
    this._eventListeners = []
    this._resetOnNavigation = false
  }

  /**
   * @param {{resetOnNavigation?: boolean}=} options
   */
  async start (options = {}) {
    assert(!this._enabled, 'CSSCoverage is already enabled')
    const { resetOnNavigation = true } = options
    this._resetOnNavigation = resetOnNavigation
    this._enabled = true
    this._stylesheetURLs.clear()
    this._stylesheetSources.clear()
    this._eventListeners = [
      helper.addEventListener(
        this._client,
        'CSS.styleSheetAdded',
        this._onStyleSheet.bind(this)
      ),
      helper.addEventListener(
        this._client,
        'Runtime.executionContextsCleared',
        this._onExecutionContextsCleared.bind(this)
      )
    ]
    await Promise.all([
      this._client.send('DOM.enable'),
      this._client.send('CSS.enable'),
      this._client.send('CSS.startRuleUsageTracking')
    ])
  }

  _onExecutionContextsCleared () {
    if (!this._resetOnNavigation) return
    this._stylesheetURLs.clear()
    this._stylesheetSources.clear()
  }

  /**
   * @param {!Object} event
   */
  async _onStyleSheet (event) {
    const header = event.header
    // Ignore anonymous scripts
    if (!header.sourceURL) return
    try {
      const response = await this._client.send('CSS.getStyleSheetText', {
        styleSheetId: header.styleSheetId
      })
      this._stylesheetURLs.set(header.styleSheetId, header.sourceURL)
      this._stylesheetSources.set(header.styleSheetId, response.text)
    } catch (e) {
      // This might happen if the page has already navigated away.
      debugError(e)
    }
  }

  /**
   * @return {Promise<Array<CoverageEntry>>}
   */
  async stop () {
    assert(this._enabled, 'CSSCoverage is not enabled')
    this._enabled = false
    const ruleTrackingResponse = await this._client.send(
      'CSS.stopRuleUsageTracking'
    )
    await Promise.all([
      this._client.send('CSS.disable'),
      this._client.send('DOM.disable')
    ])
    helper.removeEventListeners(this._eventListeners)

    // aggregate by styleSheetId
    const styleSheetIdToCoverage = new Map()
    for (const entry of ruleTrackingResponse.ruleUsage) {
      let ranges = styleSheetIdToCoverage.get(entry.styleSheetId)
      if (!ranges) {
        ranges = []
        styleSheetIdToCoverage.set(entry.styleSheetId, ranges)
      }
      ranges.push({
        startOffset: entry.startOffset,
        endOffset: entry.endOffset,
        count: entry.used ? 1 : 0
      })
    }

    const coverage = []
    for (const styleSheetId of this._stylesheetURLs.keys()) {
      const url = this._stylesheetURLs.get(styleSheetId)
      const text = this._stylesheetSources.get(styleSheetId)
      const ranges = convertToDisjointRanges(
        styleSheetIdToCoverage.get(styleSheetId) || []
      )
      coverage.push({ url, ranges, text })
    }

    return coverage
  }
}

/**
 *
 * @type {CSSCoverage}
 */
module.exports = CSSCoverage
