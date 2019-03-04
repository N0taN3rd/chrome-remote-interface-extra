import test from 'ava'
import { TestHelper } from './helpers/testHelper'
import { TimeoutError } from '../lib/Errors'

/** @type {TestHelper} */
let helper

test.serial.before(async t => {
  helper = await TestHelper.withHTTP(t)
})

test.serial.beforeEach(async t => {
  /** @type {Browser} */
  t.context.browser = helper.browser()
})

test.serial.afterEach(async t => {
  await helper.cleanup()
})

test.after.always(async t => {
  await helper.end()
})

test.serial(
  'Browser.version should return whether we are in headless',
  async t => {
    const { browser } = t.context
    const version = await browser.version()
    t.true(version.length > 0)
    t.is(version.startsWith('Headless'), false)
  }
)

test.serial('Browser.userAgent should include WebKit', async t => {
  const { browser } = t.context
  const userAgent = await browser.userAgent()
  t.true(userAgent.length > 0)
  t.true(userAgent.includes('WebKit'))
})

test.serial('Browser.target should return browser target', async t => {
  const { browser } = t.context
  const target = browser.target()
  t.is(target.type(), 'browser')
})

test.serial('Browser.process should return child_process instance', async t => {
  const { browser } = t.context
  const process = await browser.process()
  t.true(process.pid > 0)
})

