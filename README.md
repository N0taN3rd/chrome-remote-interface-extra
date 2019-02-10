chrome-remote-interface-extra
=======================

Like [jprichardson/fs-extra](https://github.com/jprichardson/node-fs-extra) but for the [chrome-remote-interface-extra](https://github.com/cyrus-and/chrome-remote-interface) by [cyrus-and](https://github.com/cyrus-and).

The chrome-remote-interface-extra brings a [GoogleChrome/puppeteer](https://github.com/GoogleChrome/puppeteer) like api to the chrome-remote-interface as well as making many of the full CDP values puppetter hides available.

Why? Simply put, puppetter's abstractions around the Chrome DevTools Protocol (CDP) are fantastic except for one thing its Googley (not easily extendable beyond their own vision for the project).

For the CDP to take over and put WebDriver in the grave, not to mention make FireFox implement it (puuuuweeeeezzzz), we need to make using the CDP dead simple.

#### More Documentation Forthcoming but heres an example

```javascript
const { CRIExtra, Browser, Page } = require('chrome-remote-interface-extra')

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

(async () => {
  await puppeteeryWay()
  await koolKidsWay()
})()
```