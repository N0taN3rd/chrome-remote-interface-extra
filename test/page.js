import test from 'ava'
import * as path from 'path'
import * as utils from './helpers/utils'
import { TestHelper } from './helpers/testHelper'
import { TimeoutError } from '../lib/Errors'
import Events from '../lib/Events'
import DeviceDescriptors from '../lib/DeviceDescriptors'

const { waitEvent } = utils
const iPhone = DeviceDescriptors['iPhone 6']

/** @type {TestHelper} */
let helper

test.serial.before(async t => {
  helper = await TestHelper.withHTTP(t)
})

test.serial.beforeEach(async t => {
  t.context.context = helper.browserContext()
  t.context.browser = helper.browser()
  t.context.server = helper.server()
  t.context.page = await helper.newPage()
})

test.serial.afterEach.always(async t => {
  await helper.cleanup()
})

test.after.always(async t => {
  await helper.end()
})

const _expectedOutput =
  '<html><head></head><body><div>hello</div></body></html>'

function getPermission (page, name) {
  return page.evaluate(
    name =>
      navigator.permissions
        .query({
          name
        })
        .then(result => result.state),
    name
  )
}

test.serial(
  'Page.close should reject all promises when page is closed',
  async t => {
    const { context } = t.context
    const newPage = await context.newPage()
    let error = null
    await Promise.all([
      newPage.evaluate(() => new Promise(r => {})).catch(e => (error = e)),
      newPage.close()
    ])
    t.true(error.message.includes('Protocol error'))
  }
)

test.serial('Page.close should not be visible in browser.pages', async t => {
  const { browser } = t.context
  const newPage = await browser.newPage()
  t.true((await browser.pages()).includes(newPage))
  await newPage.close()
  t.false((await browser.pages()).includes(newPage))
})

test.serial('Page.close should run beforeunload if asked for', async t => {
  const { context, server } = t.context
  const newPage = await context.newPage()
  await newPage.goto(server.PREFIX + '/beforeunload.html') // We have to interact with a page so that 'beforeunload' handlers
  // fire.

  await newPage.click('body')
  const pageClosingPromise = newPage.close({
    runBeforeUnload: true
  })
  const dialog = await waitEvent(newPage, 'dialog')
  t.is(dialog.type(), 'beforeunload')
  t.is(dialog.defaultValue(), '')
  t.is(dialog.message(), '')
  await dialog.accept()
  await pageClosingPromise
})

test.serial('Page.close should *not* run beforeunload by default', async t => {
  const { context, server } = t.context
  const newPage = await context.newPage()
  await newPage.goto(server.PREFIX + '/beforeunload.html') // We have to interact with a page so that 'beforeunload' handlers
  // fire.

  await newPage.click('body')
  await newPage.close()
  t.pass()
})

test.serial('Page.close should set the page close state', async t => {
  const { context } = t.context
  const newPage = await context.newPage()
  t.false(newPage.isClosed())
  await newPage.close()
  t.true(newPage.isClosed())
})

test.serial('Page.Events.Load should fire when expected', async t => {
  const { page, server } = t.context
  await Promise.all([page.goto('about:blank'), utils.waitEvent(page, 'load')])
  t.pass()
})

test.serial('Page.Events.error should throw when page crashes', async t => {
  const { page } = t.context
  let error = null
  page.on(Events.Page.Error, err => (error = err))
  page.goto('chrome://crash').catch(e => {})
  await waitEvent(page, 'error')
  t.is(error.message, 'Page crashed!')
})

test.serial('Page.Events.Popup should work', async t => {
  const { page } = t.context
  const [popup] = await Promise.all([
    new Promise(x => page.once(Events.Page.Popup, x)),
    page.evaluate(() => window.open('about:blank'))
  ])
  t.false(await page.evaluate(() => !!window.opener))
  t.true(await popup.evaluate(() => !!window.opener))
})

test.serial('Page.Events.Popup should work with noopener', async t => {
  const { page } = t.context
  const [popup] = await Promise.all([
    new Promise(x => page.once('popup', x)),
    page.evaluate(() => window.open('about:blank', null, 'noopener'))
  ])
  t.false(await page.evaluate(() => !!window.opener))
  t.false(await popup.evaluate(() => !!window.opener))
})

test.serial(
  'Page.Events.Popup should work with clicking target=_blank',
  async t => {
    const { page, server } = t.context
    await page.goto(server.EMPTY_PAGE)
    await page.setContent('<a target=_blank href="/one-style.html">yo</a>')
    const [popup] = await Promise.all([
      new Promise(x => page.once('popup', x)),
      page.click('a')
    ])
    t.false(await page.evaluate(() => !!window.opener))
    t.true(await popup.evaluate(() => !!window.opener))
  }
)

test.serial(
  'Page.Events.Popup should work with fake-clicking target=_blank and rel=noopener',
  async t => {
    const { page, server } = t.context
    await page.goto(server.EMPTY_PAGE)
    await page.setContent(
      '<a target=_blank rel=noopener href="/one-style.html">yo</a>'
    )
    const [popup] = await Promise.all([
      new Promise(x => page.once('popup', x)),
      page.$eval('a', a => a.click())
    ])
    t.false(await page.evaluate(() => !!window.opener))
    t.false(await popup.evaluate(() => !!window.opener))
  }
)

test.serial(
  'Page.Events.Popup should work with clicking target=_blank and rel=noopener',
  async t => {
    const { page, server } = t.context
    await page.goto(server.EMPTY_PAGE)
    await page.setContent(
      '<a target=_blank rel=noopener href="/one-style.html">yo</a>'
    )
    const [popup] = await Promise.all([
      new Promise(x => page.once('popup', x)),
      page.click('a')
    ])
    t.false(await page.evaluate(() => !!window.opener))
    t.false(await popup.evaluate(() => !!window.opener))
  }
)

