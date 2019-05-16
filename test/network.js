/* global fetch */
import test from 'ava'
import * as fs from 'fs-extra'
import * as utils from './helpers/utils'
import { TestHelper } from './helpers/testHelper'

/** @type {TestHelper} */
let helper

test.before(async t => {
  helper = await TestHelper.withHTTPAndHTTPS(t)
})

test.serial.beforeEach(async t => {
  t.context.page = await helper.newPage()
  t.context.server = helper.server()
  t.context.toBeGolden = (t, what, filePath) => {
    const results = helper.toBeGolden(what, filePath)
    t.true(results.pass, results.message)
  }
})

test.serial.afterEach.always(async t => {
  await helper.cleanup()
})

test.after.always(async t => {
  await helper.end()
})

test.serial(
  'Page.Events.Request should fire for navigation requests',
  async t => {
    const { page, server } = t.context
    const requests = []
    page.on(
      'request',
      request => !utils.isFavicon(request) && requests.push(request)
    )
    await page.goto(server.EMPTY_PAGE)
    t.is(requests.length, 1)
  }
)

test.serial('Page.Events.Request should fire for iframes', async t => {
  const { page, server } = t.context
  const requests = []
  page.on(
    'request',
    request => !utils.isFavicon(request) && requests.push(request)
  )
  await page.goto(server.EMPTY_PAGE)
  await utils.attachFrame(page, 'frame1', server.EMPTY_PAGE)
  t.is(requests.length, 2)
})

test.serial('Page.Events.Request should fire for fetches', async t => {
  const { page, server } = t.context
  const requests = []
  page.on(
    'request',
    request => !utils.isFavicon(request) && requests.push(request)
  )
  await page.goto(server.EMPTY_PAGE)
  await page.evaluate(() => fetch('/empty.html'))
  t.is(requests.length, 2)
})

test.serial(
  'Request.frame should work for main frame navigation request',
  async t => {
    const { page, server } = t.context
    const requests = []
    page.on(
      'request',
      request => !utils.isFavicon(request) && requests.push(request)
    )
    await page.goto(server.EMPTY_PAGE)
    t.is(requests.length, 1)
    t.is(requests[0].frame(), page.mainFrame())
  }
)

test.serial(
  'Request.frame should work for subframe navigation request',
  async t => {
    const { page, server } = t.context
    await page.goto(server.EMPTY_PAGE)
    const requests = []
    page.on(
      'request',
      request => !utils.isFavicon(request) && requests.push(request)
    )
    await utils.attachFrame(page, 'frame1', server.EMPTY_PAGE)
    t.is(requests.length, 1)
    t.is(requests[0].frame(), page.frames()[1])
  }
)

test.serial('Request.frame should work for fetch requests', async t => {
  const { page, server } = t.context
  await page.goto(server.EMPTY_PAGE)
  let requests = []
  page.on(
    'request',
    request => !utils.isFavicon(request) && requests.push(request)
  )
  await page.evaluate(() => fetch('/digits/1.png'))
  requests = requests.filter(request => !request.url().includes('favicon'))
  t.is(requests.length, 1)
  t.is(requests[0].frame(), page.mainFrame())
})

test.serial('Request.headers should work', async t => {
  const { page, server } = t.context
  const response = await page.goto(server.EMPTY_PAGE)
  t.true(
    response
      .request()
      .normalizedHeaders()
      ['user-agent'].includes('Chrome')
  )
})

test.serial('Response.headers should work', async t => {
  const { page, server } = t.context
  const response = await page.goto(server.EMPTY_FOO_BAR_HEADERS_PAGE)
  t.is(response.headers()['foo'], 'bar')
})

test.serial(
  'Response.fromCache should return |false| for non-cached content',
  async t => {
    const { page, server } = t.context
    const response = await page.goto(server.EMPTY_FOO_BAR_HEADERS_PAGE)
    t.false(response.fromCache())
  }
)

test.serial('Response.fromCache should work', async t => {
  const { page, server } = t.context
  const responses = new Map()
  page.on(
    'response',
    r =>
      !utils.isFavicon(r.request()) &&
      responses.set(
        r
          .url()
          .split('/')
          .pop(),
        r
      )
  )

  // Load and re-load to make sure it's cached.
  await page.goto(server.PREFIX + '/cached/one-style.html')
  await page.waitFor(1000)
  await page.reload()
  t.is(responses.size, 2)
  t.true([200, 304].includes(responses.get('one-style.css').status()))
})

