chrome-remote-interface-extra
=======================
[![NPM chrome-remote-interface-extra package](https://img.shields.io/npm/v/chrome-remote-interface-extra.svg?style=flat-square)](https://npmjs.org/package/chrome-remote-interface-extra) 
[![node requirement](https://img.shields.io/badge/node-%3E%3D%208.6.0-brightgreen.svg?style=flat-square)](https://nodejs.org) 
[![never semis](https://img.shields.io/badge/code_style-prettier--standard-ff69b4.svg?style=flat-square)](https://github.com/sheerun/prettier-standard) 
[![sanic](https://img.shields.io/badge/speed-blazing%20%F0%9F%94%A5-brightgreen.svg?style=flat-square)](https://twitter.com/acdlite/status/974390255393505280)

The chrome-remote-interface-extra brings a [GoogleChrome/puppeteer](https://github.com/GoogleChrome/puppeteer) like api to the [chrome-remote-interface-extra](https://github.com/cyrus-and/chrome-remote-interface) by [cyrus-and](https://github.com/cyrus-and) :heart:, as well as, making many of the full CDP values puppeteer hides available.

## Getting Started

### Installation
To use chrome-remote-interface-extra in your project, run:

```bash
yarn add chrome-remote-interface-extra
# or "npm i chrome-remote-interface-extra"
```

Note: The chrome-remote-interface-extra differs from puppeteer in that you must BYOB (bring your own browser). 

### Documentation
  - this library: https://n0tan3rd.github.io/chrome-remote-interface-extra/
  - for chrome-remote-interface: https://github.com/cyrus-and/chrome-remote-interface

### Usage
Note: chrome-remote-interface-extra requires at least Node v8.6.0 (according to [node.green](https://node.green/)) and is tested on the latest version of [Node](https://nodejs.org/en/download/current/)

**Example** - navigating to [fairly complicated single page application (SPA)](https://webrecorder.io/jberlin/archival-acid-test-v2/list/bookmarks/b1/20170810014348/http://wsdl-docker.cs.odu.edu:8080/tests/reactSPA/) and saving a screenshot as *wr.png*:


```javascript
const { CRIExtra, Browser } = require('chrome-remote-interface-extra')

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
```

Additional examples can be derived from looking over this project's [test suite](https://github.com/N0taN3rd/chrome-remote-interface-extra/blob/master/test)

# FAQ

#### Q: Why

Simply put, puppeteer's abstractions around the Chrome DevTools Protocol (CDP) are fantastic except for one thing its Googley (not easily extendable beyond their own vision for the project). 

The chrome-remote-interface by cyrus-and is a building block not an opinion, so why not build on top of it like [jprichardson](https://github.com/jprichardson) did for [fs-extra](https://github.com/jprichardson/node-fs-extra).

#### Q: Who maintains chrome-remote-interface-extra?

[N0tan3rd](https://twitter.com/johnaberlin) and the community! Lets build something together!

#### Q: What are chrome-remote-interface-extra’s goals and principles?

The goals of the project is to add extra utility to the chrome-remote-interface by
- **Use open source projects and not re-invent the wheel!**
- Make each part of the CDP abstractions divisible not in-divisible as is the case with  puppeteer (when possible)
- Adding additional abstractions that are currently missing from puppeteer
- Allowing more control over the abstractions rather relying on a singular opinion about how things should be done


#### Q: Is chrome-remote-interface-extra replacing Selenium/WebDriver?

**It should**. Both Selenium/WebDriver can not provide you with access to the heart beat of the browser which is required for modern day web pages and [use cases](https://github.com/N0taN3rd/Squidwarc).

#### Q: Whats different from puppeteer / the extra utility you speak off

An non-exhaustive overview of the differences/additions is provided below.
A full listing can be found by consulting our [documentation](https://n0tan3rd.github.io/chrome-remote-interface-extra/)

Added `util.inspect.custom` definitions to majority of classes so they play nicely with console.log and util.inspect

Added `toJSON` to CDP Type classes so that their values can easily be serialized to disk for latter computation

#### Animation Domain: Tweak and inspect your animations
 - Animation [(new class)](https://github.com/N0taN3rd/chrome-remote-interface-extra/blob/master/lib/animations/Animation.js) 
- AnimationManger [(new class)](https://github.com/N0taN3rd/chrome-remote-interface-extra/blob/master/lib/animations/AnimationManager.js)

#### Cookie [(new class)](https://github.com/N0taN3rd/chrome-remote-interface-extra/blob/master/lib/network/Cookie.js)
 - an abstraction around using the CDP and Cookies
 - full CDP values
 - modify, delete, add, list
 - integrated with Page and NetworkManager

#### Database Domain: You should see whats in your browsers database
- Database [(new class)](https://github.com/N0taN3rd/chrome-remote-interface-extra/blob/master/lib/database/Database.js)
- DatabaseManager [(new class)](https://github.com/N0taN3rd/chrome-remote-interface-extra/blob/master/lib/database/DatabaseManager.js)


#### Inspection and retrieval of per frame resources
- FrameResource [(new class)](https://github.com/N0taN3rd/chrome-remote-interface-extra/blob/master/lib/frames/FrameResource.js)
- FrameResourceTree [(new class)](https://github.com/N0taN3rd/chrome-remote-interface-extra/blob/master/lib/frames/FrameResourceTree.js)

### ServiceWorkers!
- ServiceWorker [(new class)](https://github.com/N0taN3rd/chrome-remote-interface-extra/blob/master/lib/workers/ServiceWorker.js) 

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
 - added getElementById: as the name implies
 
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

#### Request, Response
 - full CDP values exposed
 - additional utility functions added (recreate raw HTTP message)

#### Browser
 - ability to retrieve the full browser version information
 - ability to list all browser contexts, not just those created by the library
 - ability to list all targets, not just those created by the library
 - browser histograms
 
#### Browser, BrowserContext, Target
 - expose CDP for some target
 - manipulate the actual browser window not just the view port 
 
#### Target
 - Does not require Browser or BrowserContext, can now operate independently
