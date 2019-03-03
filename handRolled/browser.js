import test from 'ava'
import { TestHelper } from '../test/helpers'

/** @type {TestHelper} */
let helper

test.before(async t => {
  helper = await TestHelper.withHTTP(t)
  t.context.browser = helper.browser()
})

test.after.always(async t => {
  await helper.end()
})

test('Browser.target: should return browser target', async t => {
  const target = t.context.browser.target()
  t.is(target.type(), 'brower')
  t.true(target.isBrowserTarget())
})
