import test from 'ava'
import * as utils from './helpers/utils'
import { TestHelper } from './helpers/testHelper'

const DeviceDescriptors = utils.requireRoot('DeviceDescriptors')

const iPhone = DeviceDescriptors['iPhone 6']

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

test.serial('Page.click should click the button', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/input/button.html')
  await page.click('button')
  const testResult = await page.evaluate(() => result)
  t.is(testResult, 'Clicked')
})

test.serial(
  'Page.click should click the button if window.Node is removed',
  async t => {
    const { page, server } = t.context
    await page.goto(server.PREFIX + '/input/button.html')
    await page.evaluate(() => delete window.Node)
    await page.click('button')
    const testResult = await page.evaluate(() => result)
    t.is(testResult, 'Clicked')
  }
)

test.serial(
  'Page.click should click on a span with an inline element inside',
  async t => {
    const { page, server } = t.context
    await page.setContent(`
        <style>
        span::before {
          content: 'q';
        }
        </style>
        <span onclick='javascript:window.CLICKED=42'></span>
      `)
    await page.click('span')
    const testResult = await page.evaluate(() => window.CLICKED)
    t.is(testResult, 42)
  }
)

test.serial('Page.click should click the button after navigation ', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/input/button.html')
  await page.click('button')
  await page.goto(server.PREFIX + '/input/button.html')
  await page.click('button')
  const testResult = await page.evaluate(() => result)
  t.is(testResult, 'Clicked')
})

test.serial('Page.click should click with disabled javascript', async t => {
  const { page, server } = t.context
  await page.setJavaScriptEnabled(false)
  await page.goto(server.PREFIX + '/wrappedlink.html')
  await Promise.all([page.click('a'), page.waitForNavigation()])
  t.is(page.url(), server.PREFIX + '/wrappedlink.html#clicked')
})

test.serial(
  'Page.click should click when one of inline box children is outside of viewport',
  async t => {
    const { page, server } = t.context
    await page.setContent(`
        <style>
        i {
          position: absolute;
          top: -1000px;
        }
        </style>
        <span onclick='javascript:window.CLICKED = 42;'><i>woof</i><b>doggo</b></span>
      `)
    await page.click('span')
    const testResult = await page.evaluate(() => window.CLICKED)
    t.is(testResult, 42)
  }
)

test.serial('Page.click should select the text by triple clicking', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/input/textarea.html')
  await page.focus('textarea')
  const text =
    "This is the text that we are going to try to select. Let's see how it goes."
  await page.keyboard.type(text)
  await page.click('textarea')
  await page.click('textarea', { clickCount: 2 })
  await page.click('textarea', { clickCount: 3 })
  const testResult = await page.evaluate(() => {
    const textarea = document.querySelector('textarea')
    return textarea.value.substring(
      textarea.selectionStart,
      textarea.selectionEnd
    )
  })
  t.is(testResult, text)
})

test.serial('Page.click should click offscreen buttons', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/offscreenbuttons.html')
  const messages = []
  page.on('console', msg => messages.push(msg.text()))
  for (let i = 0; i < 11; ++i) {
    // We might've scrolled to click a button - reset to (0, 0).
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.click(`#btn${i}`)
  }
  t.deepEqual(messages, [
    'button #0 clicked',
    'button #1 clicked',
    'button #2 clicked',
    'button #3 clicked',
    'button #4 clicked',
    'button #5 clicked',
    'button #6 clicked',
    'button #7 clicked',
    'button #8 clicked',
    'button #9 clicked',
    'button #10 clicked'
  ])
})

test.serial('Page.click should click wrapped links', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/wrappedlink.html')
  await page.click('a')
  const testResult = await page.evaluate(() => window.__clicked)
  t.true(testResult)
})

test.serial('Page.click should click on checkbox input and toggle', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/input/checkbox.html')
  const testResult = await page.evaluate(() => result.check)
  t.falsy(testResult)
  await page.click('input#agree')
  const testResult1 = await page.evaluate(() => result.check)
  t.true(testResult1)
  const testResult2 = await page.evaluate(() => result.events)
  t.deepEqual(testResult2, [
    'mouseover',
    'mouseenter',
    'mousemove',
    'mousedown',
    'mouseup',
    'click',
    'input',
    'change'
  ])

  await page.click('input#agree')
  const testResult3 = await page.evaluate(() => result.check)
  t.false(testResult3)
})

test.serial('Page.click should click on checkbox label and toggle', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/input/checkbox.html')
  const testResult = await page.evaluate(() => result.check)
  t.falsy(testResult)
  await page.click('label[for="agree"]')
  const testResult1 = await page.evaluate(() => result.check)
  t.true(testResult1)
  const testResult2 = await page.evaluate(() => result.events)
  t.deepEqual(testResult2, ['click', 'input', 'change'])

  await page.click('label[for="agree"]')
  const testResult3 = await page.evaluate(() => result.check)
  t.false(testResult3)
})

