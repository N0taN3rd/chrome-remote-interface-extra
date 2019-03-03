import test from 'ava'
import * as utils from './helpers/utils'
import TestHelper from './helpers/testHelper'
import { TimeoutError } from '../lib/Errors'

/** @type {TestHelper} */
let helper

test.before(async t => {
  helper = await TestHelper.withHTTPAndHTTPS(t)
})

test.serial.beforeEach(async t => {
  /** @type {Page} */
  t.context.page = await helper.newPage()
  t.context.server = helper.server()
  t.context.httpsServer = helper.httpsServer()
  t.context.context = await helper.context()
})

test.serial.afterEach.always(async t => {
  await helper.cleanup()
})

test.after.always(async t => {
  await helper.end()
})

test.serial('Page.goBack should work', async t => {
  const { page, server } = t.context
  await page.goto(server.EMPTY_PAGE)
  await page.goto(server.PREFIX + '/grid.html')
  let response = await page.goBack()
  t.true(response.ok())
  t.true(response.url().includes(server.EMPTY_PAGE))
  response = await page.goForward()
  t.true(response.ok())
  t.true(response.url().includes('/grid.html'))
  response = await page.goForward()
  t.is(response, null)
})

test.serial('Page.goBack should work with HistoryAPI', async t => {
  const { page, server } = t.context
  await page.goto(server.EMPTY_PAGE)
  await page.evaluate(() => {
    history.pushState({}, '', '/first.html')
    history.pushState({}, '', '/second.html')
  })
  t.is(page.url(), server.PREFIX + '/second.html')
  await page.goBack()
  t.is(page.url(), server.PREFIX + '/first.html')
  await page.goBack()
  t.is(page.url(), server.EMPTY_PAGE)
  await page.goForward()
  t.is(page.url(), server.PREFIX + '/first.html')
})

test.serial('Page.goto should work', async t => {
  const { page, server } = t.context
  await page.goto(server.EMPTY_PAGE)
  t.is(page.url(), server.EMPTY_PAGE)
})

test.serial('Page.goto should work with anchor navigation', async t => {
  const { page, server } = t.context
  await page.goto(server.EMPTY_PAGE)
  t.is(page.url(), server.EMPTY_PAGE)
  await page.goto(server.EMPTY_PAGE + '#foo')
  t.is(page.url(), server.EMPTY_PAGE + '#foo')
  await page.goto(server.EMPTY_PAGE + '#bar')
  t.is(page.url(), server.EMPTY_PAGE + '#bar')
})

test.serial('Page.goto should work with redirects', async t => {
  const { page, server } = t.context
  server.setRedirect('/redirect/1.html', '/redirect/2.html')
  server.setRedirect('/redirect/2.html', '/empty.html')
  await page.goto(server.PREFIX + '/redirect/1.html')
  t.is(page.url(), server.EMPTY_PAGE)
})

test.serial('Page.goto should navigate to about:blank', async t => {
  const { page, server } = t.context
  const response = await page.goto('about:blank')
  t.is(response, null)
})

test.serial(
  'Page.goto should return response when page changes its URL after load',
  async t => {
    const { page, server } = t.context
    const response = await page.goto(server.PREFIX + '/historyapi.html')
    t.is(response.status(), 200)
  }
)

test.serial('Page.goto should work with subframes return 204', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/frames/subFrameNoContent.html')
  t.pass()
})

test.serial(
  'Page.goto should navigate to empty page with domcontentloaded',
  async t => {
    const { page, server } = t.context
    const response = await page.goto(server.EMPTY_PAGE, {
      waitUntil: 'domcontentloaded'
    })
    t.is(response.status(), 200)
  }
)

test.serial(
  'Page.goto should work when page calls history API in beforeunload',
  async t => {
    const { page, server } = t.context
    await page.goto(server.EMPTY_PAGE)
    await page.evaluate(() => {
      window.addEventListener(
        'beforeunload',
        () => history.replaceState(null, 'initial', window.location.href),
        false
      )
    })
    const response = await page.goto(server.PREFIX + '/grid.html')
    t.is(response.status(), 200)
  }
)