test.serial(
  'BrowserContext.overridePermissions should be prompt by default',
  async t => {
    const { page, server, context } = t.context
    await page.goto(server.EMPTY_PAGE)
    t.is(await getPermission(page, 'geolocation'), 'prompt')
  }
)

test.serial(
  'BrowserContext.overridePermissions should deny permission when not listed',
  async t => {
    const { page, server, context } = t.context
    await page.goto(server.EMPTY_PAGE)
    await context.overridePermissions(server.EMPTY_PAGE, [])
    t.is(await getPermission(page, 'geolocation'), 'denied')
  }
)

test.serial(
  'BrowserContext.overridePermissions should fail when bad permission is given',
  async t => {
    const { page, server, context } = t.context
    await page.goto(server.EMPTY_PAGE)
    let error = null
    await context
      .overridePermissions(server.EMPTY_PAGE, ['foo'])
      .catch(e => (error = e))
    t.is(error.message, 'Unknown permission: foo')
  }
)

test.serial(
  'BrowserContext.overridePermissions should grant permission when listed',
  async t => {
    const { page, server, context } = t.context
    await page.goto(server.EMPTY_PAGE)
    await context.overridePermissions(server.EMPTY_PAGE, ['geolocation'])
    t.is(await getPermission(page, 'geolocation'), 'granted')
  }
)

test.serial(
  'BrowserContext.overridePermissions should reset permissions',
  async t => {
    const { page, server, context } = t.context
    await page.goto(server.EMPTY_PAGE)
    await context.overridePermissions(server.EMPTY_PAGE, ['geolocation'])
    t.is(await getPermission(page, 'geolocation'), 'granted')
    await context.clearPermissionOverrides()
    t.is(await getPermission(page, 'geolocation'), 'prompt')
  }
)

test.serial(
  'BrowserContext.overridePermissions should trigger permission onchange',
  async t => {
    const { page, server, context } = t.context
    await page.goto(server.EMPTY_PAGE)
    const testFn = async () => {
      window.navPermissions = window.navPermissions || []
      const result = await navigator.permissions.query({
        name: 'geolocation'
      })
      window.navPermissions.push(result.state)
      return window.navPermissions
    }
    let navPermissions = await page.evaluate(testFn)
    t.deepEqual(navPermissions, ['prompt'])
    await context.overridePermissions(server.EMPTY_PAGE, [])
    navPermissions = await page.evaluate(testFn)
    t.deepEqual(navPermissions, ['prompt', 'denied'])
    await context.overridePermissions(server.EMPTY_PAGE, ['geolocation'])
    navPermissions = await page.evaluate(testFn)
    t.deepEqual(navPermissions, ['prompt', 'denied', 'granted'])
    await context.clearPermissionOverrides()
    navPermissions = await page.evaluate(testFn)
    t.deepEqual(navPermissions, ['prompt', 'denied', 'granted', 'prompt'])
  }
)

test.serial(
  'BrowserContext.overridePermissions should isolate permissions between browser contexs',
  async t => {
    const { page, server, context, browser } = t.context
    await page.goto(server.EMPTY_PAGE)
    const otherContext = await browser.createIncognitoBrowserContext()
    const otherPage = await otherContext.newPage()
    await otherPage.goto(server.EMPTY_PAGE)
    t.is(await getPermission(page, 'geolocation'), 'prompt')
    t.is(await getPermission(otherPage, 'geolocation'), 'prompt')
    await context.overridePermissions(server.EMPTY_PAGE, [])
    await otherContext.overridePermissions(server.EMPTY_PAGE, ['geolocation'])
    t.is(await getPermission(page, 'geolocation'), 'denied')
    t.is(await getPermission(otherPage, 'geolocation'), 'granted')
    await context.clearPermissionOverrides()
    t.is(await getPermission(page, 'geolocation'), 'prompt')
    t.is(await getPermission(otherPage, 'geolocation'), 'granted')
    await otherContext.close()
  }
)

test.serial('Page.setGeolocation should work', async t => {
  const { page, server, context } = t.context
  await context.overridePermissions(server.PREFIX, ['geolocation'])
  await page.goto(server.EMPTY_PAGE)
  await page.setGeolocation({
    longitude: 10,
    latitude: 10
  })
  const geolocation = await page.evaluate(
    () =>
      new Promise(resolve =>
        navigator.geolocation.getCurrentPosition(position => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          })
        })
      )
  )
  t.deepEqual(geolocation, {
    latitude: 10,
    longitude: 10
  })
})

test.serial(
  'Page.setGeolocation should throw when invalid longitude',
  async t => {
    const { page, server, context } = t.context
    let error = null

    try {
      await page.setGeolocation({
        longitude: 200,
        latitude: 10
      })
    } catch (e) {
      error = e
    }

    t.true(error.message.includes('Invalid longitude "200"'))
  }
)

test.serial('Page.setOfflineMode should work', async t => {
  const { page, server } = t.context
  await page.setOfflineMode(true)
  let error = null
  await page.goto(server.EMPTY_PAGE).catch(e => (error = e))
  t.truthy(error)
  await page.setOfflineMode(false)
  const response = await page.reload()
  t.true([200, 304].includes(response.status()))
})

test.serial('Page.setOfflineMode should emulate navigator.onLine', async t => {
  const { page, server } = t.context
  t.true(await page.evaluate(() => window.navigator.onLine))
  await page.setOfflineMode(true)
  t.false(await page.evaluate(() => window.navigator.onLine))
  await page.setOfflineMode(false)
  t.true(await page.evaluate(() => window.navigator.onLine))
})