test.serial('Page.click should fail to click a missing button', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/input/button.html')
  let error = null
  await page.click('button.does-not-exist').catch(e => (error = e))
  t.is(error.message, 'No node found for selector: button.does-not-exist')
})

test.serial(
  'Page.click should not hang with touch-enabled viewports',
  async t => {
    const { page, server } = t.context
    await page.setViewport(iPhone.viewport)
    await page.mouse.down()
    await page.mouse.move(100, 10)
    await page.mouse.up()
    t.pass()
  }
)

test.serial('Page.click should scroll and click the button', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/input/scrollable.html')
  await page.click('#button-5')
  const testResult = await page.evaluate(
    () => document.querySelector('#button-5').textContent
  )
  t.is(testResult, 'clicked')

  await page.click('#button-80')
  const testResult1 = await page.evaluate(
    () => document.querySelector('#button-80').textContent
  )
  t.is(testResult1, 'clicked')
})

test.serial('Page.click should double click the button', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/input/button.html')
  await page.evaluate(() => {
    window.double = false
    const button = document.querySelector('button')
    button.addEventListener('dblclick', event => {
      window.double = true
    })
  })
  const button = await page.$('button')
  await button.click({ clickCount: 2 })
  const testResult = await page.evaluate('double')
  t.true(testResult)
  const testResult1 = await page.evaluate('result')
  t.is(testResult1, 'Clicked')
})

test.serial('Page.click should click a partially obscured button', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/input/button.html')
  await page.evaluate(() => {
    const button = document.querySelector('button')
    button.textContent = 'Some really long text that will go offscreen'
    button.style.position = 'absolute'
    button.style.left = '368px'
  })
  await page.click('button')
  const testResult = await page.evaluate(() => window.result)
  t.is(testResult, 'Clicked')
})

test.serial('Page.click should click a rotated button', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/input/rotatedButton.html')
  await page.click('button')
  const testResult = await page.evaluate(() => result)
  t.is(testResult, 'Clicked')
})

test.serial(
  'Page.click should fire contextmenu event on right click',
  async t => {
    const { page, server } = t.context
    await page.goto(server.PREFIX + '/input/scrollable.html')
    await page.click('#button-8', { button: 'right' })
    const testResult = await page.evaluate(
      () => document.querySelector('#button-8').textContent
    )
    t.is(
      testResult,

      'context menu'
    )
  }
)

test.serial('Page.click should click links which cause navigation', async t => {
  const { page, server } = t.context
  await page.setContent(`<a href="${server.EMPTY_PAGE}">empty.html</a>`)
  // This await should not hang.
  await page.click('a')
  t.pass()
})

test.serial('Page.click should click the button inside an iframe', async t => {
  const { page, server } = t.context
  await page.goto(server.EMPTY_PAGE)
  await page.setContent('<div style="width:100px;height:100px">spacer</div>')
  await utils.attachFrame(
    page,
    'button-test',
    server.PREFIX + '/input/button.html'
  )

  const frame = page.frames()[1]
  const button = await frame.$('button')
  await button.click()
  const testResult = await frame.evaluate(() => window.result)
  t.is(testResult, 'Clicked')
})

test.serial.failing(
  'Page.click should click the button with fixed position inside an iframe',
  async t => {
    const { page, server } = t.context
    await page.goto(server.EMPTY_PAGE)
    await page.setViewport({ width: 500, height: 500 })
    await page.setContent('<div style="width:100px;height:2000px">spacer</div>')
    await utils.attachFrame(
      page,
      'button-test',
      server.CROSS_PROCESS_PREFIX + '/input/button.html'
    )

    const frame = page.frames()[1]
    // await (await page.getElementById('button-test')).scrollIntoView()
    await frame.$eval('button', button =>
      button.style.setProperty('position', 'fixed')
    )

    await frame.click('button')
    const testResult = await frame.evaluate(() => window.result)
    t.is(testResult, 'Clicked')
  }
)

test.serial(
  'Page.click should click the button with deviceScaleFactor set',
  async t => {
    const { page, server } = t.context
    await page.setViewport({ width: 400, height: 400, deviceScaleFactor: 5 })
    const testResult = await page.evaluate(() => window.devicePixelRatio)
    t.is(testResult, 5)
    await page.setContent('<div style="width:100px;height:100px">spacer</div>')
    await utils.attachFrame(
      page,
      'button-test',
      server.PREFIX + '/input/button.html'
    )

    const frame = page.frames()[1]
    const button = await frame.$('button')
    await button.click()
    const testResult1 = await frame.evaluate(() => window.result)
    t.is(testResult1, 'Clicked')
  }
)
