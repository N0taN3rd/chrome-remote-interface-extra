import test from 'ava'
import { TestHelper } from './helpers/testHelper'

function dimensions () {
  const rect = document.querySelector('textarea').getBoundingClientRect()
  return {
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height
  }
}

/** @type {TestHelper} */
let helper

test.serial.before(async t => {
  helper = await TestHelper.withHTTPAndHTTPS(t)
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

test.serial('Mouse should click the document', async t => {
  const { page, server } = t.context
  await page.evaluate(() => {
    window.clickPromise = new Promise(resolve => {
      document.addEventListener('click', event => {
        resolve({
          type: event.type,
          detail: event.detail,
          clientX: event.clientX,
          clientY: event.clientY,
          isTrusted: event.isTrusted,
          button: event.button
        })
      })
    })
  })
  await page.mouse.click(50, 60)
  const event = await page.evaluate(() => window.clickPromise)
  t.is(event.type, 'click')
  t.is(event.detail, 1)
  t.is(event.clientX, 50)
  t.is(event.clientY, 60)
  t.true(event.isTrusted)
  t.is(event.button, 0)
})

test.serial('Mouse should resize the textarea', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/input/textarea.html')
  const { x, y, width, height } = await page.evaluate(dimensions)
  const mouse = page.mouse
  await mouse.move(x + width - 4, y + height - 4)
  await mouse.down()
  await mouse.move(x + width + 100, y + height + 100)
  await mouse.up()
  const newDimensions = await page.evaluate(dimensions)
  t.is(newDimensions.width, Math.round(width + 104))
  t.is(newDimensions.height, Math.round(height + 104))
})

test.serial('Mouse should select the text with mouse', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/input/textarea.html')
  await page.focus('textarea')
  const text =
    "This is the text that we are going to try to select. Let's see how it goes."
  await page.keyboard.type(text)
  // Firefox needs an extra frame here after typing or it will fail to set the scrollTop
  await page.evaluate(() => new Promise(requestAnimationFrame))
  await page.evaluate(() => (document.querySelector('textarea').scrollTop = 0))
  const { x, y } = await page.evaluate(dimensions)
  await page.mouse.move(x + 2, y + 2)
  await page.mouse.down()
  await page.mouse.move(100, 100)
  await page.mouse.up()
  const testResult = await page.evaluate(() => {
    const textarea = document.querySelector('textarea')
    return textarea.value.substring(
      textarea.selectionStart,
      textarea.selectionEnd
    )
  })
  t.is(testResult, text)
})

test.serial('Mouse should trigger hover state', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/input/scrollable.html')
  await page.hover('#button-6')
  const testResult = await page.evaluate(
    () => document.querySelector('button:hover').id
  )
  t.is(testResult, 'button-6')

  await page.hover('#button-2')
  const testResult1 = await page.evaluate(
    () => document.querySelector('button:hover').id
  )
  t.is(testResult1, 'button-2')

  await page.hover('#button-91')
  const testResult2 = await page.evaluate(
    () => document.querySelector('button:hover').id
  )
  t.is(testResult2, 'button-91')
})

test.serial(
  'Mouse should trigger hover state with removed window.Node',
  async t => {
    const { page, server } = t.context
    await page.goto(server.PREFIX + '/input/scrollable.html')
    await page.evaluate(() => delete window.Node)
    await page.hover('#button-6')
    const testResult = await page.evaluate(
      () => document.querySelector('button:hover').id
    )
    t.is(testResult, 'button-6')
  }
)

test.serial('Mouse should set modifier keys on click', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/input/scrollable.html')
  await page.evaluate(() =>
    document
      .querySelector('#button-3')
      .addEventListener('mousedown', e => (window.lastEvent = e), true)
  )

  const modifiers = {
    Shift: 'shiftKey',
    Control: 'ctrlKey',
    Alt: 'altKey',
    Meta: 'metaKey'

    // In Firefox, the Meta modifier only exists on Mac
  }
  for (const modifier in modifiers) {
    await page.keyboard.down(modifier)
    await page.click('#button-3')
    if (
      !(await page.evaluate(mod => window.lastEvent[mod], modifiers[modifier]))
    )
      throw new Error(modifiers[modifier] + ' should be true')
    await page.keyboard.up(modifier)
  }

  await page.click('#button-3')

  for (const modifier in modifiers) {
    if (await page.evaluate(mod => window.lastEvent[mod], modifiers[modifier]))
      throw new Error(modifiers[modifier] + ' should be false')
  }

  t.pass()
})

test.serial('Mouse should tween mouse movement', async t => {
  const { page, server } = t.context
  await page.mouse.move(100, 100)
  await page.evaluate(() => {
    window.result = []
    document.addEventListener('mousemove', event => {
      window.result.push([event.clientX, event.clientY])
    })
  })
  await page.mouse.move(200, 300, { steps: 5 })
  const testResult = await page.evaluate('result')
  t.deepEqual(testResult, [
    [120, 140],
    [140, 180],
    [160, 220],
    [180, 260],
    [200, 300]
  ])
})

test.serial(
  'Mouse should work with mobile viewports and cross process navigations',
  async t => {
    const { page, server } = t.context
    await page.goto(server.EMPTY_PAGE)
    await page.setViewport({ width: 360, height: 640, isMobile: true })
    await page.goto(server.CROSS_PROCESS_PREFIX + '/mobile.html')
    await page.evaluate(() => {
      document.addEventListener('click', event => {
        window.result = { x: event.clientX, y: event.clientY }
      })
    })

    await page.mouse.click(30, 40)
    const testResult = await page.evaluate('result')
    t.deepEqual(testResult, { x: 30, y: 40 })
  }
)
