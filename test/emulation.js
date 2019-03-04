import test from 'ava'
import * as utils from './helpers/utils'
import { TestHelper } from './helpers/testHelper'
import { TimeoutError } from '../lib/Errors'

const DeviceDescriptors = utils.requireRoot('DeviceDescriptors')

const iPhone = DeviceDescriptors['iPhone 6']

const iPhoneLandscape = DeviceDescriptors['iPhone 6 landscape']

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

test.serial('Page.viewport should get the proper viewport size', async t => {
  const { page, server } = t.context
  t.deepEqual(page.viewport(), {
    width: 800,
    height: 600
  })
  await page.setViewport({
    width: 123,
    height: 456
  })
  t.deepEqual(page.viewport(), {
    width: 123,
    height: 456
  })
})

test.serial('Page.viewport should support mobile emulation', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/mobile.html')
  t.is(await page.evaluate(() => window.innerWidth), 800)
  await page.setViewport(iPhone.viewport)
  t.is(await page.evaluate(() => window.innerWidth), 375)
  await page.setViewport({
    width: 400,
    height: 300
  })
  t.is(await page.evaluate(() => window.innerWidth), 400)
})

test.serial('Page.viewport should support touch emulation', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/mobile.html')
  t.false(await page.evaluate(() => 'ontouchstart' in window))
  await page.setViewport(iPhone.viewport)
  t.true(await page.evaluate(() => 'ontouchstart' in window))
  t.is(await page.evaluate(dispatchTouch), 'Received touch')
  await page.setViewport({
    width: 100,
    height: 100
  })
  t.false(await page.evaluate(() => 'ontouchstart' in window))

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
  t.is(await page.evaluate(() => document.body.textContent.trim()), 'NO')
  await page.setViewport(iPhone.viewport)
  await page.goto(server.PREFIX + '/detect-touch.html')
  t.is(await page.evaluate(() => document.body.textContent.trim()), 'YES')
})

test.serial(
  'Page.viewport should detect touch when applying viewport with touches',
  async t => {
    const { page, server } = t.context
    await page.setViewport({
      width: 800,
      height: 600,
      hasTouch: true
    })
    await page.addScriptTag({
      url: server.PREFIX + '/modernizr.js'
    })
    t.true(await page.evaluate(() => Modernizr.touchevents))
  }
)

test.serial('Page.viewport should support landscape emulation', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/mobile.html')
  t.is(await page.evaluate(() => screen.orientation.type), 'portrait-primary')
  await page.setViewport(iPhoneLandscape.viewport)
  t.is(await page.evaluate(() => screen.orientation.type), 'landscape-primary')
  await page.setViewport({
    width: 100,
    height: 100
  })
  t.is(await page.evaluate(() => screen.orientation.type), 'portrait-primary')
})

test.serial('Page.emulate should work', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/mobile.html')
  await page.emulate(iPhone)
  t.is(await page.evaluate(() => window.innerWidth), 375)
  t.true((await page.evaluate(() => navigator.userAgent)).includes('iPhone'))
})

test.serial('Page.emulate should support clicking', async t => {
  const { page, server } = t.context
  await page.emulate(iPhone)
  await page.goto(server.PREFIX + '/input/button.html')
  const button = await page.$('button')
  await page.evaluate(button => (button.style.marginTop = '200px'), button)
  await button.click()
  t.is(await page.evaluate(() => result), 'Clicked')
})

test.serial('Page.emulateMedia should work', async t => {
  const { page, server } = t.context
  t.true(await page.evaluate(() => window.matchMedia('screen').matches))
  t.false(await page.evaluate(() => window.matchMedia('print').matches))
  await page.emulateMedia('print')
  t.false(await page.evaluate(() => window.matchMedia('screen').matches))
  t.true(await page.evaluate(() => window.matchMedia('print').matches))
  await page.emulateMedia(null)
  t.true(await page.evaluate(() => window.matchMedia('screen').matches))
  t.false(await page.evaluate(() => window.matchMedia('print').matches))
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
