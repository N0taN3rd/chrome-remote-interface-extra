import test from 'ava'
import { TestHelper } from './helpers/testHelper'

/** @type {TestHelper} */
let helper

test.serial.before(async t => {
  helper = await TestHelper.withHTTPAndHTTPS(t)
})

test.serial.beforeEach(async t => {
  t.context.page = await helper.newPage()
  t.context.server = helper.server()
  t.context.browser = helper.browser()
})

test.serial.afterEach.always(async t => {
  await helper.deepClean()
})

test.after.always(async t => {
  await helper.end()
})

test.serial(
  'Page.cookies should return no cookies in pristine browser context',
  async t => {
    const { page, server } = t.context
    await page.goto(server.EMPTY_PAGE)
    t.deepEqual((await page.cookies()).map(c => c._cookie), [])
  }
)

test.serial('Page.cookies should get a cookie', async t => {
  const { page, server } = t.context
  await page.goto(server.EMPTY_PAGE)
  await page.evaluate(() => {
    document.cookie = 'username=John Doe'
  })
  t.deepEqual((await page.cookies()).map(c => c._cookie), [
    {
      name: 'username',
      value: 'John Doe',
      domain: 'localhost',
      path: '/',
      expires: -1,
      size: 16,
      httpOnly: false,
      secure: false,
      session: true
    }
  ])
})

test.serial('Page.cookies should properly report httpOnly cookie', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/empty-http-only-cookie')
  const cookies = (await page.cookies()).map(c => c._cookie)
  t.is(cookies.length, 1)
  t.true(cookies[0].httpOnly)
})

test.serial(
  'Page.cookies should properly report "Strict" sameSite cookie',
  async t => {
    const { page, server } = t.context
    await page.goto(server.PREFIX + '/empty-strict-samesite-cookie')
    const cookies = (await page.cookies()).map(c => c._cookie)
    t.is(cookies.length, 1)
    t.is(cookies[0].sameSite, 'Strict')
  }
)

test.serial(
  'Page.cookies should properly report "Lax" sameSite cookie',
  async t => {
    const { page, server } = t.context
    await page.goto(server.PREFIX + '/empty-lax-samesite-cookie')
    const cookies = (await page.cookies()).map(c => c._cookie)
    t.is(cookies.length, 1)
    t.is(cookies[0].sameSite, 'Lax')
  }
)

test.serial('Page.cookies should get multiple cookies', async t => {
  const { page, server } = t.context
  await page.goto(server.EMPTY_PAGE)
  await page.evaluate(() => {
    document.cookie = 'username=John Doe'
    document.cookie = 'password=1234'
  })
  const cookies = (await page.cookies()).map(c => c._cookie)
  cookies.sort((a, b) => a.name.localeCompare(b.name))
  t.deepEqual(cookies, [
    {
      name: 'password',
      value: '1234',
      domain: 'localhost',
      path: '/',
      expires: -1,
      size: 12,
      httpOnly: false,
      secure: false,
      session: true
    },
    {
      name: 'username',
      value: 'John Doe',
      domain: 'localhost',
      path: '/',
      expires: -1,
      size: 16,
      httpOnly: false,
      secure: false,
      session: true
    }
  ])
})

test.serial('Page.cookies should get cookies from multiple urls', async t => {
  const { page, server } = t.context
  await page.setCookies(
    {
      url: 'https://foo.com',
      name: 'doggo',
      value: 'woofs'
    },
    {
      url: 'https://bar.com',
      name: 'catto',
      value: 'purrs'
    },
    {
      url: 'https://baz.com',
      name: 'birdo',
      value: 'tweets'
    }
  )
  const cookies = (await page.cookies(
    'https://foo.com',
    'https://baz.com'
  )).map(c => c._cookie)
  cookies.sort((a, b) => a.name.localeCompare(b.name))
  t.deepEqual(cookies, [
    {
      name: 'birdo',
      value: 'tweets',
      domain: 'baz.com',
      path: '/',
      expires: -1,
      size: 11,
      httpOnly: false,
      secure: true,
      session: true
    },
    {
      name: 'doggo',
      value: 'woofs',
      domain: 'foo.com',
      path: '/',
      expires: -1,
      size: 10,
      httpOnly: false,
      secure: true,
      session: true
    }
  ])
})

test.serial('Page.setCookie should work', async t => {
  const { page, server } = t.context
  await page.goto(server.EMPTY_PAGE)
  await page.setCookie({
    name: 'password',
    value: '123456'
  })
  t.deepEqual(await page.evaluate(() => document.cookie), 'password=123456')
})