test.serial('ExecutionContext.queryObjects should work', async t => {
  const { page, server } = t.context
  // Instantiate an object
  await page.evaluate(() => (window.set = new Set(['hello', 'world'])))
  const prototypeHandle = await page.evaluateHandle(() => Set.prototype)
  const objectsHandle = await page.queryObjects(prototypeHandle)
  const count = await page.evaluate(objects => objects.length, objectsHandle)
  t.is(count, 1)
  const values = await page.evaluate(
    objects => Array.from(objects[0].values()),
    objectsHandle
  )
  t.deepEqual(values, ['hello', 'world'])
})

test.serial(
  'ExecutionContext.queryObjects should fail for disposed handles',
  async t => {
    const { page, server } = t.context
    const prototypeHandle = await page.evaluateHandle(
      () => HTMLBodyElement.prototype
    )
    await prototypeHandle.dispose()
    let error = null
    await page.queryObjects(prototypeHandle).catch(e => (error = e))
    t.is(error.message, 'Prototype JSHandle is disposed!')
  }
)

test.serial(
  'ExecutionContext.queryObjects should fail primitive values as prototypes',
  async t => {
    const { page, server } = t.context
    const prototypeHandle = await page.evaluateHandle(() => 42)
    let error = null
    await page.queryObjects(prototypeHandle).catch(e => (error = e))
    t.is(
      error.message,
      'Prototype JSHandle must not be referencing primitive value'
    )
  }
)

test.serial('Page.Events.Console should work', async t => {
  const { page, server } = t.context
  let message = null
  page.once(Events.Page.Console, m => (message = m))
  await Promise.all([
    page.evaluate(() =>
      console.log('hello', 5, {
        foo: 'bar'
      })
    ),
    waitEvent(page, 'console')
  ])
  t.deepEqual(message.text(), 'hello 5 JSHandle@object')
  t.deepEqual(message.type(), 'log')
  t.deepEqual(await message.args()[0].jsonValue(), 'hello')
  t.deepEqual(await message.args()[1].jsonValue(), 5)
  t.deepEqual(await message.args()[2].jsonValue(), {
    foo: 'bar'
  })
})

test.serial(
  'Page.Events.Console should work for different console API calls',
  async t => {
    const { page, server } = t.context
    const messages = []
    page.on(Events.Page.Console, msg => messages.push(msg)) // All console events will be reported before `page.evaluate` is finished.

    await page.evaluate(() => {
      // A pair of time/timeEnd generates only one Console API call.
      console.time('calling console.time')
      console.timeEnd('calling console.time')
      console.trace('calling console.trace')
      console.dir('calling console.dir')
      console.warn('calling console.warn')
      console.error('calling console.error')
      console.log(Promise.resolve('should not wait until resolved!'))
    })
    t.deepEqual(messages.map(msg => msg.type()), [
      'timeEnd',
      'trace',
      'dir',
      'warning',
      'error',
      'log'
    ])
    t.true(messages[0].text().includes('calling console.time'))
    t.deepEqual(messages.slice(1).map(msg => msg.text()), [
      'calling console.trace',
      'calling console.dir',
      'calling console.warn',
      'calling console.error',
      'JSHandle@promise'
    ])
  }
)

test.serial(
  'Page.Events.Console should not fail for window object',
  async t => {
    const { page, server } = t.context
    let message = null
    page.once(Events.Page.Console, msg => (message = msg))
    await Promise.all([
      page.evaluate(() => console.error(window)),
      waitEvent(page, Events.Page.Console)
    ])
    t.is(message.text(), 'JSHandle@object')
  }
)

test.serial('Page.Events.LogEntry should trigger correct Log', async t => {
  const { page, server } = t.context
  await page.goto('about:blank')
  const [message] = await Promise.all([
    waitEvent(page, Events.Page.LogEntry),
    page.evaluate(async url => fetch(url).catch(e => {}), server.EMPTY_PAGE)
  ])
  t.true(message.text().includes('Access-Control-Allow-Origin'))
  t.deepEqual(message.type(), 'error')
})

test.serial(
  'Page.Events.LogEntry should have location when fetch fails',
  async t => {
    const { page, server } = t.context
    await page.goto(server.EMPTY_PAGE)
    const [message] = await Promise.all([
      waitEvent(page, Events.Page.LogEntry),
      page.setContent(`<script>fetch('http://wat');</script>`)
    ])
    t.true(message.text().includes(`net::ERR_NAME_RESOLUTION_FAILED`))
    t.deepEqual(message.type(), 'error')
    t.is(message.url(), 'http://wat/')
  }
)

test.serial(
  'Page.Events.Console should have location for console API calls',
  async t => {
    const { page, server } = t.context
    await page.goto(server.EMPTY_PAGE)
    const [message] = await Promise.all([
      waitEvent(page, Events.Page.Console),
      page.goto(server.PREFIX + '/consolelog.html')
    ])
    t.is(message.text(), 'yellow')
    t.is(message.type(), 'log')
    t.deepEqual(message.location(), {
      url: server.PREFIX + '/consolelog.html',
      lineNumber: 7,
      columnNumber: 14 // console.|log vs |console.log
    })
  }
)

test.serial(
  'Page.Events.Console should not throw when there are console messages in detached iframes',
  async t => {
    const { browser, page, server } = t.context
    await page.goto(server.EMPTY_PAGE)
    await page.evaluate(async () => {
      // 1. Create a popup that Puppeteer is not connected to.
      const win = window.open(
        window.location.href,
        'Title',
        'toolbar=no,location=no,directories=no,status=no,menubar=no,scrollbars=yes,resizable=yes,width=780,height=200,top=0,left=0'
      )
      await new Promise(x => (win.onload = x)) // 2. In this popup, create an iframe that console.logs a message.

      win.document.body.innerHTML = `<iframe src='/consolelog.html'></iframe>`
      const frame = win.document.querySelector('iframe')
      await new Promise(x => (frame.onload = x)) // 3. After that, remove the iframe.

      frame.remove()
    })
    const popupTarget = page
      .browserContext()
      .targets()
      .find(target => target !== page.target()) // 4. Connect to the popup and make sure it doesn't throw.

    await popupTarget.page()
    t.pass()
  }
)

