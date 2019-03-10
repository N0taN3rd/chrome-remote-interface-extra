import test from 'ava'
import * as utils from './helpers/utils'
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

test.serial.afterEach.always(async t => {
  await helper.cleanup()
})

test.after.always(async t => {
  await helper.end()
})

test.serial('Frame.executionContext should work', async t => {
  const { page, server } = t.context
  await page.goto(server.EMPTY_PAGE)
  await utils.attachFrame(page, 'frame1', server.EMPTY_PAGE)
  t.is(page.frames().length, 2)
  const [frame1, frame2] = page.frames()
  const context1 = await frame1.executionContext()
  const context2 = await frame2.executionContext()
  t.truthy(context1)
  t.truthy(context2)
  t.truthy(context1 !== context2)
  t.is(context1.frame(), frame1)
  t.is(context2.frame(), frame2)
  await Promise.all([
    context1.evaluate(() => (window.a = 1)),
    context2.evaluate(() => (window.a = 2))
  ])
  const [a1, a2] = await Promise.all([
    context1.evaluate(() => window.a),
    context2.evaluate(() => window.a)
  ])
  t.is(a1, 1)
  t.is(a2, 2)
})

test.serial('Frame.evaluateHandle should work', async t => {
  const { page, server } = t.context
  await page.goto(server.EMPTY_PAGE)
  const mainFrame = page.mainFrame()
  const windowHandle = await mainFrame.evaluateHandle(() => window)
  t.truthy(windowHandle)
})

test.serial('Frame.evaluate should throw for detached frames', async t => {
  const { page, server } = t.context
  const frame1 = await utils.attachFrame(page, 'frame1', server.EMPTY_PAGE)
  await utils.detachFrame(page, 'frame1')
  let error = null
  await frame1.evaluate(() => 7 * 8).catch(e => (error = e))
  t.true(
    error.message.includes(
      'Execution Context is not available in detached frame'
    )
  )
})

test.serial('Frame Management should handle nested frames', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/frames/nested-frames.html')
  t.deepEqual(utils.dumpFrames(page.mainFrame()), [
    'http://localhost:<PORT>/frames/nested-frames.html',
    '    http://localhost:<PORT>/frames/two-frames.html (2frames)',
    '        http://localhost:<PORT>/frames/frame.html (uno)',
    '        http://localhost:<PORT>/frames/frame.html (dos)',
    '    http://localhost:<PORT>/frames/frame.html (aframe)'
  ])
})

test.serial(
  'Frame Management should send events when frames are manipulated dynamically',
  async t => {
    const { page, server } = t.context
    await page.goto(server.EMPTY_PAGE) // validate frameattached events

    const attachedFrames = []
    page.on('frameattached', frame => attachedFrames.push(frame))
    await utils.attachFrame(page, 'frame1', './assets/frame.html')
    t.is(attachedFrames.length, 1)
    t.true(attachedFrames[0].url().includes('/assets/frame.html')) // validate framenavigated events

    const navigatedFrames = []
    page.on('framenavigated', frame => navigatedFrames.push(frame))
    await utils.navigateFrame(page, 'frame1', './empty.html')
    t.is(navigatedFrames.length, 1)
    t.is(navigatedFrames[0].url(), server.EMPTY_PAGE) // validate framedetached events

    const detachedFrames = []
    page.on('framedetached', frame => detachedFrames.push(frame))
    await utils.detachFrame(page, 'frame1')
    t.is(detachedFrames.length, 1)
    t.true(detachedFrames[0].isDetached())
  }
)

test.serial(
  'Frame Management should send "framenavigated" when navigating on anchor URLs',
  async t => {
    const { page, server } = t.context
    await page.goto(server.EMPTY_PAGE)
    await Promise.all([
      page.goto(server.EMPTY_PAGE + '#foo'),
      utils.waitEvent(page, 'framenavigated')
    ])
    t.is(page.url(), server.EMPTY_PAGE + '#foo')
  }
)