test.serial(
  'Response.fromServiceWorker should return |false| for non-service-worker content',
  async t => {
    const { page, server } = t.context
    const response = await page.goto(server.EMPTY_PAGE)
    t.false(response.fromServiceWorker())
  }
)

test.serial(
  'Response.fromServiceWorker Response.fromServiceWorker',
  async t => {
    const { page, server } = t.context
    const responses = new Map()
    page.on('response', r =>
      responses.set(
        r
          .url()
          .split('/')
          .pop(),
        r
      )
    )

    // Load and re-load to make sure serviceworker is installed and running.
    await page.goto(server.PREFIX + '/serviceworkers/fetch/sw.html', {
      waitUntil: 'networkidle2'
    })
    await page.evaluate(async () => await window.activationPromise)
    await page.reload()
    t.true([2, 3].includes(responses.size))
    t.is(responses.get('sw.html').status(), 200)
    t.true(responses.get('sw.html').fromServiceWorker())
    t.is(responses.get('style.css').status(), 200)
    t.true(responses.get('style.css').fromServiceWorker())
  }
)

test.serial('Request.postData should work', async t => {
  const { page, server } = t.context
  await page.goto(server.EMPTY_PAGE)
  let request = null
  page.on('request', r => (request = r))
  await page.evaluate(() =>
    fetch('./post', {
      method: 'POST',
      body: JSON.stringify({
        foo: 'bar'
      })
    })
  )
  t.truthy(request)
  t.is(request.postData(), '{"foo":"bar"}')
})

test.serial(
  'Request.postData should be |undefined| when there is no post data',
  async t => {
    const { page, server } = t.context
    const response = await page.goto(server.EMPTY_PAGE)
    t.falsy(response.request().postData())
  }
)

test.serial('Response.text should work', async t => {
  const { page, server } = t.context
  const response = await page.goto(server.PREFIX + '/simple.json')
  t.is(await response.text(), '{"foo": "bar"}\n')
})

test.serial('Response.text should return uncompressed text', async t => {
  const { page, server } = t.context
  await page.goto(server.EMPTY_PAGE)
  const [response] = await Promise.all([
    page.waitForResponse(server.PREFIX + '/simple.json.gz'),
    page.evaluate(url => fetch(url), server.PREFIX + '/simple.json.gz')
  ])
  t.is(response.headers()['content-encoding'], 'gzip')
  t.is(await response.text(), '{"foo": "bar"}\n')
})

test.serial(
  'Response.text should throw when requesting body of redirected response',
  async t => {
    const { page, server } = t.context
    const response = await page.goto(server.PREFIX + '/foo.html')
    const redirectChain = response.request().redirectChain()
    t.is(redirectChain.length, 1)
    const redirected = redirectChain[0].response()
    t.is(redirected.status(), 302)
    let error = null
    await redirected.text().catch(e => (error = e))
    t.true(
      error.message.includes(
        'Response body is unavailable for redirect responses'
      )
    )
  }
)

test.serial('Response.text should wait until response completes', async t => {
  const { page, server } = t.context
  await page.goto(server.EMPTY_PAGE) // Setup server to trap request.
  server.slowStreamSpeed(300)

  const [pageResponse] = await Promise.all([
    page.waitForResponse(r => !utils.isFavicon(r.request())),
    page.evaluate(() =>
      fetch('./get-slow', {
        method: 'GET'
      })
    ),
    server.waitForRequest('/get-slow')
  ])
  t.truthy(pageResponse)
  t.is(pageResponse.status(), 200)
  t.is(await pageResponse.text(), 'hello world!')
})

test.serial('Response.json should work', async t => {
  const { page, server } = t.context
  const response = await page.goto(server.PREFIX + '/simple.json')
  t.deepEqual(await response.json(), {
    foo: 'bar'
  })
})

test.serial('Response.buffer should work', async t => {
  const { page, server } = t.context
  const response = await page.goto(server.PREFIX + '/pptr.png')
  const imageBuffer = await fs.readFile(utils.assetPath('pptr.png'))
  const responseBuffer = await response.buffer()
  t.true(responseBuffer.equals(imageBuffer))
})

