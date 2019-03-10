import test from 'ava'
import { TestHelper } from './helpers/testHelper'

/** @type {TestHelper} */
let helper

test.serial.before(async t => {
  /** @type {TestHelper} */
  helper = await TestHelper.withHTTPAndHTTPS(t, true)
})

test.serial.beforeEach(async t => {
  /** @type {Page} */
  t.context.page = await helper.newPage()
  t.context.httpsServer = helper.httpsServer()
  t.context.server = helper.server()
})

test.serial.afterEach.always(async t => {
  await helper.cleanup()
})

test.after.always(async t => {
  await helper.end()
})

test.serial(
  'ignoreHTTPSErrors - Response.securityDetails: should work',
  async t => {
    const { page, httpsServer } = t.context
    const response = await page.goto(httpsServer.EMPTY_PAGE)
    const securityDetails = response.securityDetails()
    t.is(securityDetails.issuer(), 'localhost')
    t.is(securityDetails.protocol(), 'TLS 1.2')
    t.is(securityDetails.subjectName(), 'localhost')
    t.is(securityDetails.validFrom(), 1551718186)
    t.is(securityDetails.validTo(), 1583254186)
  }
)

test.serial(
  'ignoreHTTPSErrors - Response.securityDetails: should be |null| for non-secure requests',
  async t => {
    const { page, server } = t.context
    const response = await page.goto(server.EMPTY_PAGE)
    t.falsy(response.securityDetails())
  }
)

test.serial(
  'ignoreHTTPSErrors - Response.securityDetails: Network redirects should report SecurityDetails',
  async t => {
    const { page, httpsServer } = t.context
    const responses = []
    page.on('response', response => responses.push(response))
    await page.goto(httpsServer.PREFIX + '/plzredirect')
    t.is(responses.length, 2)
    t.is(responses[0].status(), 302)
    const securityDetails = responses[0].securityDetails()
    t.is(securityDetails.protocol(), 'TLS 1.2')
  }
)

test.serial('ignoreHTTPSErrors should work', async t => {
  const { page, httpsServer } = t.context
  let error = null
  const response = await page
    .goto(httpsServer.EMPTY_PAGE)
    .catch(e => (error = e))
  t.falsy(error)
  t.true(response.ok())
})

test.serial(
  'ignoreHTTPSErrors should work with request interception',
  async t => {
    const { page, server, httpsServer } = t.context
    await page.setRequestInterception(true)
    page.on('request', request => request.continue())
    const response = await page.goto(httpsServer.EMPTY_PAGE)
    t.is(response.status(), 200)
  }
)

test.serial('ignoreHTTPSErrors should work with mixed content', async t => {
  const { page, server, httpsServer } = t.context
  await page.goto(httpsServer.PREFIX + '/mixedcontent.html', {
    waitUntil: 'load'
  })
  t.is(page.frames().length, 2) // Make sure blocked iframe has functional execution context
  // @see https://github.com/GoogleChrome/puppeteer/issues/2709

  t.is(await page.frames()[0].evaluate('1 + 2'), 3)
  t.is(await page.frames()[1].evaluate('2 + 3'), 5)
})