test.serial(
  'Page.goto should navigate to empty page with networkidle0',
  async t => {
    const { page, server } = t.context
    const response = await page.goto(server.EMPTY_PAGE, {
      waitUntil: 'networkidle0'
    })
    t.is(response.status(), 200)
  }
)

test.serial(
  'Page.goto should navigate to empty page with networkidle2',
  async t => {
    const { page, server } = t.context
    const response = await page.goto(server.EMPTY_PAGE, {
      waitUntil: 'networkidle2'
    })
    t.is(response.status(), 200)
  }
)

test.serial('Page.goto should fail when navigating to bad url', async t => {
  const { page, server } = t.context
  let error = null
  await page.goto('asdfasdf').catch(e => (error = e))
  if (true) t.true(error.message.includes('Cannot navigate to invalid URL'))
  else t.true(error.message.includes('Invalid url'))
})

test.serial('Page.goto should fail when navigating to bad SSL', async t => {
  const { page, httpsServer } = t.context
  // Make sure that network events do not emit 'undefined'.
  // @see https://crbug.com/750469
  page.on('request', request => t.truthy(request))
  page.on('requestfinished', request => t.truthy(request))
  page.on('requestfailed', request => t.truthy(request))
  let error = null
  await page.goto(httpsServer.EMPTY_PAGE).catch(e => (error = e))
  t.truthy(error)
})

test.serial(
  'Page.goto should fail when navigating to bad SSL after redirects',
  async t => {
    const { page, server, httpsServer } = t.context
    server.setRedirect('/redirect/1.html', '/redirect/2.html')
    server.setRedirect('/redirect/2.html', '/empty.html')
    let error = null
    await page
      .goto(httpsServer.PREFIX + '/redirect/1.html')
      .catch(e => (error = e))
    t.truthy(error)
  }
)

test.serial(
  'Page.goto should fail when main resources failed to load',
  async t => {
    const { page, server } = t.context
    let error = null
    await page
      .goto('http://localhost:44123/non-existing-url')
      .catch(e => (error = e))
    t.truthy(error)
  }
)

test.serial(
  'Page.goto should fail when exceeding maximum navigation timeout',
  async t => {
    const { page, server } = t.context
    // Hang for request to the empty.html
    let error = null
    await page
      .goto(server.PREFIX + '/longTimeJack', {
        timeout: 1
      })
      .catch(e => (error = e))
    t.true(error.message.includes('Navigation Timeout Exceeded: 1ms'))
    t.true(error instanceof TimeoutError)
  }
)

test.serial(
  'Page.goto should fail when exceeding default maximum navigation timeout',
  async t => {
    const { page, server } = t.context
    // Hang for request to the empty.html
    let error = null
    page.setDefaultNavigationTimeout(1)
    await page.goto(server.PREFIX + '/longTimeJack').catch(e => (error = e))
    t.true(error.message.includes('Navigation Timeout Exceeded: 1ms'))
    t.true(error instanceof TimeoutError)
  }
)

test.serial(
  'Page.goto should fail when exceeding default maximum timeout',
  async t => {
    const { page, server } = t.context
    // Hang for request to the empty.html
    let error = null
    page.setDefaultTimeout(1)
    await page.goto(server.PREFIX + '/longTimeJack').catch(e => (error = e))
    t.true(error.message.includes('Navigation Timeout Exceeded: 1ms'))
    t.true(error instanceof TimeoutError)
  }
)

test.serial(
  'Page.goto should prioritize default navigation timeout over default timeout',
  async t => {
    const { page, server } = t.context
    // Hang for request to the empty.html
    let error = null
    page.setDefaultTimeout(0)
    page.setDefaultNavigationTimeout(1)
    await page.goto(server.PREFIX + '/longTimeJack').catch(e => (error = e))
    t.true(error.message.includes('Navigation Timeout Exceeded: 1ms'))
    t.true(error instanceof TimeoutError)
  }
)

