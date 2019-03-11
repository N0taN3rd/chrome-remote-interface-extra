const fileURL = require('file-url')
const { StringDecoder } = require('string_decoder')
const util = require('util')
const path = require('path')
const fs = require('fs-extra')
const { TestHelper } = require('../test/helpers/testHelper')
const utils = require('../test/helpers/utils')
const compare = require('../test/helpers/goldenHelper')
const CRIExtra = require('../lib/chromeRemoteInterfaceExtra')
const Browser = require('../lib/browser/Browser')
const Events = require('../lib/Events')

const dio = { depth: null, colors: true, compact: false }
function inspect (object) {
  console.log(util.inspect(object, dio))
}

async function debugTests () {
  const tHelper = await TestHelper.withHTTP(null)
  const server = tHelper.server()
  const browser = tHelper.browser()
  const context = tHelper.browserContext()
  const page = await tHelper.newPage()
  try {
    const browserWSEndpoint = browser.wsEndpoint()
    console.log(browserWSEndpoint)
    const remoteBrowser = await Browser.connect(browserWSEndpoint)
  } finally {
    // await tHelper.cleanup()
    // await tHelper.end()
  }
}

async function doIt () {
  let client
  try {
    // connect to endpoint
    client = await CRIExtra({ host: 'localhost', port: 9222 })
    const browser = await Browser.create(client, {
      contextIds: [],
      ignoreHTTPSErrors: true
    })
    const page = await browser.newPage()
    await page.goto(
      'https://webrecorder.io/jberlin/archival-acid-test-v2/list/bookmarks/b1/20170810014348/http://wsdl-docker.cs.odu.edu:8080/tests/reactSPA/',
      { waitUntil: 'domcontentloaded' }
    )
    await page.networkIdlePromise()
    await page.screenshot({ path: 'wr.png' })
    await browser.close()
  } catch (err) {
    console.error(err)
  } finally {
    if (client) {
      await client.close()
    }
  }
}

const debuggingTest = false
if (debuggingTest) {
  debugTests().catch(error => {
    console.error(error)
  })
} else {
  doIt().catch(error => {
    console.error(error)
  })
}
