import test from 'ava'
import { TestHelper } from './helpers/testHelper'
import { requireRoot } from './helpers/utils'
import { TimeoutError } from '../lib/Errors'

const DeviceDescriptors = requireRoot('DeviceDescriptors.js')

const iPhone = DeviceDescriptors['iPhone 6']

/** @type {TestHelper} */
let helper

test.serial.before(async t => {
  helper = await TestHelper.withHTTP(t)
})

test.serial.beforeEach(async t => {
  /** @type {Page} */
  t.context.page = await helper.newPage()
  t.context.server = helper.server()
})

test.serial.afterEach.always(async t => {
  await helper.cleanup()
})

test.after.always(async t => {
  await helper.end()
})

test.serial('Touchscreen should tap the button', async t => {
  const { page, server } = t.context
  await page.emulate(iPhone)
  await page.goto(server.PREFIX + '/input/button.html')
  await page.tap('button')
  t.is(await page.evaluate(() => result), 'Clicked')
})

test.serial('Touchscreen should report touches', async t => {
  const { page, server } = t.context
  await page.emulate(iPhone)
  await page.goto(server.PREFIX + '/input/touches.html')
  const button = await page.$('button')
  await button.tap()
  t.deepEqual(await page.evaluate(() => getResult()), [
    'Touchstart: 0',
    'Touchend: 0'
  ])
})
