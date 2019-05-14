import test from 'ava'
import fileUrl from 'file-url'
import * as fs from 'fs-extra'
import * as utils from './helpers/utils'
import { TestHelper } from './helpers'

function pathToFileURL (path) {
  return fileUrl(path)
}

/** @type {TestHelper} */
let helper

test.serial.before(async t => {
  helper = await TestHelper.withHTTP(t)
})

test.serial.beforeEach(async t => {
  t.context.browser = helper.browser()
  t.context.server = helper.server()
  t.context.page = await helper.newPage()
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

test.serial('Page.setRequestInterception should intercept', async t => {
  const { page, server } = t.context
  await page.setRequestInterception(true)
  page.on('request', request => {
    if (utils.isFavicon(request)) {
      request.continue()
      return
    }

    t.true(request.url().includes('empty.html'))
    t.truthy(request.normalizedHeaders()['user-agent'])
    t.is(request.method(), 'GET')
    t.falsy(request.postData())
    t.true(request.isNavigationRequest())
    t.is(request.resourceType(), 'document')
    t.true(request.frame() === page.mainFrame())
    t.is(request.frame().url(), 'about:blank')
    request.continue()
  })
  const response = await page.goto(server.EMPTY_PAGE)
  t.true(response.ok())
  t.is(response.remoteAddress().port, server.PORT)
})

test.serial(
  'Page.setRequestInterception should work when POST is redirected with 302',
  async t => {
    const { page, server } = t.context
    await page.goto(server.EMPTY_PAGE)
    await page.setRequestInterception(true)
    page.on('request', request => request.continue())
    await page.setContent(`
        <form action='/rredirect' method='post'>
          <input type="hidden" id="foo" name="foo" value="FOOBAR">
        </form>
      `)
    await Promise.all([
      page.$eval('form', form => form.submit()),
      page.waitForNavigation()
    ])
    t.pass()
  }
)

test.serial.skip(
  'Page.setRequestInterception should work when header manipulation headers with redirect',
  async t => {
    const { page, server } = t.context
    page.on('request', request => {
      if (!request.url().endsWith('/redirectToEmpty')) return
      const headers = Object.assign({}, request.headers(), {
        foo: 'bar'
      })
      request.continue({
        headers
      })
    })
    await page.goto(server.PREFIX + '/interceptMe.html')
    await page.setRequestInterception(true)
    const results = await page.evaluate(() => window.results())
    t.deepEqual(results, { error: false })
  }
)

test.serial(
  'Page.setRequestInterception should contain referer header',
  async t => {
    const { page, server } = t.context
    await page.setRequestInterception(true)
    const requests = []
    page.on('request', request => {
      if (!utils.isFavicon(request)) requests.push(request)
      request.continue()
    })
    await page.goto(server.PREFIX + '/one-style.html')
    t.true(requests[1].url().includes('/one-style.css'))
    t.true(requests[1].normalizedHeaders().referer.includes('/one-style.html'))
  }
)

test.serial(
  'Page.setRequestInterception should properly return navigation response when URL has cookies',
  async t => {
    const { page, server } = t.context
    // Setup cookie.
    await page.goto(server.EMPTY_PAGE)
    await page.setCookie({ name: 'foo', value: 'bar' })

    // Setup request interception.
    await page.setRequestInterception(true)
    page.on('request', request => request.continue())
    const response = await page.reload()
    t.is(response.status(), 200)
  }
)

test.serial('Page.setRequestInterception should stop intercepting', async t => {
  const { page, server } = t.context
  await page.setRequestInterception(true)
  page.once('request', request => request.continue())
  await page.goto(server.EMPTY_PAGE)
  await page.setRequestInterception(false)
  await page.goto(server.EMPTY_PAGE)
  t.pass()
})

test.serial(
  'Page.setRequestInterception should show custom HTTP headers',
  async t => {
    const { page, server } = t.context
    await page.setExtraHTTPHeaders({
      foo: 'bar'
    })

    await page.setRequestInterception(true)
    page.on('request', request => {
      t.is(request.headers()['foo'], 'bar')
      request.continue()
    })
    const response = await page.goto(server.EMPTY_PAGE)
    t.true(response.ok())
  }
)

test.serial(
  'Page.setRequestInterception should works with customizing referer headers',
  async t => {
    const { page, server } = t.context
    await page.setExtraHTTPHeaders({ referer: server.EMPTY_PAGE })
    await page.setRequestInterception(true)
    page.on('request', request => {
      t.is(request.headers()['referer'], server.EMPTY_PAGE)
      request.continue()
    })
    const response = await page.goto(server.EMPTY_PAGE)
    t.true(response.ok())
  }
)

test.serial('Page.setRequestInterception should be abortable', async t => {
  const { page, server } = t.context
  await page.setRequestInterception(true)
  page.on('request', request => {
    if (request.url().endsWith('.css')) request.abort()
    else request.continue()
  })
  let failedRequests = 0
  page.on('requestfailed', event => ++failedRequests)
  const response = await page.goto(server.PREFIX + '/one-style.html')
  t.true(response.ok())
  t.falsy(response.request().failure())
  t.is(failedRequests, 1)
})

test.serial.skip(
  'Page.setRequestInterception should be abortable with custom error codes',
  async t => {
    const { page, server } = t.context
    await page.goto(server.EMPTY_PAGE)
    let failedRequest = null
    page.on('requestfailed', request => (failedRequest = request))
    page.on('request', request => {
      request.abort('internetdisconnected')
    })
    await page.setRequestInterception(true)
    await page.evaluate(
      url =>
        fetch(url, {
          method: 'GET'
        }),
      server.EMPTY_PAGE
    )
    t.pass()

    t.truthy(failedRequest)
    t.is(failedRequest.failure().errorText, 'net::ERR_INTERNET_DISCONNECTED')
  }
)

test.serial('Page.setRequestInterception should send referer', async t => {
  const { page, server } = t.context
  await page.setExtraHTTPHeaders({
    referer: 'http://google.com/'
  })

  await page.setRequestInterception(true)
  page.on('request', request => request.continue())
  const [request] = await Promise.all([
    server.waitForRequest('/grid.html'),
    page.goto(server.PREFIX + '/grid.html')
  ])

  t.is(request.headers['referer'], 'http://google.com/')
})

test.serial(
  'Page.setRequestInterception should fail navigation when aborting main resource',
  async t => {
    const { page, server } = t.context
    await page.setRequestInterception(true)
    page.on('request', request => request.abort())
    let error = null
    await page.goto(server.EMPTY_PAGE).catch(e => (error = e))
    t.truthy(error)
    t.true(error.message.includes('net::ERR_FAILED'))
  }
)

test.serial(
  'Page.setRequestInterception should work with redirects',
  async t => {
    const { page, server } = t.context
    await page.setRequestInterception(true)
    const requests = []
    page.on('request', request => {
      request.continue()
      requests.push(request)
    })
    const response = await page.goto(server.PREFIX + '/non-existing-page.html')
    t.is(response.status(), 200)
    t.true(response.url().includes('empty.html'))
    t.is(requests.length, 5)
    t.is(requests[2].resourceType(), 'document')
    // Check redirect chain
    const redirectChain = response.request().redirectChain()
    t.is(redirectChain.length, 4)
    t.true(redirectChain[0].url().includes('/non-existing-page.html'))
    t.true(redirectChain[2].url().includes('/non-existing-page-3.html'))

    for (let i = 0; i < redirectChain.length; ++i) {
      const request = redirectChain[i]
      t.true(request.isNavigationRequest())
      t.is(request.redirectChain().indexOf(request), i)
    }
  }
)

test.serial(
  'Page.setRequestInterception should work with redirects for subresources',
  async t => {
    const { page, server } = t.context
    await page.setRequestInterception(true)
    const requests = []
    page.on('request', request => {
      request.continue()
      if (!utils.isFavicon(request)) requests.push(request)
    })
    const response = await page.goto(server.PREFIX + '/redir-css.html')
    t.is(response.status(), 200)
    t.true(response.url().includes('redir-css.html'))
    t.is(requests.length, 5)
    t.is(requests[0].resourceType(), 'document')
    t.is(requests[1].resourceType(), 'stylesheet')
    // Check redirect chain
    const redirectChain = requests[1].redirectChain()
    t.is(redirectChain.length, 3)
    t.true(redirectChain[0].url().includes('/style-redir-1.css'))
    t.true(redirectChain[2].url().includes('/style-redir-3.css'))
  }
)

test.serial(
  'Page.setRequestInterception should be able to abort redirects',
  async t => {
    const { page, server } = t.context
    await page.setRequestInterception(true)
    page.on('request', request => {
      if (request.url().includes('non-existing-2')) request.abort()
      else request.continue()
    })
    await page.goto(server.EMPTY_PAGE)
    const result = await page.evaluate(async () => {
      try {
        await fetch('/non-existing.json')
      } catch (e) {
        return e.message
      }
    })
    t.true(result.includes('Failed to fetch'))
  }
)

test.serial(
  'Page.setRequestInterception should work with equal requests',
  async t => {
    const { page, server } = t.context
    await page.goto(server.EMPTY_PAGE)
    await page.setRequestInterception(true)
    let spinner = false // Cancel 2nd request.

    page.on('request', request => {
      if (utils.isFavicon(request)) {
        request.continue()
        return
      }

      spinner ? request.abort() : request.continue()
      spinner = !spinner
    })
    const results = await page.evaluate(() =>
      Promise.all([
        fetch('/zzz')
          .then(response => response.text())
          .catch(e => 'FAILED'),
        fetch('/zzz')
          .then(response => response.text())
          .catch(e => 'FAILED'),
        fetch('/zzz')
          .then(response => response.text())
          .catch(e => 'FAILED')
      ])
    )
    t.deepEqual(results, ['zzz', 'FAILED', 'zzz'])
  }
)

test.serial(
  'Page.setRequestInterception should navigate to dataURL and fire dataURL requests',
  async t => {
    const { page, server } = t.context
    await page.setRequestInterception(true)
    const requests = []
    page.on('request', request => {
      requests.push(request)
      request.continue()
    })
    const dataURL = 'data:text/html,<div>yo</div>'
    const response = await page.goto(dataURL)
    t.is(response.status(), 200)
    t.is(requests.length, 1)
    t.is(requests[0].url(), dataURL)
  }
)

test.serial(
  'Page.setRequestInterception should navigate to URL with hash and and fire requests with hash',
  async t => {
    const { page, server } = t.context
    await page.setRequestInterception(true)
    const requests = []
    page.on('request', request => {
      requests.push(request)
      request.continue()
    })
    const response = await page.goto(server.EMPTY_PAGE + '#hash')
    t.is(response.status(), 200)
    t.is(response.url(), server.EMPTY_PAGE)
    t.is(requests.length, 1)
    t.is(requests[0].url(), server.EMPTY_PAGE + '#hash')
  }
)

test.serial(
  'Page.setRequestInterception should work with encoded server',
  async t => {
    const { page, server } = t.context
    // The requestWillBeSent will report encoded URL, whereas interception will
    // report URL as-is. @see crbug.com/759388
    await page.setRequestInterception(true)
    page.on('request', request => request.continue())
    const response = await page.goto(server.PREFIX + '/some nonexisting page')
    t.is(response.status(), 404)
  }
)

test.serial(
  'Page.setRequestInterception should work with badly encoded server',
  async t => {
    const { page, server } = t.context
    await page.setRequestInterception(true)
    page.on('request', request => request.continue())
    const response = await page.goto(server.PREFIX + '/malformed?rnd=%911')
    t.is(response.status(), 200)
  }
)

test.serial(
  'Page.setRequestInterception should work with encoded server - 2',
  async t => {
    const { page, server } = t.context
    // The requestWillBeSent will report URL as-is, whereas interception will
    // report encoded URL for stylesheet. @see crbug.com/759388
    await page.setRequestInterception(true)
    const requests = []
    page.on('request', request => {
      request.continue()
      requests.push(request)
    })
    const response = await page.goto(
      `data:text/html,<link rel="stylesheet" href="${
        server.PREFIX
      }/fonts?helvetica|arial"/>`
    )

    t.is(response.status(), 200)
    t.is(requests.length, 2)
    t.is(requests[1].response().status(), 404)
  }
)

test.serial(
  'Page.setRequestInterception should not throw "Invalid Interception Id" if the request was cancelled',
  async t => {
    const { page, server } = t.context
    await page.setContent('<iframe></iframe>')
    await page.setRequestInterception(true)
    let request = null
    page.on('request', r => (request = r))
    page.$eval('iframe', (frame, url) => (frame.src = url), server.EMPTY_PAGE) // Wait for request interception.
    await utils.waitEvent(page, 'request') // Delete frame to cause request to be canceled.

    await page.$eval('iframe', frame => frame.remove())
    let error = null
    await request.continue().catch(e => (error = e))
    t.falsy(error)
  }
)

test.serial(
  'Page.setRequestInterception should throw if interception is not enabled',
  async t => {
    const { page, server } = t.context
    let error = null
    page.on('request', async request => {
      try {
        await request.continue()
      } catch (e) {
        error = e
      }
    })
    await page.goto(server.EMPTY_PAGE)
    t.true(error.message.includes('Request Interception is not enabled'))
  }
)

test.serial(
  'Page.setRequestInterception should work with file URLs',
  async t => {
    const { page, server } = t.context
    await page.setRequestInterception(true)
    const urls = new Set()
    page.on('request', request => {
      urls.add(
        request
          .url()
          .split('/')
          .pop()
      )

      request.continue()
    })
    await page.goto(pathToFileURL(utils.assetPath('one-style.html')))

    t.is(urls.size, 2)
    t.true(urls.has('one-style.html'))
    t.true(urls.has('one-style.css'))
  }
)

test.serial('Request.continue should work', async t => {
  const { page, server } = t.context
  await page.setRequestInterception(true)
  page.on('request', request => request.continue())
  await page.goto(server.EMPTY_PAGE)
  t.pass()
})

test.serial('Request.continue should amend HTTP headers', async t => {
  const { page, server } = t.context
  await page.setRequestInterception(true)
  page.on('request', request => {
    const headers = Object.assign({}, request.headers())
    headers['FOO'] = 'bar'
    request.continue({ headers })
  })
  await page.goto(server.EMPTY_PAGE)
  const [request] = await Promise.all([
    server.waitForRequest('/sleep.zzz'),
    page.evaluate(() => fetch('/sleep.zzz'))
  ])

  t.is(request.headers['foo'], 'bar')
})

test.serial(
  'Request.continue should redirect in a way non-observable to page',
  async t => {
    const { page, server } = t.context
    await page.setRequestInterception(true)
    page.on('request', request => {
      const redirectURL = request.url().includes('/empty.html')
        ? server.PREFIX + '/consolelog.html'
        : undefined
      request.continue({ url: redirectURL })
    })
    let consoleMessage = null
    page.on('console', msg => (consoleMessage = msg))
    await page.goto(server.EMPTY_PAGE)
    t.is(page.url(), server.EMPTY_PAGE)
    t.is(consoleMessage.text(), 'yellow')
  }
)

test.serial('Request.continue should amend method', async t => {
  const { page, server } = t.context
  await page.goto(server.EMPTY_PAGE)

  await page.setRequestInterception(true)
  page.on('request', request => {
    request.continue({ method: 'POST' })
  })
  const [request] = await Promise.all([
    server.waitForRequest('/sleep.zzz'),
    page.evaluate(() => fetch('/sleep.zzz'))
  ])
  t.is(request.req.method, 'POST')
})

test.serial('Request.continue should amend post data', async t => {
  const { page, server } = t.context
  await page.goto(server.EMPTY_PAGE)

  await page.setRequestInterception(true)
  page.on('request', request => {
    request.continue({ postData: 'doggo' })
  })
  const [request] = await Promise.all([
    server.waitForRequest('/sleep.zzz'),
    page.evaluate(() =>
      fetch('/sleep.zzz', {
        method: 'POST',
        body: 'birdy'
      })
    )
  ])
  t.is(request.body, 'doggo')
})

test.serial(
  'Request.continue should amend both post data and method on navigation',
  async t => {
    const { page, server } = t.context
    await page.goto(server.EMPTY_PAGE)

    await page.setRequestInterception(true)
    page.on('request', request => {
      request.continue({ method: 'POST', postData: 'doggo' })
    })
    const [request] = await Promise.all([
      server.waitForRequest('/sleep.zzz'),
      page.evaluate(() =>
        fetch('/sleep.zzz', {
          method: 'POST',
          body: 'birdy'
        })
      )
    ])
    // t.log(serverRequest.req)
    t.is(request.body, 'doggo')
    t.is(request.raw.method, 'POST')
  }
)

test.serial('Request.respond should work', async t => {
  const { page, server } = t.context
  await page.setRequestInterception(true)
  page.on('request', request => {
    request.respond({
      status: 201,
      headers: {
        foo: 'bar'
      },

      body: 'Yo, page!'
    })
  })
  const response = await page.goto(server.EMPTY_PAGE)
  t.is(response.status(), 201)
  t.is(response.headers().foo, 'bar')
  const testResult = await page.evaluate(() => document.body.textContent)
  t.is(testResult, 'Yo, page!')
})

test.serial('Request.respond should redirect', async t => {
  const { page, server } = t.context
  await page.setRequestInterception(true)
  page.on('request', request => {
    if (!request.url().includes('rrredirect')) {
      request.continue()
      return
    }

    request.respond({
      status: 302,
      headers: {
        location: server.EMPTY_PAGE
      }
    })
  })
  const response = await page.goto(server.PREFIX + '/rrredirect')
  t.is(response.request().redirectChain().length, 1)
  t.is(
    response
      .request()
      .redirectChain()[0]
      .url(),
    server.PREFIX + '/rrredirect'
  )

  t.is(response.url(), server.EMPTY_PAGE)
})

test.serial(
  'Request.respond should allow mocking binary responses',
  async t => {
    const { page, server } = t.context
    await page.setRequestInterception(true)
    page.on('request', request => {
      const imageBuffer = fs.readFileSync(utils.assetPath('pptr.png'))

      request.respond({
        contentType: 'image/png',
        body: imageBuffer
      })
    })
    await page.evaluate(PREFIX => {
      const img = document.createElement('img')
      img.src = PREFIX + '/does-not-exist.png'
      document.body.appendChild(img)
      return new Promise(fulfill => (img.onload = fulfill))
    }, server.PREFIX)
    const img = await page.$('img')
    t.context.toBeGolden(t, await img.screenshot(), 'mock-binary-response.png')
  }
)
