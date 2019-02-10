const { CRIExtra, Browser, Page } = require('./lib')

async function puppeteeryWay () {
  let client
  try {
    // connect to endpoint
    client = await CRIExtra({ host: 'localhost', port: 9222 })
    const browser = await Browser.create(client, {
      contextIds: [],
      ignoreHTTPSErrors: true
    })
    const page = await browser.newPage()
    await page.goto('https://example.com')
    await page.screenshot({ path: 'example.png' })
    await browser.close()
  } catch (err) {
    console.error(err)
  } finally {
    if (client) {
      await client.close()
    }
  }
}

async function koolKidsWay () {
  let client
  try {
    // connect to endpoint
    client = await CRIExtra({ host: 'localhost', port: 9222 })
    const page = await Page.create(client)
    await page.goto('https://example.com', { waitUntil: 'networkIdle' })
    await page.screenshot({ path: 'koolExample.png' })
  } catch (err) {
    console.error(err)
  } finally {
    if (client) {
      await client.close()
    }
  }
}

;(async () => {
  await puppeteeryWay()
  await koolKidsWay()
})()