test.serial('Response.buffer should work with compression', async t => {
  const { page, server } = t.context
  await page.goto(server.EMPTY_PAGE)
  const [response] = await Promise.all([
    page.waitForResponse(res => res.url().endsWith('/pptr.png.gz')),
    page.evaluate(async toBeFetched => {
      await fetch(toBeFetched).catch(() => {})
    }, server.PREFIX + '/pptr.png.gz')
  ])
  const imageBuffer = await fs.readFile(utils.assetPath('pptr.png'))
  const responseBuffer = await response.buffer()
  t.true(responseBuffer.equals(imageBuffer))
})

test.serial('Response.statusText should work', async t => {
  const { page, server } = t.context
  const response = await page.goto(server.PREFIX + '/cool')
  t.is(response.statusText(), 'cool!')
})

test.serial('Network Events Page.Events.Request', async t => {
  const { page, server } = t.context
  const requests = []
  page.on('request', request => requests.push(request))
  await page.goto(server.EMPTY_PAGE)
  t.is(requests.length, 1)
  t.is(requests[0].url(), server.EMPTY_PAGE)
  t.is(requests[0].resourceType(), 'document')
  t.is(requests[0].method(), 'GET')
  t.truthy(requests[0].response())
  t.true(requests[0].frame() === page.mainFrame())
  t.is(requests[0].frame().url(), server.EMPTY_PAGE)
})

test.serial('Network Events Page.Events.Response', async t => {
  const { page, server } = t.context
  const responses = []
  page.on('response', response => responses.push(response))
  await page.goto(server.EMPTY_PAGE)
  t.is(responses.length, 1)
  t.is(responses[0].url(), server.EMPTY_PAGE)
  t.is(responses[0].status(), 200)
  t.true(responses[0].ok())
  t.truthy(responses[0].request())
  const remoteAddress = responses[0].remoteAddress()
  // Either IPv6 or IPv4, depending on environment.
  t.true(remoteAddress.ip.includes('::1') || remoteAddress.ip === '127.0.0.1')
  t.is(remoteAddress.port, server.PORT)
})

test.serial('Network Events Page.Events.RequestFailed', async t => {
  const { page, server } = t.context
  await page.setRequestInterception(true)
  page.on('request', request => {
    if (request.url().endsWith('css')) request.abort()
    else request.continue()
  })
  const failedRequests = []
  page.on('requestfailed', request => failedRequests.push(request))
  await page.goto(server.PREFIX + '/one-style.html')
  t.is(failedRequests.length, 1)
  t.true(failedRequests[0].url().includes('one-style.css'))
  t.falsy(failedRequests[0].response())
  t.is(failedRequests[0].resourceType(), 'stylesheet')
  t.is(failedRequests[0].failure().errorText, 'net::ERR_FAILED')
  t.truthy(failedRequests[0].frame())
})

test.serial('Network Events Page.Events.RequestFinished', async t => {
  const { page, server } = t.context
  const requests = []
  page.on('requestfinished', request => requests.push(request))
  await page.goto(server.EMPTY_PAGE)
  t.is(requests.length, 1)
  t.is(requests[0].url(), server.EMPTY_PAGE)
  t.truthy(requests[0].response())
  t.true(requests[0].frame() === page.mainFrame())
  t.is(requests[0].frame().url(), server.EMPTY_PAGE)
})

test.serial('Network Events should fire events in proper order', async t => {
  const { page, server } = t.context
  const events = []
  page.on('request', request => events.push('request'))
  page.on('response', response => events.push('response'))
  page.on('requestfinished', request => events.push('requestfinished'))
  await page.goto(server.EMPTY_PAGE)
  t.deepEqual(events, ['request', 'response', 'requestfinished'])
})