test.serial(
  'Page.Events.DOMContentLoaded should fire when expected',
  async t => {
    const { page, server } = t.context
    page.goto('about:blank')
    await waitEvent(page, 'domcontentloaded')
    t.pass()
  }
)

const metricsToCheck = [
  'Timestamp',
  'Documents',
  'Frames',
  'JSEventListeners',
  'Nodes',
  'LayoutCount',
  'RecalcStyleCount',
  'LayoutDuration',
  'RecalcStyleDuration',
  'ScriptDuration',
  'TaskDuration',
  'JSHeapUsedSize',
  'JSHeapTotalSize'
]

test.serial('Page.metrics should get metrics from a page', async t => {
  const { page, server } = t.context
  await page.goto('about:blank')
  const metrics = await page.metrics()
  t.true(metricsToCheck.every(metric => metric in metrics))
})

test.serial(
  'Page.metrics metrics event fired on console.timeStamp',
  async t => {
    const { page, server } = t.context
    const metricsPromise = new Promise(fulfill => page.once('metrics', fulfill))
    await page.evaluate(() => console.timeStamp('test42'))
    const metrics = await metricsPromise
    t.is(metrics.title, 'test42')
    t.true(metricsToCheck.every(metric => metric in metrics.metrics))
  }
)

test.serial('Page.waitForRequest should work', async t => {
  const { page, server } = t.context
  await page.goto(server.EMPTY_PAGE)
  const [request] = await Promise.all([
    page.waitForRequest(server.PREFIX + '/digits/2.png'),
    page.evaluate(() => {
      fetch('/digits/1.png')
      fetch('/digits/2.png')
      fetch('/digits/3.png')
    })
  ])
  t.is(request.url(), server.PREFIX + '/digits/2.png')
})

test.serial('Page.waitForRequest should work with predicate', async t => {
  const { page, server } = t.context
  await page.goto(server.EMPTY_PAGE)
  const [request] = await Promise.all([
    page.waitForRequest(
      request => request.url() === server.PREFIX + '/digits/2.png'
    ),
    page.evaluate(() => {
      fetch('/digits/1.png')
      fetch('/digits/2.png')
      fetch('/digits/3.png')
    })
  ])
  t.is(request.url(), server.PREFIX + '/digits/2.png')
})

test.serial('Page.waitForRequest should respect timeout', async t => {
  const { page, server } = t.context
  let error = null
  await page
    .waitForRequest(() => false, {
      timeout: 1
    })
    .catch(e => (error = e))
  t.true(error instanceof TimeoutError)
})

test.serial('Page.waitForRequest should respect default timeout', async t => {
  const { page, server } = t.context
  let error = null
  page.setDefaultTimeout(1)
  await page.waitForRequest(() => false).catch(e => (error = e))
  t.true(error instanceof TimeoutError)
})

test.serial('Page.waitForRequest should work with no timeout', async t => {
  const { page, server } = t.context
  await page.goto(server.EMPTY_PAGE)
  const [request] = await Promise.all([
    page.waitForRequest(server.PREFIX + '/digits/2.png', {
      timeout: 0
    }),
    page.evaluate(() =>
      setTimeout(() => {
        fetch('/digits/1.png')
        fetch('/digits/2.png')
        fetch('/digits/3.png')
      }, 50)
    )
  ])
  t.is(request.url(), server.PREFIX + '/digits/2.png')
})

test.serial('Page.waitForResponse should work', async t => {
  const { page, server } = t.context
  await page.goto(server.EMPTY_PAGE)
  const [response] = await Promise.all([
    page.waitForResponse(server.PREFIX + '/digits/2.png'),
    page.evaluate(() => {
      fetch('/digits/1.png')
      fetch('/digits/2.png')
      fetch('/digits/3.png')
    })
  ])
  t.is(response.url(), server.PREFIX + '/digits/2.png')
})

test.serial('Page.waitForResponse should respect timeout', async t => {
  const { page, server } = t.context
  let error = null
  await page
    .waitForResponse(() => false, {
      timeout: 1
    })
    .catch(e => (error = e))
  t.true(error instanceof TimeoutError)
})

test.serial('Page.waitForResponse should respect default timeout', async t => {
  const { page, server } = t.context
  let error = null
  page.setDefaultTimeout(1)
  await page.waitForResponse(() => false).catch(e => (error = e))
  t.true(error instanceof TimeoutError)
})

test.serial('Page.waitForResponse should work with predicate', async t => {
  const { page, server } = t.context
  await page.goto(server.EMPTY_PAGE)
  const [response] = await Promise.all([
    page.waitForResponse(
      response => response.url() === server.PREFIX + '/digits/2.png'
    ),
    page.evaluate(() => {
      fetch('/digits/1.png')
      fetch('/digits/2.png')
      fetch('/digits/3.png')
    })
  ])
  t.is(response.url(), server.PREFIX + '/digits/2.png')
})

test.serial('Page.waitForResponse should work with no timeout', async t => {
  const { page, server } = t.context
  await page.goto(server.EMPTY_PAGE)
  const [response] = await Promise.all([
    page.waitForResponse(server.PREFIX + '/digits/2.png', {
      timeout: 0
    }),
    page.evaluate(() =>
      setTimeout(() => {
        fetch('/digits/1.png')
        fetch('/digits/2.png')
        fetch('/digits/3.png')
      }, 50)
    )
  ])
  t.is(response.url(), server.PREFIX + '/digits/2.png')
})