test.serial(
  'Page.setCookie should isolate cookies in browser contexts',
  async t => {
    const { page, server, browser } = t.context
    const anotherContext = await browser.createIncognitoBrowserContext()
    const anotherPage = await anotherContext.newPage()
    await page.goto(server.EMPTY_PAGE)
    await anotherPage.goto(server.EMPTY_PAGE)
    await page.setCookie({
      name: 'page1cookie',
      value: 'page1value'
    })
    await anotherPage.setCookie({
      name: 'page2cookie',
      value: 'page2value'
    })
    const cookies1 = (await page.cookies()).map(c => c._cookie)
    const cookies2 = (await anotherPage.cookies()).map(c => c._cookie)
    t.is(cookies1.length, 1)
    t.is(cookies2.length, 1)
    t.is(cookies1[0].name, 'page1cookie')
    t.is(cookies1[0].value, 'page1value')
    t.is(cookies2[0].name, 'page2cookie')
    t.is(cookies2[0].value, 'page2value')
    await anotherContext.close()
  }
)

test.serial('Page.setCookie should set multiple cookies', async t => {
  const { page, server } = t.context
  await page.goto(server.EMPTY_PAGE)
  await page.setCookies(
    {
      name: 'password',
      value: '123456'
    },
    {
      name: 'foo',
      value: 'bar'
    }
  )
  t.deepEqual(
    await page.evaluate(() => {
      const cookies = document.cookie.split(';')
      return cookies.map(cookie => cookie.trim()).sort()
    }),
    ['foo=bar', 'password=123456']
  )
})

test.serial(
  'Page.setCookie should have |expires| set to |-1| for session cookies',
  async t => {
    const { page, server } = t.context
    await page.goto(server.EMPTY_PAGE)
    await page.setCookie({
      name: 'password',
      value: '123456'
    })
    const cookies = (await page.cookies()).map(c => c._cookie)
    t.true(cookies[0].session)
    t.is(cookies[0].expires, -1)
  }
)

test.serial(
  'Page.setCookie should set cookie with reasonable defaults',
  async t => {
    const { page, server } = t.context
    await page.goto(server.EMPTY_PAGE)
    await page.setCookie({
      name: 'password',
      value: '123456'
    })
    const cookies = (await page.cookies()).map(c => c._cookie)
    t.deepEqual(cookies.sort((a, b) => a.name.localeCompare(b.name)), [
      {
        name: 'password',
        value: '123456',
        domain: 'localhost',
        path: '/',
        expires: -1,
        size: 14,
        httpOnly: false,
        secure: false,
        session: true
      }
    ])
  }
)

test.serial('Page.setCookie should set a cookie with a path', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/grid.html')
  await page.setCookie({
    name: 'gridcookie',
    value: 'GRID',
    path: '/grid.html'
  })
  t.deepEqual((await page.cookies()).map(c => c._cookie), [
    {
      name: 'gridcookie',
      value: 'GRID',
      domain: 'localhost',
      path: '/grid.html',
      expires: -1,
      size: 14,
      httpOnly: false,
      secure: false,
      session: true
    }
  ])
  t.is(await page.evaluate('document.cookie'), 'gridcookie=GRID')
  await page.goto(server.EMPTY_PAGE)
  t.deepEqual((await page.cookies()).map(c => c._cookie), [])
  t.is(await page.evaluate('document.cookie'), '')
  await page.goto(server.PREFIX + '/grid.html')
  t.is(await page.evaluate('document.cookie'), 'gridcookie=GRID')
})

test.serial(
  'Page.setCookie should not set a cookie on a blank page',
  async t => {
    const { page } = t.context
    await page.goto('about:blank')
    let error = null

    try {
      await page.setCookie({
        name: 'example-cookie',
        value: 'best'
      })
    } catch (e) {
      error = e
    }

    t.true(
      error.message.includes(
        'At least one of the url and domain needs to be specified'
      )
    )
  }
)

test.serial(
  'Page.setCookie should not set a cookie with blank page URL',
  async t => {
    const { page, server } = t.context
    let error = null
    await page.goto(server.EMPTY_PAGE)

    try {
      await page.setCookies(
        {
          name: 'example-cookie',
          value: 'best'
        },
        {
          url: 'about:blank',
          name: 'example-cookie-blank',
          value: 'best'
        }
      )
    } catch (e) {
      error = e
    }

    t.deepEqual(
      error.message,
      `Blank page can not have cookie "example-cookie-blank"`
    )
  }
)

