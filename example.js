const { CRIExtra, Browser } = require('.')

const fairlyComplicatedPage =
  'https://webrecorder.io/jberlin/archival-acid-test-v2/list/bookmarks/b1/20170810014348/http://wsdl-docker.cs.odu.edu:8080/tests/reactSPA/'

async function webercorderIOScreenshot () {
  let client
  let browser
  try {
    client = await CRIExtra({ host: 'localhost', port: 9222 })
    browser = await Browser.create(client, {
      contextIds: [],
      ignoreHTTPSErrors: true
    })
    const page = await browser.newPage()
    await page.goto(fairlyComplicatedPage, { waitUntil: 'domcontentloaded' })
    await page.networkIdlePromise()
    await page.screenshot({ path: 'wr.png' })
    await browser.close()
  } catch (err) {
    console.error(err)
  } finally {
    if (browser) {
      await browser.close()
    } else if (client) {
      await client.close()
    }
  }
}

webercorderIOScreenshot().catch(error => {
  console.error('Screenshot failed', error)
})
