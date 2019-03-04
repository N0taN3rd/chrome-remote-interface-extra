import test from 'ava'
import { TestHelper } from './helpers/testHelper'
import { TimeoutError } from '../lib/Errors'

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

test.serial.afterEach(async t => {
  await helper.cleanup()
})

test.after.always(async t => {
  await helper.end()
})

test.serial('Page.Events.Dialog should fire', async t => {
  const { page, server } = t.context
  page.on('dialog', dialog => {
    t.is(dialog.type(), 'alert')
    t.is(dialog.defaultValue(), '')
    t.is(dialog.message(), 'yo')
    dialog.accept()
  })
  await page.evaluate(() => alert('yo'))
})

test.serial('Page.Events.Dialog should allow accepting prompts', async t => {
  const { page, server } = t.context
  page.on('dialog', dialog => {
    t.is(dialog.type(), 'prompt')
    t.is(dialog.defaultValue(), 'yes.')
    t.is(dialog.message(), 'question?')
    dialog.accept('answer!')
  })
  const result = await page.evaluate(() => prompt('question?', 'yes.'))
  t.is(result, 'answer!')
})

test.serial('Page.Events.Dialog should dismiss the prompt', async t => {
  const { page, server } = t.context
  page.on('dialog', dialog => {
    dialog.dismiss()
  })
  const result = await page.evaluate(() => prompt('question?'))
  t.falsy(result)
})
