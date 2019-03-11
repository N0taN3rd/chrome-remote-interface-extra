import test from 'ava'
import { relativeAssetPath } from './helpers/utils'
import { TestHelper } from './helpers/testHelper'

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

test.serial('input should upload the file', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/input/fileupload.html')
  const filePath = relativeAssetPath('file-to-upload.txt')
  const input = await page.$('input')
  await input.uploadFile(filePath)
  t.is(await page.evaluate(e => e.files[0].name, input), 'file-to-upload.txt')
  t.is(
    await page.evaluate(e => {
      const reader = new FileReader()
      const promise = new Promise(fulfill => (reader.onload = fulfill))
      reader.readAsText(e.files[0])
      return promise.then(() => reader.result)
    }, input),
    'contents of the file'
  )
})