test.serial(
  'Frame Management should persist mainFrame on cross-process navigation',
  async t => {
    const { page, server } = t.context
    await page.goto(server.EMPTY_PAGE)
    const mainFrame = page.mainFrame()
    await page.goto(server.CROSS_PROCESS_PREFIX + '/empty.html')
    t.truthy(page.mainFrame() === mainFrame)
  }
)

test.serial(
  'Frame Management should not send attach/detach events for main frame',
  async t => {
    const { page, server } = t.context
    let hasEvents = false
    page.on('frameattached', frame => (hasEvents = true))
    page.on('framedetached', frame => (hasEvents = true))
    await page.goto(server.EMPTY_PAGE)
    t.false(hasEvents)
  }
)

test.serial(
  'Frame Management should detach child frames on navigation',
  async t => {
    const { page, server } = t.context
    let attachedFrames = []
    let detachedFrames = []
    let navigatedFrames = []
    page.on('frameattached', frame => attachedFrames.push(frame))
    page.on('framedetached', frame => detachedFrames.push(frame))
    page.on('framenavigated', frame => navigatedFrames.push(frame))
    await page.goto(server.PREFIX + '/frames/nested-frames.html')
    t.is(attachedFrames.length, 4)
    t.is(detachedFrames.length, 0)
    t.is(navigatedFrames.length, 5)
    attachedFrames = []
    detachedFrames = []
    navigatedFrames = []
    await page.goto(server.EMPTY_PAGE)
    t.is(attachedFrames.length, 0)
    t.is(detachedFrames.length, 4)
    t.is(navigatedFrames.length, 1)
  }
)

test.serial('Frame Management should support framesets', async t => {
  const { page, server } = t.context
  let attachedFrames = []
  let detachedFrames = []
  let navigatedFrames = []
  page.on('frameattached', frame => attachedFrames.push(frame))
  page.on('framedetached', frame => detachedFrames.push(frame))
  page.on('framenavigated', frame => navigatedFrames.push(frame))
  await page.goto(server.PREFIX + '/frames/frameset.html')
  t.is(attachedFrames.length, 4)
  t.is(detachedFrames.length, 0)
  t.is(navigatedFrames.length, 5)
  attachedFrames = []
  detachedFrames = []
  navigatedFrames = []
  await page.goto(server.EMPTY_PAGE)
  t.is(attachedFrames.length, 0)
  t.is(detachedFrames.length, 4)
  t.is(navigatedFrames.length, 1)
})

test.serial('Frame Management should report frame.name()', async t => {
  const { page, server } = t.context
  await utils.attachFrame(page, 'theFrameId', server.EMPTY_PAGE)
  await page.evaluate(url => {
    const frame = document.createElement('iframe')
    frame.name = 'theFrameName'
    frame.src = url
    document.body.appendChild(frame)
    return new Promise(x => (frame.onload = x))
  }, server.EMPTY_PAGE)
  t.is(page.frames()[0].name(), '')
  t.is(page.frames()[1].name(), 'theFrameId')
  t.is(page.frames()[2].name(), 'theFrameName')
})

test.serial('Frame Management should report frame.parent()', async t => {
  const { page, server } = t.context
  await utils.attachFrame(page, 'frame1', server.EMPTY_PAGE)
  await utils.attachFrame(page, 'frame2', server.EMPTY_PAGE)
  t.falsy(page.frames()[0].parentFrame())
  t.is(page.frames()[1].parentFrame(), page.mainFrame())
  t.is(page.frames()[2].parentFrame(), page.mainFrame())
})

test.serial(
  'Frame Management should report different frame instance when frame re-attaches',
  async t => {
    const { page, server } = t.context
    const frame1 = await utils.attachFrame(page, 'frame1', server.EMPTY_PAGE)
    await page.evaluate(() => {
      window.frame = document.querySelector('#frame1')
      window.frame.remove()
    })
    t.true(frame1.isDetached())
    const [frame2] = await Promise.all([
      utils.waitEvent(page, 'frameattached'),
      page.evaluate(() => document.body.appendChild(window.frame))
    ])
    t.false(frame2.isDetached())
    t.true(frame1 != frame2)
  }
)