test.serial('Page.goto should disable timeout when its set to 0', async t => {
  const { page, server } = t.context
  let error = null
  let loaded = false
  page.once('load', () => (loaded = true))
  await page
    .goto(server.PREFIX + '/grid.html', {
      timeout: 0,
      waitUntil: ['load']
    })
    .catch(e => (error = e))
  t.is(error, null)
  t.true(loaded)
})

test.serial('Page.goto should work when navigating to valid url', async t => {
  const { page, server } = t.context
  const response = await page.goto(server.EMPTY_PAGE)
  t.true(response.ok())
})

test.serial('Page.goto should work when navigating to data url', async t => {
  const { page, server } = t.context
  const response = await page.goto('data:text/html,hello')
  t.true(response.ok())
})

test.serial('Page.goto should work when navigating to 404', async t => {
  const { page, server } = t.context
  const response = await page.goto(server.PREFIX + '/not-found')
  t.false(response.ok())
  t.is(response.status(), 404)
})

test.serial(
  'Page.goto should return last response in redirect chain',
  async t => {
    const { page, server } = t.context
    server.setRedirect('/redirect/1.html', '/redirect/2.html')
    server.setRedirect('/redirect/2.html', '/redirect/3.html')
    server.setRedirect('/redirect/3.html', server.EMPTY_PAGE)
    const response = await page.goto(server.PREFIX + '/redirect/1.html')
    t.true(response.ok())
    t.is(response.url(), server.EMPTY_PAGE)
  }
)

test.serial(
  'Page.goto should wait for network idle to succeed navigation',
  async t => {
    const { page, server } = t.context

    await page.goto(server.PREFIX + '/networkidle.html', {
      waitUntil: 'networkidle0'
    }) // Track when the navigation gets completed.

    t.deepEqual(await page.evaluate(() => window.fun), [
      { n: '1' },
      { n: '2' },
      { n: '3' },
      { n: '4' }
    ])
  }
)

test.serial(
  'Page.goto should not leak listeners during navigation',
  async t => {
    const { page, server } = t.context
    let warning = null

    const warningHandler = w => (warning = w)

    process.on('warning', warningHandler)

    for (let i = 0; i < 20; ++i) await page.goto(server.EMPTY_PAGE)

    process.removeListener('warning', warningHandler)
    t.is(warning, null)
  }
)

test.serial(
  'Page.goto should not leak listeners during bad navigation',
  async t => {
    const { page, server } = t.context
    let warning = null

    const warningHandler = w => (warning = w)

    process.on('warning', warningHandler)

    for (let i = 0; i < 20; ++i)
      await page.goto('asdf').catch(e => {
        /* swallow navigation error */
      })

    process.removeListener('warning', warningHandler)
    t.is(warning, null)
  }
)

test.serial(
  'Page.goto should not leak listeners during navigation of 11 pages',
  async t => {
    const { page, context, server } = t.context
    let warning = null

    const warningHandler = w => (warning = w)

    process.on('warning', warningHandler)
    await Promise.all(
      [...Array(20)].map(async () => {
        const page = await context.newPage()
        await page.goto(server.EMPTY_PAGE)
        await page.close()
      })
    )
    process.removeListener('warning', warningHandler)
    t.is(warning, null)
  }
)

test.serial(
  'Page.goto should navigate to dataURL and fire dataURL requests',
  async t => {
    const { page, server } = t.context
    const requests = []
    page.on(
      'request',
      request => !utils.isFavicon(request) && requests.push(request)
    )
    const dataURL = 'data:text/html,<div>yo</div>'
    const response = await page.goto(dataURL)
    t.is(response.status(), 200)
    t.is(requests.length, 1)
    t.is(requests[0].url(), dataURL)
  }
)

