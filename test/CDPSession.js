import test from 'ava'
import { waitEvent } from './helpers/utils'
import { TestHelper } from './helpers/testHelper'

/** @type {TestHelper} */
let helper

test.serial.before(async t => {
  helper = await TestHelper.withHTTP(t)
})

test.serial.beforeEach(async t => {
  t.context.page = await helper.newPage()
  t.context.server = helper.server()
})

test.serial.afterEach.always(async t => {
  await helper.cleanup()
})

test.after.always(async t => {
  await helper.end()
})

test.serial('Target.createCDPSession should work', async t => {
  const { page, server } = t.context
  const client = await page.target().createCDPSession()

  await Promise.all([
    client.send('Runtime.enable'),
    client.send('Runtime.evaluate', { expression: 'window.foo = "bar"' })
  ])

  const foo = await page.evaluate(() => window.foo)
  t.is(foo, 'bar')
})

test.serial('Target.createCDPSession should send events', async t => {
  const { page, server } = t.context
  const client = await page.target().createCDPSession()
  await client.send('Network.enable')
  const events = []
  client.on('Network.requestWillBeSent', event => events.push(event))
  await page.goto(server.EMPTY_PAGE)
  t.is(events.length, 1)
})

test.serial(
  'Target.createCDPSession should enable and disable domains independently',
  async t => {
    const { page, server } = t.context
    const client = await page.target().createCDPSession()
    await client.send('Runtime.enable')
    await client.send('Debugger.enable')
    // JS coverage enables and then disables Debugger domain.
    await page.coverage.startJSCoverage()
    await page.coverage.stopJSCoverage()
    // generate a script in page and wait for the event.
    const script = '() => it'
    const [event] = await Promise.all([
      waitEvent(client, 'Debugger.scriptParsed'),
      page.evaluate(script)
    ])

    // expect events to be dispatched.
    t.truthy(event)
  }
)

test.serial(
  'Target.createCDPSession should be able to detach session',
  async t => {
    const { page, server } = t.context
    const client = await page.target().createCDPSession()
    await client.send('Runtime.enable')
    const evalResponse = await client.send('Runtime.evaluate', {
      expression: '1 + 2',
      returnByValue: true
    })
    t.is(evalResponse.result.value, 3)
    await client.detach()
    let error = null

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

test.serial('Target.createCDPSession should throw nice errors', async t => {
  const { page } = t.context
  const client = await page.target().createCDPSession()
  const error = await theSourceOfTheProblems().catch(error => error)
  t.true(error.stack.includes('theSourceOfTheProblems'))
  t.true(error.message.includes('ThisCommand.DoesNotExist'))

  async function theSourceOfTheProblems () {
    await client.send('ThisCommand.DoesNotExist')
  }
})