test.serial('Network Events should support redirects', async t => {
  const { page, server } = t.context
  const events = []
  page.on('request', request =>
    events.push(`${request.method()} ${request.url()}`)
  )
  page.on('response', response =>
    events.push(`${response.status()} ${response.url()}`)
  )
  page.on('requestfinished', request => events.push(`DONE ${request.url()}`))
  page.on('requestfailed', request => events.push(`FAIL ${request.url()}`))
  const FOO_URL = server.PREFIX + '/foo.html'
  const response = await page.goto(FOO_URL)
  t.deepEqual(events, [
    `GET ${FOO_URL}`,
    `302 ${FOO_URL}`,
    `DONE ${FOO_URL}`,
    `GET ${server.EMPTY_PAGE}`,
    `200 ${server.EMPTY_PAGE}`,
    `DONE ${server.EMPTY_PAGE}`
  ])

  // Check redirect chain
  const redirectChain = response.request().redirectChain()
  t.is(redirectChain.length, 1)
  t.true(redirectChain[0].url().includes('/foo.html'))
  t.is(redirectChain[0].response().remoteAddress().port, server.PORT)
})

test.serial('Request.isNavigationRequest should work', async t => {
  const { page, server } = t.context
  const requests = new Map()
  page.on('request', request =>
    requests.set(
      request
        .url()
        .split('/')
        .pop(),
      request
    )
  )
  await page.goto(server.PREFIX + '/rrredirect')
  t.true(requests.get('rrredirect').isNavigationRequest())
  t.true(requests.get('one-frame.html').isNavigationRequest())
  t.true(requests.get('frame.html').isNavigationRequest())
  t.false(requests.get('script.js').isNavigationRequest())
  t.false(requests.get('style.css').isNavigationRequest())
})

test.serial(
  'Request.isNavigationRequest should work with request interception',
  async t => {
    const { page, server } = t.context
    const requests = new Map()
    page.on('request', request => {
      requests.set(
        request
          .url()
          .split('/')
          .pop(),
        request
      )
      request.continue()
    })
    await page.setRequestInterception(true)
    await page.goto(server.PREFIX + '/rrredirect')
    t.true(requests.get('rrredirect').isNavigationRequest())
    t.true(requests.get('one-frame.html').isNavigationRequest())
    t.true(requests.get('frame.html').isNavigationRequest())
    t.false(requests.get('script.js').isNavigationRequest())
    t.false(requests.get('style.css').isNavigationRequest())
  }
)

test.serial(
  'Request.isNavigationRequest should work when navigating to image',
  async t => {
    const { page, server } = t.context
    const requests = []
    page.on('request', request => requests.push(request))
    await page.goto(server.PREFIX + '/pptr.png')
    t.true(requests[0].isNavigationRequest())
  }
)


test.serial('Page.setExtraHTTPHeaders should work', async t => {
  const { page, server } = t.context
  await page.setExtraHTTPHeaders({
    foo: 'bar'
  })
  const [request] = await Promise.all([
    page.waitForRequest(server.EMPTY_PAGE),
    page.goto(server.EMPTY_PAGE)
  ])
  t.is(request.headers()['foo'], 'bar')
})

test.serial(
  'Page.setExtraHTTPHeaders should throw for non-string header values',
  async t => {
    const { page, server } = t.context
    let error = null

    try {
      await page.setExtraHTTPHeaders({
        foo: 1
      })
    } catch (e) {
      error = e
    }

    t.is(
      error.message,
      'Expected value of header "foo" to be String, but "number" is found.'
    )
  }
)

test.serial('Page.authenticate should work', async t => {
  t.timeout(10000)
  const { page, server } = t.context
  await page.authenticate({
    username: 'user',
    password: 'pass'
  })
  let response = await page.goto(server.AUTH_EMPTY_PAGE)
  t.is(response.status(), 200)
})

test.serial('Page.authenticate should fail if wrong credentials', async t => {
  const { page, server } = t.context
  await page.authenticate({
    username: 'foo',
    password: 'bar'
  })
  const response = await page.goto(server.AUTH_EMPTY_PAGE_2)
  t.is(response.status(), 401)
})

test.serial(
  'Page.authenticate should allow disable authentication',
  async t => {
    const { page, server } = t.context
    // Use unique user/password since Chrome caches credentials per origin.
    await page.authenticate({
      username: 'user3',
      password: 'pass3'
    })
    let response = await page.goto(server.AUTH_EMPTY_PAGE_3)
    t.is(response.status(), 200)
    await page.authenticate(null) // Navigate to a different origin to bust Chrome's credential caching.

    response = await page.goto(server.CROSS_PROCESS_PREFIX + '/empty.html')
    t.is(response.status(), 200)
  }
)
