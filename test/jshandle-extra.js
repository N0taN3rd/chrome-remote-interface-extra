import test from 'ava'
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

test('JSHandle.call - should work for handles to functions', async t => {
  const { page, server } = t.context
  await page.goto(server.EMPTY_PAGE)
  let consoleMsg
  page.on('console', msg => (consoleMsg = msg))
  const fnHandle = await page.evaluateHandle(
    () =>
      function it () {
        console.log('it called')
      }
  )

  await t.notThrowsAsync(fnHandle.call())
  t.truthy(consoleMsg)
  t.is(consoleMsg.text(), 'it called')
})

test('JSHandle.call - should not work for handles to non-functions functions', async t => {
  const { page, server } = t.context
  await page.goto(server.EMPTY_PAGE)
  const fnHandle = await page.evaluateHandle(() => ({}))
  let error
  try {
    fnHandle.call()
  } catch (e) {
    error = e
  }

  t.truthy(error)
  t.is(
    error.message,
    'This JSHandle is not a function it is a object - you must supply a function name to be called'
  )
})

test('JSHandle.callFn - should work for handles with function properties', async t => {
  const { page, server } = t.context
  await page.goto(server.EMPTY_PAGE)
  let consoleMsg
  page.on('console', msg => (consoleMsg = msg))
  const fnHandle = await page.evaluateHandle(() => {
    window.it = function it () {
      console.log('it called')
    }
    return window
  })

  await t.notThrowsAsync(fnHandle.callFn('it'))
  t.truthy(consoleMsg)
  t.is(consoleMsg.text(), 'it called')
})
