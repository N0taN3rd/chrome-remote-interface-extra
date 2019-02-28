import test from 'ava'
import initServer from './helpers/initServer'
import initChrome from './helpers/initChrome'
import { CRIExtra, Browser } from '../'

const testDomains = {
  workers: true,
  coverage: true,
  console: true,
  log: true,
  performance: true
}

test.before(async t => {
  const killChrome = await initChrome()
  const { server, httpsServer } = await initServer()

  const client = await CRIExtra()
  const browser = await Browser.create(client, {
    ignoreHTTPSErrors: true,
    additionalDomains: testDomains
  })
  const page = await browser.newPage()

  /**
   *
   * @type {{server: fastify.FastifyInstance, httpsServer: fastify.FastifyInstance, client: CRIConnection, page: Page, killChrome: (function(): void)}}
   */
  t.context = {
    server,
    httpsServer,
    killChrome,
    page,
    client
  }
})

test('Target.createCDPSession should work', async t => {
  const { page } = t.context
  const client = await page.target().createCDPSession()
  await Promise.all([
    client.send('Runtime.enable'),
    client.send('Runtime.evaluate', { expression: 'window.foo = "bar"' })
  ])
  t.is(await page.evaluate(() => window.foo), 'bar')
})

test('Target.createCDPSession should enable and disable domains independently', async t => {
  const { page } = t.context
  const client = await page.target().createCDPSession()

  await client.send('Runtime.enable')
  await client.send('Debugger.enable')
  // JS coverage enables and then disables Debugger domain.
  await page.coverage.startJSCoverage()
  await page.coverage.stopJSCoverage()
  // generate a script in page and wait for the event.
  const [event] = await Promise.all([
    waitEvent(client, 'Debugger.scriptParsed'),
    page.evaluate('//# sourceURL=foo.js')
  ])
  t.is(await page.evaluate(() => window.foo), 'bar')
})

test.after.always(async t => {
  await t.context.server.stop()
  await t.context.httpsServer.stop()
  await t.context.page.close()
  t.context.killChrome()
})