test.serial(
  'Page.setCookie should not set a cookie on a data URL page',
  async t => {
    const { page } = t.context
    let error = null
    await page.goto('data:,Hello%2C%20World!')

    try {
      await page.setCookie({
        name: 'example-cookie',
        value: 'best'
      })
    } catch (e) {
      error = e
    }

    t.true(
      error.message.includes(
        'At least one of the url and domain needs to be specified'
      )
    )
  }
)

test.serial(
  'Page.setCookie should default to setting secure cookie for HTTPS websites',
  async t => {
    const { page, server } = t.context
    await page.goto(server.EMPTY_PAGE)
    const SECURE_URL = 'https://example.com'
    await page.setCookie({
      url: SECURE_URL,
      name: 'foo',
      value: 'bar'
    })
    const [cookie] = (await page.cookies(SECURE_URL)).map(c => c._cookie)
    t.true(cookie.secure)
  }
)

test.serial(
  'Page.setCookie should be able to set unsecure cookie for HTTPS website',
  async t => {
    const { page, server } = t.context
    await page.goto(server.EMPTY_PAGE)
    const SECURE_URL = 'http://example.com'
    await page.setCookie({
      url: SECURE_URL,
      name: 'foo',
      value: 'bar'
    })
    const [cookie] = (await page.cookies(SECURE_URL)).map(c => c._cookie)
    t.false(cookie.secure)
  }
)

test.serial(
  'Page.setCookie should set a cookie on a different domain',
  async t => {
    const { page, server } = t.context
    await page.goto(server.EMPTY_PAGE)
    await page.setCookie({
      url: 'https://www.example.com',
      name: 'example-cookie',
      value: 'best'
    })
    t.is(await page.evaluate('document.cookie'), '')
    t.deepEqual((await page.cookies()).map(c => c._cookie), [])
    t.deepEqual(
      (await page.cookies('https://www.example.com')).map(c => c._cookie),
      [
        {
          name: 'example-cookie',
          value: 'best',
          domain: 'www.example.com',
          path: '/',
          expires: -1,
          size: 18,
          httpOnly: false,
          secure: true,
          session: true
        }
      ]
    )
  }
)

test.serial('Page.setCookie should set cookies from a frame', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/grid.html')
  await page.setCookie({
    name: 'localhost-cookie',
    value: 'best'
  })
  await page.evaluate(src => {
    let fulfill
    const promise = new Promise(x => (fulfill = x))
    const iframe = document.createElement('iframe')
    document.body.appendChild(iframe)
    iframe.onload = fulfill
    iframe.src = src
    return promise
  }, `${server.CROSS_PROCESS_PREFIX}/empty.html`)
  await page.setCookie({
    name: '127-cookie',
    value: 'worst',
    url: `${server.CROSS_PROCESS_PREFIX}/empty.html`
  })
  t.is(await page.evaluate('document.cookie'), 'localhost-cookie=best')
  t.is(await page.frames()[1].evaluate('document.cookie'), '127-cookie=worst')
  t.deepEqual((await page.cookies()).map(c => c._cookie), [
    {
      name: 'localhost-cookie',
      value: 'best',
      domain: 'localhost',
      path: '/',
      expires: -1,
      size: 20,
      httpOnly: false,
      secure: false,
      session: true
    }
  ])
  t.deepEqual(
    (await page.cookies(server.CROSS_PROCESS_PREFIX)).map(c => c._cookie),
    [
      {
        name: '127-cookie',
        value: 'worst',
        domain: '127.0.0.1',
        path: '/',
        expires: -1,
        size: 15,
        httpOnly: false,
        secure: false,
        session: true
      }
    ]
  )
})

test.serial('Page.deleteCookie should work', async t => {
  const { page, server } = t.context
  await page.goto(server.EMPTY_PAGE)
  await page.setCookies(
    {
      name: 'cookie1',
      value: '1'
    },
    {
      name: 'cookie2',
      value: '2'
    },
    {
      name: 'cookie3',
      value: '3'
    }
  )
  t.is(
    await page.evaluate('document.cookie'),
    'cookie1=1; cookie2=2; cookie3=3'
  )
  await page.deleteCookie({
    name: 'cookie2'
  })
  t.is(await page.evaluate('document.cookie'), 'cookie1=1; cookie3=3')
})