test.serial('Page.exposeFunction should work', async t => {
  const { page, server } = t.context
  await page.exposeFunction('compute', function (a, b) {
    return a * b
  })
  const result = await page.evaluate(async function () {
    return await compute(9, 4)
  })
  t.is(result, 36)
})

test.serial(
  'Page.exposeFunction should throw exception in page context',
  async t => {
    const { page, server } = t.context
    await page.exposeFunction('woof', function () {
      throw new Error('WOOF WOOF')
    })
    const { message, stack } = await page.evaluate(async () => {
      try {
        await woof()
      } catch (e) {
        return {
          message: e.message,
          stack: e.stack
        }
      }
    })
    t.is(message, 'WOOF WOOF')
    t.true(stack.includes(__filename))
  }
)

test.serial('Page.exposeFunction should support throwing "null"', async t => {
  const { page, server } = t.context
  await page.exposeFunction('woof', function () {
    throw null
  })
  const thrown = await page.evaluate(async () => {
    try {
      await woof()
    } catch (e) {
      return e
    }
  })
  t.falsy(thrown)
})

test.serial(
  'Page.exposeFunction should be callable from-inside evaluateOnNewDocument',
  async t => {
    const { page, server } = t.context
    let called = false
    await page.exposeFunction('woof', function () {
      called = true
    })
    await page.evaluateOnNewDocument(() => woof())
    await page.reload()
    t.true(called)
  }
)

test.serial('Page.exposeFunction should survive navigation', async t => {
  const { page, server } = t.context
  await page.exposeFunction('compute', function (a, b) {
    return a * b
  })
  await page.goto(server.EMPTY_PAGE)
  const result = await page.evaluate(async function () {
    return await compute(9, 4)
  })
  t.is(result, 36)
})

test.serial('Page.exposeFunction should await returned promise', async t => {
  const { page, server } = t.context
  await page.exposeFunction('compute', function (a, b) {
    return Promise.resolve(a * b)
  })
  const result = await page.evaluate(async function () {
    return await compute(3, 5)
  })
  t.is(result, 15)
})

test.serial('Page.exposeFunction should work on frames', async t => {
  const { page, server } = t.context
  await page.exposeFunction('compute', function (a, b) {
    return Promise.resolve(a * b)
  })
  await page.goto(server.PREFIX + '/frames/nested-frames.html')
  const frame = page.frames()[1]
  const result = await frame.evaluate(async function () {
    return await compute(3, 5)
  })
  t.is(result, 15)
})

test.serial(
  'Page.exposeFunction should work on frames before navigation',
  async t => {
    const { page, server } = t.context
    await page.goto(server.PREFIX + '/frames/nested-frames.html')
    await page.exposeFunction('compute', function (a, b) {
      return Promise.resolve(a * b)
    })
    const frame = page.frames()[1]
    const result = await frame.evaluate(async function () {
      return await compute(3, 5)
    })
    t.is(result, 15)
  }
)

test.serial('Page.Events.PageError should fire', async t => {
  const { page, server } = t.context
  let error = null
  page.once('pageerror', e => (error = e))
  await Promise.all([
    page.goto(server.PREFIX + '/error.html'),
    waitEvent(page, 'pageerror')
  ])
  t.true(error.message.includes('Fancy'))
})

test.serial('Page.setUserAgent should work', async t => {
  const { page, server } = t.context
  t.true((await page.evaluate(() => navigator.userAgent)).includes('Mozilla'))
  await page.setUserAgent('foobar')
  const [request] = await Promise.all([
    server.waitForRequest('/empty.html'),
    page.goto(server.EMPTY_PAGE)
  ])
  t.is(request.headers['user-agent'], 'foobar')
})

test.serial('Page.setUserAgent should work for subframes', async t => {
  const { page, server } = t.context
  t.true((await page.evaluate(() => navigator.userAgent)).includes('Mozilla'))
  await page.setUserAgent('foobar')
  const [request] = await Promise.all([
    server.waitForRequest('/empty.html'),
    utils.attachFrame(page, 'frame1', server.EMPTY_PAGE)
  ])
  t.is(request.headers['user-agent'], 'foobar')
})

test.serial('Page.setUserAgent should emulate device user-agent', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/mobile.html')
  t.false((await page.evaluate(() => navigator.userAgent)).includes('iPhone'))
  await page.setUserAgent(iPhone.userAgent)
  t.true((await page.evaluate(() => navigator.userAgent)).includes('iPhone'))
})

test.serial('Page.setContent should work', async t => {
  const { page, server } = t.context
  await page.setContent('<div>hello</div>')
  const result = await page.content()
  t.is(result, _expectedOutput)
})

test.serial('Page.setContent should work with doctype', async t => {
  const { page, server } = t.context
  const doctype = '<!DOCTYPE html>'
  await page.setContent(`${doctype}<div>hello</div>`)
  const result = await page.content()
  t.is(result, `${doctype}${_expectedOutput}`)
})

test.serial('Page.setContent should work with HTML 4 doctype', async t => {
  const { page, server } = t.context
  const doctype =
    '<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01//EN" ' +
    '"http://www.w3.org/TR/html4/strict.dtd">'
  await page.setContent(`${doctype}<div>hello</div>`)
  const result = await page.content()
  t.is(result, `${doctype}${_expectedOutput}`)
})

test.serial('Page.setContent should respect timeout', async t => {
  const { page, server } = t.context
  const imgPath = '/neverImage.png' // stall for image
  let error = null
  await page
    .setContent(`<img src="${server.PREFIX + imgPath}"></img>`, {
      timeout: 1
    })
    .catch(e => (error = e))
  t.true(error instanceof TimeoutError)
})