test.serial(
  'Page.goto should fail when navigating and show the url at the error message',
  async t => {
    const { page, server, httpsServer } = t.context
    const url = httpsServer.PREFIX + '/infinite-redir'
    let error = null

    try {
      await page.goto(url)
    } catch (e) {
      error = e
    }

    t.true(error.message.includes(url))
  }
)

test.serial('Page.reload should work', async t => {
  const { page, server } = t.context
  await page.goto(server.EMPTY_PAGE)
  await page.evaluate(() => (window._foo = 10))
  await page.reload()
  t.is(await page.evaluate(() => window._foo), undefined)
})

test.serial('Page.goto should work with self requesting page', async t => {
  const { page, server } = t.context
  const response = await page.goto(server.PREFIX + '/self-request.html')
  t.is(response.status(), 200)
  t.true(response.url().includes('self-request.html'))
})

test.serial(
  'Page.goto should navigate to URL with hash and fire requests with hash',
  async t => {
    const { page, server } = t.context
    const requests = []
    page.on(
      'request',
      request => !utils.isFavicon(request) && requests.push(request)
    )
    const response = await page.goto(server.EMPTY_PAGE + '#hash')
    t.is(response.status(), 200)
    t.is(response.url(), server.EMPTY_PAGE)
    t.is(requests.length, 1)
    t.is(requests[0].url(), server.EMPTY_PAGE + '#hash')
  }
)

test.serial('Page.goto should fail when server returns 204', async t => {
  const { page, server } = t.context
  let error = null
  await page.goto(server.PREFIX + '/endlessVoid').catch(e => (error = e))
  t.true(error != null)
})

test.serial('Frame.goto should navigate subframes', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/frames/one-frame.html')
  t.true(
    page
      .frames()[0]
      .url()
      .includes('/frames/one-frame.html')
  )
  t.true(
    page
      .frames()[1]
      .url()
      .includes('/frames/frame.html')
  )
  const response = await page.frames()[1].goto(server.EMPTY_PAGE)
  t.true(response.ok())
  t.is(response.frame(), page.frames()[1])
})

test.serial('Frame.waitForNavigation should work', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/frames/nested-frames.html')
  const frame = page.frames()[1]
  const [response] = await Promise.all([
    frame.waitForNavigation(),
    frame.evaluate(
      url => (window.location.href = url),
      server.PREFIX + '/grid.html'
    )
  ])
  t.true(response.ok())
  t.true(response.url().includes('grid.html'))
  t.is(response.frame(), frame)
  t.true(page.url().includes('/frames/one-frame.html'))
})

test.serial(
  'Frame.waitForNavigation should resolve when frame detaches',
  async t => {
    const { page, server } = t.context
    await page.goto(server.PREFIX + '/frames/nested-frames.html')
    const frame = page.frames()[1]
    const navigationPromise = frame.waitForNavigation()
    await Promise.all([
      server.waitForRequest('/longTimeJack'),
      frame.evaluate(() => (window.location = '/longTimeJack'))
    ])
    await page.$eval('iframe', frame => frame.remove())
    await navigationPromise
    t.pass()
  }
)

test.serial('Frame.goto should reject when frame detaches', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/frames/nested-frames.html')
  const frames = page.frames()
  t.log(frames.length)
  t.true(frames.length > 0)
  const navigationPromise = frames[1]
    .goto(server.PREFIX + '/longTimeJack')
    .catch(e => e)
  await new Promise(resolve => setTimeout(resolve, 1000))
  // await server.waitForRequest('/longTimeJack')
  await page.$eval('iframe', frame => frame.remove())
  const error = await navigationPromise
  t.is(error.message, 'Navigating frame was detached')
})

test.serial('Page.waitForNavigation should work', async t => {
  const { page, server } = t.context
  await page.goto(server.EMPTY_PAGE)
  const [response] = await Promise.all([
    page.waitForNavigation(),
    page.evaluate(
      url => (window.location.href = url),
      server.PREFIX + '/grid.html'
    )
  ])
  t.true(response.ok())
  t.true(response.url().includes('grid.html'))
})

