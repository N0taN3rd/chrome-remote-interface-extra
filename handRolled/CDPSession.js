import test from 'ava'
import { TestHelper, waitEvent } from '../test/helpers'

/** @type {TestHelper} */
let helper

test.before(async t => {
  helper = await TestHelper.withHTTP(t)
})

test.serial.beforeEach(async t => {
  t.context.page = await helper.newPage()
  t.context.server = helper.server()
})

test.serial.afterEach(async t => {
  await helper.cleanup()
})

test.after.always(async t => {
  await helper.end()
})

test.serial('Target.createCDPSession: should work', async t => {
  const { page } = t.context
  const client = await page.target().createCDPSession()
  await Promise.all([
    client.send('Runtime.enable'),
    client.send('Runtime.evaluate', { expression: 'window.foo = "bar"' })
  ])
  t.is(await page.evaluate(() => window.foo), 'bar')
})

test.serial('Target.createCDPSession: should send events', async t => {
  const { page, server } = t.context
  const client = await page.target().createCDPSession()
  await client.send('Network.enable')
  const events = []
  client.on('Network.requestWillBeSent', event => events.push(event))
  await page.goto(server.EMPTY_PAGE)
  t.is(events.length, 1)
})

test.serial(
  'Target.createCDPSession: should enable and disable domains independently',
  async t => {
    const { page } = t.context
    const client = await page.target().createCDPSession()
    await Promise.all([
      client.send('Runtime.enable'),
      client.send('Debugger.enable')
    ])
    // JS coverage enables and then disables Debugger domain.
    await page.coverage.startJSCoverage()
    await page.coverage.stopJSCoverage()
    // generate a script in page and wait for the event.
    const [event] = await Promise.all([
      waitEvent(client, 'Debugger.scriptParsed'),
      page.evaluate('//# sourceURL=foo.js')
    ])
    t.is(event.url, 'foo.js')
  }
)

test.serial(
  'Target.createCDPSession: should be able to detach session',
  async t => {
    const { page } = t.context
    const client = await page.target().createCDPSession()
    await client.send('Runtime.enable')
    const evalResponse = await client.send('Runtime.evaluate', {
      expression: '1 + 2',
      returnByValue: true
    })
    t.is(evalResponse.result.value, 3)
    await client.detach()
    let error
    try {
      await client.send('Runtime.evaluate', {
        expression: '3 + 1',
        returnByValue: true
      })
    } catch (e) {
      error = e
    }
    t.true(error.message.includes('Session closed.'))
  }
)