test.serial(
  'Page.setContent should respect default navigation timeout',
  async t => {
    const { page, server } = t.context
    page.setDefaultNavigationTimeout(1)
    const imgPath = '/neverImage.png' // stall for image
    let error = null
    await page
      .setContent(`<img src="${server.PREFIX + imgPath}"></img>`)
      .catch(e => (error = e))
    t.true(error instanceof TimeoutError)
  }
)

test.serial('Page.setContent should await resources to load', async t => {
  const { page, server } = t.context
  const imgPath = '/longTimeImage.png'
  let loaded = false
  const contentPromise = page
    .setContent(`<img src="${server.PREFIX + imgPath}"></img>`)
    .then(() => (loaded = true))
  await server.waitForRequest(imgPath)
  t.false(loaded)
  await contentPromise
})

test.serial('Page.setContent should work fast enough', async t => {
  const { page, server } = t.context

  for (let i = 0; i < 20; ++i) await page.setContent('<div>yo</div>')

  t.pass()
})

test.serial('Page.setBypassCSP should bypass CSP meta tag', async t => {
  const { page, server } = t.context
  // Make sure CSP prohibits addScriptTag.
  await page.goto(server.PREFIX + '/csp.html')
  await page
    .addScriptTag({
      content: 'window.__injected = 42;'
    })
    .catch(e => void e)
  t.falsy(await page.evaluate(() => window.__injected)) // By-pass CSP and try one more time.

  await page.setBypassCSP(true)
  await page.reload()
  await page.addScriptTag({
    content: 'window.__injected = 42;'
  })
  t.is(await page.evaluate(() => window.__injected), 42)
})

test.serial('Page.setBypassCSP should bypass CSP header', async t => {
  const { page, server } = t.context
  // Make sure CSP prohibits addScriptTag.
  await page.goto(server.EMPTY_CSP_SELF)
  await page
    .addScriptTag({
      content: 'window.__injected = 42;'
    })
    .catch(e => void e)
  t.falsy(await page.evaluate(() => window.__injected)) // By-pass CSP and try one more time.

  await page.setBypassCSP(true)
  await page.reload()
  await page.addScriptTag({
    content: 'window.__injected = 42;'
  })
  t.is(await page.evaluate(() => window.__injected), 42)
})

test.serial(
  'Page.setBypassCSP should bypass after cross-process navigation',
  async t => {
    const { page, server } = t.context
    await page.setBypassCSP(true)
    await page.goto(server.PREFIX + '/csp.html')
    await page.addScriptTag({
      content: 'window.__injected = 42;'
    })
    t.is(await page.evaluate(() => window.__injected), 42)
    await page.goto(server.CROSS_PROCESS_PREFIX + '/csp.html')
    await page.addScriptTag({
      content: 'window.__injected = 42;'
    })
    t.is(await page.evaluate(() => window.__injected), 42)
  }
)

test.serial(
  'Page.addScriptTag should throw an error if no options are provided',
  async t => {
    const { page, server } = t.context
    let error = null

    try {
      await page.addScriptTag('/injectedfile.js')
    } catch (e) {
      error = e
    }

    t.is(
      error.message,
      'Provide an object with a `url`, `path` or `content` property'
    )
  }
)

test.serial('Page.addScriptTag should work with a url', async t => {
  const { page, server } = t.context
  await page.goto(server.EMPTY_PAGE)
  const scriptHandle = await page.addScriptTag({
    url: '/injectedfile.js'
  })
  t.truthy(scriptHandle.asElement())
  t.is(await page.evaluate(() => __injected), 42)
})

test.serial(
  'Page.addScriptTag should work with a url and type=module',
  async t => {
    const { page, server } = t.context
    await page.goto(server.EMPTY_PAGE)
    await page.addScriptTag({
      url: '/es6/es6import.js',
      type: 'module'
    })
    t.is(await page.evaluate(() => __es6injected), 42)
  }
)

test.serial(
  'Page.addScriptTag should work with a path and type=module',
  async t => {
    const { page, server } = t.context
    await page.goto(server.EMPTY_PAGE)
    await page.addScriptTag({
      path: utils.assetPath('/es6/es6pathimport.js'),
      type: 'module'
    })
    await page.waitForFunction('window.__es6injected')
    t.is(await page.evaluate(() => __es6injected), 42)
  }
)

test.serial(
  'Page.addScriptTag should work with a content and type=module',
  async t => {
    const { page, server } = t.context
    await page.goto(server.EMPTY_PAGE)
    await page.addScriptTag({
      content: `import num from '/es6/es6module.js';window.__es6injected = num;`,
      type: 'module'
    })
    await page.waitForFunction('window.__es6injected')
    t.is(await page.evaluate(() => __es6injected), 42)
  }
)

test.serial(
  'Page.addScriptTag should throw an error if loading from url fail',
  async t => {
    const { page, server } = t.context
    await page.goto(server.EMPTY_PAGE)
    let error = null

    try {
      await page.addScriptTag({
        url: '/nonexistfile.js'
      })
    } catch (e) {
      error = e
    }

    t.is(error.message, 'Loading script from /nonexistfile.js failed')
  }
)

test.serial('Page.addScriptTag should work with a path', async t => {
  const { page, server } = t.context
  await page.goto(server.EMPTY_PAGE)
  const scriptHandle = await page.addScriptTag({
    path: utils.assetPath('injectedfile.js')
  })
  t.truthy(scriptHandle.asElement())
  t.is(await page.evaluate(() => __injected), 42)
})

test.serial(
  'Page.addScriptTag should include sourcemap when path is provided',
  async t => {
    const { page, server } = t.context
    await page.goto(server.EMPTY_PAGE)
    await page.addScriptTag({
      path: utils.assetPath('injectedfile.js')
    })
    const result = await page.evaluate(() => __injectedError.stack)
    t.true(result.includes(utils.assetPath('injectedfile.js')))
  }
)

