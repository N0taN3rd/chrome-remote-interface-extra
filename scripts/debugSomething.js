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
const Page = require('../lib/page/Page')
const Target = require('../lib/Target')
const Events = require('../lib/Events')

const dio = { depth: null, colors: true, compact: false }
function inspect (object) {
  console.log(util.inspect(object, dio))
}

// https://www.instagram.com/rhizomedotorg

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
  let client, browser, page
  let closed = false
  try {
    // connect to endpoint
    // const { webSocketDebuggerUrl } = await CRIExtra.Version()
    // aint the chrome-remote-interface by cyrus-and the best <3
    // client = await CRIExtra({ target: webSocketDebuggerUrl })
    // const list = await CRIExtra.List()
    // console.log(list)
    // const { targetInfos } = await client.send('Target.getTargets')
    // console.log(targetInfos)
    page = await Target.connectToPageTarget()
    await page.reload()
    page.on(Events.Page.Console, cmsg => {
      console.log(cmsg.text())
    })
    console.log(await page.window())
    console.log(await page.document())
    // const ret = await page.evaluateHandle(() => {
    //   window.fn = function (...args) {
    //     console.log(...args)
    //   }
    //   return function it () {
    //     console.log('it called')
    //   }
    // })
    // await ret.call()
    //
    // const windowHandle = await page.evaluateHandle(() => window)
    //
    // await windowHandle.callFn('fn', 1, 2, 3, 4, 5, 6)

    // console.log(await (await body.children())[0].getAttribute('id', 'blah'))
  } catch (err) {
    console.error(err)
  } finally {
    if (page && !page.isClosed()) {
      await page._client.close()
      // await page.close()
    }
    if (browser && !closed) {
      await browser.close()
    }
    if (client && !closed) {
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
