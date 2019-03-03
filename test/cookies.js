import test from 'ava'
import TestHelper from './helpers/testHelper'
import { TimeoutError } from '../lib/Errors'

/** @type {TestHelper} */
let helper

test.before(async t => {
  helper = await TestHelper.withHTTP(t)
})

test.serial.beforeEach(async t => {
  /** @type {Page} */
  t.context.page = await helper.newPage()
  t.context.server = helper.server()
})

test.serial.afterEach(async t => {
  await helper.deepClean()
})

test.serial.after.always(async t => {
  await helper.end()
})

test.serial('Cookies should set and get cookies', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/grid.html')
  t.deepEqual(await page.cookies(), [])
  await page.evaluate(() => {
    document.cookie = 'username=John Doe'
  })
  let cookies = await page.cookies()
  t.deepEqual(cookies.map(c => c._cookie), [
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
  await page.setCookie({
    name: 'password',
    value: '123456'
  })
  t.is(
    await page.evaluate('document.cookie'),
    'username=John Doe; password=123456'
  )
  cookies = await page.cookies()
  t.deepEqual(
    cookies.map(c => c._cookie).sort((a, b) => a.name.localeCompare(b.name)),
    [
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
    ]
  )
})

test.serial('Cookies should set a cookie with a path', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/grid.html')
  await page.setCookie({
    name: 'gridcookie',
    value: 'GRID',
    path: '/grid.html'
  })
  const cookies = await page.cookies()
  t.deepEqual(cookies.map(c => c._cookie), [
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
  await page.goto(server.PREFIX + '/empty.html')
  t.deepEqual(await page.cookies(), [])
  t.is(await page.evaluate('document.cookie'), '')
  await page.goto(server.PREFIX + '/grid.html')
  t.is(await page.evaluate('document.cookie'), 'gridcookie=GRID')
})

test.serial('Cookies should delete a cookie', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/grid.html')
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

test.serial('Cookies should not set a cookie on a blank page', async t => {
  const { page } = t.context
  let error = null
  await page.goto('about:blank')

  try {
    await page.setCookie({
      name: 'example-cookie',
      value: 'best'
    })
  } catch (e) {
    error = e
  }

  t.truthy(error)
  t.deepEqual(
    error.message,
    'Protocol error (Network.deleteCookies): At least one of the url and domain needs to be specified'
  )
})

test.serial('Cookies should not set a cookie with blank page URL', async t => {
  const { page, server } = t.context
  let error = null
  await page.goto(server.PREFIX + '/grid.html')

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

  t.truthy(error)
  t.deepEqual(
    error.message,
    `Blank page can not have cookie "example-cookie-blank"`
  )
})

test.serial('Cookies should not set a cookie on a data URL page', async t => {
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

  t.truthy(error)
  t.deepEqual(
    error.message,
    'Protocol error (Network.deleteCookies): At least one of the url and domain needs to be specified'
  )
})

test.serial('Cookies should set a cookie on a different domain', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/grid.html')
  await page.setCookie({
    name: 'example-cookie',
    value: 'best',
    url: 'https://www.example.com'
  })
  t.is(await page.evaluate('document.cookie'), '')
  t.deepEqual(await page.cookies(), [])
  const cookies = await page.cookies('https://www.example.com')
  t.deepEqual(cookies.map(c => c._cookie), [
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
  ])
})

test.serial('Cookies should set cookies from a frame', async t => {
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
  }, server.CROSS_PROCESS_PREFIX)
  await page.setCookie({
    name: '127-cookie',
    value: 'worst',
    url: server.CROSS_PROCESS_PREFIX
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
  t.deepEqual((await page.cookies(server.CROSS_PROCESS_PREFIX)).map(c => c._cookie), [
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
  ])
})