test.serial('Page.addScriptTag should work with content', async t => {
  const { page, server } = t.context
  await page.goto(server.EMPTY_PAGE)
  const scriptHandle = await page.addScriptTag({
    content: 'window.__injected = 35;'
  })
  t.truthy(scriptHandle.asElement())
  t.is(await page.evaluate(() => __injected), 35)
})

test.serial(
  'Page.addScriptTag should throw when added with content to the CSP page',
  async t => {
    const { page, server } = t.context
    await page.goto(server.PREFIX + '/csp.html')
    let error = null
    await page
      .addScriptTag({
        content: 'window.__injected = 35;'
      })
      .catch(e => (error = e))
    t.truthy(error)
  }
)

test.serial(
  'Page.addScriptTag should throw when added with URL to the CSP page',
  async t => {
    const { page, server } = t.context
    await page.goto(server.PREFIX + '/csp.html')
    let error = null
    await page
      .addScriptTag({
        url: server.CROSS_PROCESS_PREFIX + '/injectedfile.js'
      })
      .catch(e => (error = e))
    t.truthy(error)
  }
)

test.serial(
  'Page.addStyleTag should throw an error if no options are provided',
  async t => {
    const { page, server } = t.context
    let error = null

    try {
      await page.addStyleTag('/injectedstyle.css')
    } catch (e) {
      error = e
    }

    t.is(
      error.message,
      'Provide an object with a `url`, `path` or `content` property'
    )
  }
)

test.serial('Page.addStyleTag should work with a url', async t => {
  const { page, server } = t.context
  await page.goto(server.EMPTY_PAGE)
  const styleHandle = await page.addStyleTag({
    url: '/injectedstyle.css'
  })
  t.truthy(styleHandle.asElement())
  t.is(
    await page.evaluate(
      `window.getComputedStyle(document.querySelector('body')).getPropertyValue('background-color')`
    ),
    'rgb(255, 0, 0)'
  )
})

test.serial(
  'Page.addStyleTag should throw an error if loading from url fail',
  async t => {
    const { page, server } = t.context
    await page.goto(server.EMPTY_PAGE)
    let error = null

    try {
      await page.addStyleTag({
        url: '/nonexistfile.js'
      })
    } catch (e) {
      error = e
    }

    t.is(error.message, 'Loading style from /nonexistfile.js failed')
  }
)

test.serial('Page.addStyleTag should work with a path', async t => {
  const { page, server } = t.context
  await page.goto(server.EMPTY_PAGE)
  const styleHandle = await page.addStyleTag({
    path: utils.assetPath('injectedstyle.css')
  })
  t.truthy(styleHandle.asElement())
  t.is(
    await page.evaluate(
      `window.getComputedStyle(document.querySelector('body')).getPropertyValue('background-color')`
    ),
    'rgb(255, 0, 0)'
  )
})

test.serial(
  'Page.addStyleTag should include sourcemap when path is provided',
  async t => {
    const { page, server } = t.context
    await page.goto(server.EMPTY_PAGE)
    await page.addStyleTag({
      path: utils.assetPath('injectedstyle.css')
    })
    const styleHandle = await page.$('style')
    const styleContent = await page.evaluate(
      style => style.innerHTML,
      styleHandle
    )
    t.true(styleContent.includes(utils.assetPath('injectedstyle.css')))
  }
)

test.serial('Page.addStyleTag should work with content', async t => {
  const { page, server } = t.context
  await page.goto(server.EMPTY_PAGE)
  const styleHandle = await page.addStyleTag({
    content: 'body { background-color: green; }'
  })
  t.truthy(styleHandle.asElement())
  t.is(
    await page.evaluate(
      `window.getComputedStyle(document.querySelector('body')).getPropertyValue('background-color')`
    ),
    'rgb(0, 128, 0)'
  )
})

test.serial(
  'Page.addStyleTag should throw when added with content to the CSP page',
  async t => {
    const { page, server } = t.context
    await page.goto(server.PREFIX + '/csp.html')
    let error = null
    await page
      .addStyleTag({
        content: 'body { background-color: green; }'
      })
      .catch(e => (error = e))
    t.truthy(error)
  }
)

test.serial(
  'Page.addStyleTag should throw when added with URL to the CSP page',
  async t => {
    const { page, server } = t.context
    await page.goto(server.PREFIX + '/csp.html')
    let error = null
    await page
      .addStyleTag({
        url: server.CROSS_PROCESS_PREFIX + '/injectedstyle.css'
      })
      .catch(e => (error = e))
    t.truthy(error)
  }
)

test.serial('Page.url should work', async t => {
  const { page, server } = t.context
  t.is(page.url(), 'about:blank')
  await page.goto(server.EMPTY_PAGE)
  t.is(page.url(), server.EMPTY_PAGE)
})

test.serial('Page.setJavaScriptEnabled should work', async t => {
  const { page, server } = t.context
  await page.setJavaScriptEnabled(false)
  await page.goto(
    'data:text/html, <script>var something = "forbidden"</script>'
  )
  let error = null
  await page.evaluate('something').catch(e => (error = e))
  t.true(error.message.includes('something is not defined'))
  await page.setJavaScriptEnabled(true)
  await page.goto(
    'data:text/html, <script>var something = "forbidden"</script>'
  )
  t.is(await page.evaluate('something'), 'forbidden')
})

