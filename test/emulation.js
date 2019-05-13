import test from 'ava'
import * as utils from './helpers/utils'
import { TestHelper } from './helpers/testHelper'

const DeviceDescriptors = utils.requireRoot('DeviceDescriptors')

const iPhone = DeviceDescriptors['iPhone 6']

const iPhoneLandscape = DeviceDescriptors['iPhone 6 landscape']

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

test.serial('Page.viewport should get the proper viewport size', async t => {
  const { page, server } = t.context
  t.deepEqual(page.viewport(), { width: 800, height: 600 })
  await page.setViewport({ width: 123, height: 456 })
  t.deepEqual(page.viewport(), { width: 123, height: 456 })
})

test.serial('Page.viewport should support mobile emulation', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/mobile.html')
  const testResult = await page.evaluate(() => window.innerWidth)
  t.is(testResult, 800)
  await page.setViewport(iPhone.viewport)
  const testResult1 = await page.evaluate(() => window.innerWidth)
  t.is(testResult1, 375)
  await page.setViewport({ width: 400, height: 300 })
  const testResult2 = await page.evaluate(() => window.innerWidth)
  t.is(testResult2, 400)
})

test.serial('Page.viewport should support touch emulation', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/mobile.html')
  const testResult = await page.evaluate(() => 'ontouchstart' in window)
  t.false(testResult)
  await page.setViewport(iPhone.viewport)
  const testResult1 = await page.evaluate(() => 'ontouchstart' in window)
  t.true(testResult1)
  const testResult2 = await page.evaluate(dispatchTouch)
  t.is(testResult2, 'Received touch')
  await page.setViewport({ width: 100, height: 100 })
  const testResult3 = await page.evaluate(() => 'ontouchstart' in window)
  t.false(testResult3)

  function dispatchTouch () {
    let fulfill
    const promise = new Promise(x => (fulfill = x))
    window.ontouchstart = function (e) {
      fulfill('Received touch')
    }
    window.dispatchEvent(new Event('touchstart'))

    fulfill('Did not receive touch')

    return promise
  }
})

test.serial('Page.viewport should be detectable by Modernizr', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/detect-touch.html')
  const testResult = await page.evaluate(() => document.body.textContent.trim())
  t.is(testResult, 'NO')
  await page.setViewport(iPhone.viewport)
  await page.goto(server.PREFIX + '/detect-touch.html')
  const testResult1 = await page.evaluate(() =>
    document.body.textContent.trim()
  )
  t.is(testResult1, 'YES')
})

test.serial(
  'Page.viewport should detect touch when applying viewport with touches',
  async t => {
    const { page, server } = t.context
    await page.setViewport({ width: 800, height: 600, hasTouch: true })
    await page.addScriptTag({ url: server.PREFIX + '/modernizr.js' })
    const testResult = await page.evaluate(() => Modernizr.touchevents)
    t.true(testResult)
  }
)

test.serial('Page.viewport should support landscape emulation', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/mobile.html')
  const testResult = await page.evaluate(() => screen.orientation.type)
  t.is(testResult, 'portrait-primary')
  await page.setViewport(iPhoneLandscape.viewport)
  const testResult1 = await page.evaluate(() => screen.orientation.type)
  t.is(testResult1, 'landscape-primary')
  await page.setViewport({ width: 100, height: 100 })
  const testResult2 = await page.evaluate(() => screen.orientation.type)
  t.is(testResult2, 'portrait-primary')
})

test.serial('Page.emulate should work', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/mobile.html')
  await page.emulate(iPhone)
  const testResult = await page.evaluate(() => window.innerWidth)
  t.is(testResult, 375)
  t.true((await page.evaluate(() => navigator.userAgent)).includes('iPhone'))
})

test.serial('Page.emulate should support clicking', async t => {
  const { page, server } = t.context
  await page.emulate(iPhone)
  await page.goto(server.PREFIX + '/input/button.html')
  const button = await page.$('button')
  await page.evaluate(button => (button.style.marginTop = '200px'), button)
  await button.click()
  const testResult = await page.evaluate(() => result)
  t.is(testResult, 'Clicked')
})

test.serial('Page.emulateMedia should work', async t => {
  const { page, server } = t.context
  const testResult = await page.evaluate(
    () => window.matchMedia('screen').matches
  )
  t.true(testResult)
  const testResult1 = await page.evaluate(
    () => window.matchMedia('print').matches
  )
  t.false(testResult1)
  await page.emulateMedia('print')
  const testResult2 = await page.evaluate(
    () => window.matchMedia('screen').matches
  )
  t.false(testResult2)
  const testResult3 = await page.evaluate(
    () => window.matchMedia('print').matches
  )
  t.true(testResult3)
  await page.emulateMedia(null)
  const testResult4 = await page.evaluate(
    () => window.matchMedia('screen').matches
  )
  t.true(testResult4)
  const testResult5 = await page.evaluate(
    () => window.matchMedia('print').matches
  )
  t.false(testResult5)
})

test.serial(
  'Page.emulateMedia should throw in case of bad argument',
  async t => {
    const { page, server } = t.context
    let error = null
    await page.emulateMedia('bad').catch(e => (error = e))
    t.is(error.message, 'Unsupported media type: bad')
  }
)
