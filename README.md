chrome-remote-interface-extra
=======================

Like [jprichardson/fs-extra](https://github.com/jprichardson/node-fs-extra) but for the [chrome-remote-interface-extra](https://github.com/cyrus-and/chrome-remote-interface) by [cyrus-and](https://github.com/cyrus-and).

The chrome-remote-interface-extra brings a [GoogleChrome/puppeteer](https://github.com/GoogleChrome/puppeteer) like api to the chrome-remote-interface, as well as, making many of the full CDP values puppeteer hides available.

This project also seeks to add extra utility missing from puppeteer by:
  - Make each part of the CDP abstractions divisible not in-divisible as is the case with  puppeteer (when possible)
  - Adding additional abstractions that are currently missing from puppeteer
  - Allowing more control over the abstractions rather relying on a singular option about how things should be done


Why? Simply put, puppeteer's abstractions around the Chrome DevTools Protocol (CDP) are fantastic except for one thing its Googley (not easily extendable beyond their own vision for the project).

## Documentation
  - this library: https://n0tan3rd.github.io/chrome-remote-interface-extra/
  - for chrome-remote-interface: https://github.com/cyrus-and/chrome-remote-interface
  - for puppeteer: https://pptr.dev/

## Overview Of Significant Changes

Async await only code does not include transpiled code (you want it you transpile it).

Added util.inspect.custom definitions to majority of classes so they play nicely with console.log and util.inspect

Added toJSON to CDP Type classes so that their values can easily be serialized to disk for latter computation

#### Cookie [(New Class)](https://github.com/N0taN3rd/chrome-remote-interface-extra/blob/master/lib/network/Cookie.js)
 - an abstraction around using the CDP and Cookies
 - full CDP values
 - modify, delete, add, list
 - integrated with Page and NetworkManager

#### Page
 - now exposes: networkManager, frameManager
 - getAppManifest: get pages app manifest
 - configurable additional domains: no more extra noise, unless that noise is the kind you like \m/, only the minimum number of domains required to use the base page functionality are enabled by default
 - raw CDP methods addScriptToEvaluateOnNewDocument and removeScriptToEvaluateOnNewDocument exposed!!
 - set download behavior
 - ability to force the page to stop loading

#### Page, Frame, DOMWorld
 - added querySelector: an alias for $
 - added querySelectorAll: an alias for $$
 - added querySelectorEval: an alias for $eval
 - added querySelectorAllEval: an alias for $$eval
 - added xpathQuery: an alias for $x
 
#### Page, NetworkManager
  - configure a set of URL that are to be blocked
  - get DER-encoded certificate(s)
  - force HTTP requests to bypass service worker (service workers coming sometime, PR? this project really likes community contributions)
  - new wait: true network idle that considers the cumulative network state
  - disable network and browser cache
  - ability to change the Accept-Language HTTP header, the platform returned by navigator.platform

#### Frame
 - added fromCDPFrame, a static method for creation of a Frame using the full CDP Type Frame values
 - Exposed all CDP Frame Type values via the Frame class

#### FrameManager, Page
 - added getResourceTree: function returning the resource tree (FrameResourceTree instance) for the page currently under control
 - added getFrameResourceContent: function allowing the retrial of the contents of a resource give a frameId and URL

#### FrameResourceTree [(new class)](https://github.com/N0taN3rd/chrome-remote-interface-extra/blob/master/lib/frames/FrameResourceTree.js)
 - Representation of https://chromedevtools.github.io/devtools-protocol/tot/Page#type-FrameResourceTree
 - walkTree: function that walks the frame resources tree using breadth first traversal
 
#### FrameResource [(new class)](https://github.com/N0taN3rd/chrome-remote-interface-extra/blob/master/lib/frames/FrameResource.js)
 - Representation of https://chromedevtools.github.io/devtools-protocol/tot/Page#type-FrameResource
 - getContent: retrieve the contents of this frame resource

#### Request, Response
 - full CDP values exposed
 - additional utility functions added (recreate raw HTTP message)

#### Browser
 - ability to retrieve the full browser version information
 - ability to list all browser contexts, not just those created by the library
 - ability to list all targets, not just those created by the library

## Examples

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