test.serial(
  'Page.setCacheEnabled should enable or disable the cache based on the state passed',
  async t => {
    const { page, server } = t.context
    await page.goto(server.PREFIX + '/cached/one-style.html')
    const [cachedRequest] = await Promise.all([
      page.waitForRequest(req => req.url().includes('/cached/one-style.html')),
      page.reload()
    ])
    t.false(cachedRequest.fromMemoryCache())
    await page.setCacheEnabled(false)
    const [nonCachedRequest] = await Promise.all([
      page.waitForRequest(req => req.url().includes('/cached/one-style.html')),
      page.reload()
    ])
    t.false(nonCachedRequest.fromMemoryCache())
  }
)

test.serial('Page.title should return the page title', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/title.html')
  t.is(await page.title(), 'Woof-Woof')
})

test.serial('Page.select should select single option', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/input/select.html')
  await page.select('select', 'blue')
  t.deepEqual(await page.evaluate(() => result.onInput), ['blue'])
  t.deepEqual(await page.evaluate(() => result.onChange), ['blue'])
})

test.serial('Page.select should select only first option', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/input/select.html')
  await page.select('select', 'blue', 'green', 'red')
  t.deepEqual(await page.evaluate(() => result.onInput), ['blue'])
  t.deepEqual(await page.evaluate(() => result.onChange), ['blue'])
})

test.serial('Page.select should select multiple options', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/input/select.html')
  await page.evaluate(() => makeMultiple())
  await page.select('select', 'blue', 'green', 'red')
  t.deepEqual(await page.evaluate(() => result.onInput), [
    'blue',
    'green',
    'red'
  ])
  t.deepEqual(await page.evaluate(() => result.onChange), [
    'blue',
    'green',
    'red'
  ])
})

test.serial('Page.select should respect event bubbling', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/input/select.html')
  await page.select('select', 'blue')
  t.deepEqual(await page.evaluate(() => result.onBubblingInput), ['blue'])
  t.deepEqual(await page.evaluate(() => result.onBubblingChange), ['blue'])
})

test.serial(
  'Page.select should throw when element is not a <select>',
  async t => {
    const { page, server } = t.context
    let error = null
    await page.goto(server.PREFIX + '/input/select.html')
    await page.select('body', '').catch(e => (error = e))
    t.true(error.message.includes('Element is not a <select> element.'))
  }
)

test.serial('Page.select should return [] on no matched values', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/input/select.html')
  const result = await page.select('select', '42', 'abc')
  t.deepEqual(result, [])
})

test.serial('Page.select should return an array of matched values', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/input/select.html')
  await page.evaluate(() => makeMultiple())
  const result = await page.select('select', 'blue', 'black', 'magenta')
  t.deepEqual(
    result.reduce(
      (accumulator, current) =>
        ['blue', 'black', 'magenta'].includes(current) && accumulator,
      true
    ),
    true
  )
})

test.serial(
  'Page.select should return an array of one element when multiple is not set',
  async t => {
    const { page, server } = t.context
    await page.goto(server.PREFIX + '/input/select.html')
    const result = await page.select('select', '42', 'blue', 'black', 'magenta')
    t.deepEqual(result.length, 1)
  }
)

test.serial('Page.select should return [] on no values', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/input/select.html')
  const result = await page.select('select')
  t.deepEqual(result, [])
})

test.serial(
  'Page.select should deselect all options when passed no values for a multiple select',
  async t => {
    const { page, server } = t.context
    await page.goto(server.PREFIX + '/input/select.html')
    await page.evaluate(() => makeMultiple())
    await page.select('select', 'blue', 'black', 'magenta')
    await page.select('select')
    t.deepEqual(
      await page.$eval('select', select =>
        Array.from(select.options).every(option => !option.selected)
      ),
      true
    )
  }
)

test.serial(
  'Page.select should deselect all options when passed no values for a select without multiple',
  async t => {
    const { page, server } = t.context
    await page.goto(server.PREFIX + '/input/select.html')
    await page.select('select', 'blue', 'black', 'magenta')
    await page.select('select')
    t.deepEqual(
      await page.$eval('select', select =>
        Array.from(select.options).every(option => !option.selected)
      ),
      true
    )
  }
)

test.serial('Page.select should throw if passed in non-strings', async t => {
  const { page, server } = t.context
  await page.setContent('<select><option value="12"/></select>')
  let error = null

  try {
    await page.select('select', 12)
  } catch (e) {
    error = e
  }

  t.true(error.message.includes('Values must be strings'))
})

test.serial(
  'Page.select should work when re-defining top-level Event class',
  async t => {
    const { page, server } = t.context
    await page.goto(server.PREFIX + '/input/select.html')
    await page.evaluate(() => (window.Event = null))
    await page.select('select', 'blue')
    t.deepEqual(await page.evaluate(() => result.onInput), ['blue'])
    t.deepEqual(await page.evaluate(() => result.onChange), ['blue'])
  }
)

test.serial('Page.Events.Close should work with window.close', async t => {
  const { page, context, server } = t.context
  const newPagePromise = new Promise(fulfill =>
    context.once('targetcreated', target => fulfill(target.page()))
  )
  await page.evaluate(() => (window['newPage'] = window.open('about:blank')))
  const newPage = await newPagePromise
  const closedPromise = new Promise(x => newPage.on('close', x))
  await page.evaluate(() => window['newPage'].close())
  await closedPromise
  t.pass()
})

test.serial('Page.Events.Close should work with page.close', async t => {
  const { page, context, server } = t.context
  const newPage = await context.newPage()
  const closedPromise = new Promise(x => newPage.on('close', x))
  await newPage.close()
  await closedPromise
  t.pass()
})

test.serial(
  'Page.browser should return the correct browser instance',
  async t => {
    const { page, browser } = t.context
    t.is(page.browser(), browser)
  }
)

test.serial(
  'Page.browserContext should return the correct browser instance',
  async t => {
    const { page, context, browser } = t.context
    t.is(page.browserContext(), context)
  }
)