test.serial(
  'Page.waitForNavigation should work with both domcontentloaded and load',
  async t => {
    const { page, server } = t.context
    const navigationPromise = page.goto(server.PREFIX + '/one-style.html')
    const domContentLoadedPromise = page.waitForNavigation({
      waitUntil: 'domcontentloaded'
    })
    let bothFired = false
    const bothFiredPromise = page
      .waitForNavigation({
        waitUntil: ['load', 'domcontentloaded']
      })
      .then(() => (bothFired = true))
    await server.waitForRequest('/one-style.css')
    await domContentLoadedPromise
    t.false(bothFired)
    await bothFiredPromise
    await navigationPromise
  }
)

test.serial(
  'Page.waitForNavigation should work with clicking on anchor links',
  async t => {
    const { page, server } = t.context
    await page.goto(server.EMPTY_PAGE)
    await page.setContent(`<a href='#foobar'>foobar</a>`)
    const [response] = await Promise.all([
      page.waitForNavigation(),
      page.click('a')
    ])
    t.is(response, null)
    t.is(page.url(), server.EMPTY_PAGE + '#foobar')
  }
)

test.serial(
  'Page.waitForNavigation should work with history.pushState()',
  async t => {
    const { page, server } = t.context
    await page.goto(server.EMPTY_PAGE)
    await page.setContent(`
        <a onclick='javascript:pushState()'>SPA</a>
        <script>
          function pushState() { history.pushState({}, '', 'wow.html') }
        </script>
      `)
    const [response] = await Promise.all([
      page.waitForNavigation(),
      page.click('a')
    ])
    t.is(response, null)
    t.is(page.url(), server.PREFIX + '/wow.html')
  }
)

test.serial(
  'Page.waitForNavigation should work with history.replaceState()',
  async t => {
    const { page, server } = t.context
    await page.goto(server.EMPTY_PAGE)
    await page.setContent(`
        <a onclick='javascript:replaceState()'>SPA</a>
        <script>
          function replaceState() { history.replaceState({}, '', '/replaced.html') }
        </script>
      `)
    const [response] = await Promise.all([
      page.waitForNavigation(),
      page.click('a')
    ])
    t.is(response, null)
    t.is(page.url(), server.PREFIX + '/replaced.html')
  }
)

test.serial(
  'Page.waitForNavigation should work with DOM history.back()/history.forward()',
  async t => {
    const { page, server } = t.context
    await page.goto(server.EMPTY_PAGE)
    await page.setContent(`
        <a id=back onclick='javascript:goBack()'>back</a>
        <a id=forward onclick='javascript:goForward()'>forward</a>
        <script>
          function goBack() { history.back(); }
          function goForward() { history.forward(); }
          history.pushState({}, '', '/first.html');
          history.pushState({}, '', '/second.html');
        </script>
      `)
    t.is(page.url(), server.PREFIX + '/second.html')
    const [backResponse] = await Promise.all([
      page.waitForNavigation(),
      page.click('a#back')
    ])
    t.is(backResponse, null)
    t.is(page.url(), server.PREFIX + '/first.html')
    const [forwardResponse] = await Promise.all([
      page.waitForNavigation(),
      page.click('a#forward')
    ])
    t.is(forwardResponse, null)
    t.is(page.url(), server.PREFIX + '/second.html')
  }
)

test.serial(
  'Page.waitForNavigation should work when subframe issues window.stop()',
  async t => {
    const { page, server } = t.context
    const navigationPromise = page.goto(
      server.PREFIX + '/frames/subFrameLongTimeJack.html'
    )
    const frame = await utils.waitEvent(page, 'frameattached')
    await new Promise(fulfill => {
      page.on('framenavigated', f => {
        if (f === frame) fulfill()
      })
    })
    await Promise.all([frame.evaluate(() => window.stop()), navigationPromise])
    t.pass()
  }
)
