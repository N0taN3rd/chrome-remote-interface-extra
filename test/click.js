import test from 'ava'
import * as utils from './helpers/utils'
import TestHelper from './helpers/testHelper'
import { TimeoutError } from '../lib/Errors'

const DeviceDescriptors = utils.requireRoot('DeviceDescriptors')

const iPhone = DeviceDescriptors['iPhone 6']

/** @type {TestHelper} */
let helper

test.before(async t => {
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

test.serial('Page.click should click the button', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/input/button.html')
  await page.click('button')
  t.is(await page.evaluate(() => result), 'Clicked')
})

test.serial(
  'Page.click should click the button if window.Node is removed',
  async t => {
    const { page, server } = t.context
    await page.goto(server.PREFIX + '/input/button.html')
    await page.evaluate(() => delete window.Node)
    await page.click('button')
    t.is(await page.evaluate(() => result), 'Clicked')
  }
)

test.serial('Page.click should click the button after navigation ', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/input/button.html')
  await page.click('button')
  await page.goto(server.PREFIX + '/input/button.html')
  await page.click('button')
  t.is(await page.evaluate(() => result), 'Clicked')
})

test.serial('Page.click should click with disabled javascript', async t => {
  const { page, server } = t.context
  await page.setJavaScriptEnabled(false)
  await page.goto(server.PREFIX + '/wrappedlink.html')
  await Promise.all([page.click('a'), page.waitForNavigation()])
  t.is(page.url(), server.PREFIX + '/wrappedlink.html#clicked')
})

test.serial('Page.click should select the text by triple clicking', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/input/textarea.html')
  await page.focus('textarea')
  const text =
    "This is the text that we are going to try to select. Let's see how it goes."
  await page.keyboard.type(text)
  await page.click('textarea')
  await page.click('textarea', {
    clickCount: 2
  })
  await page.click('textarea', {
    clickCount: 3
  })
  t.is(
    await page.evaluate(() => {
      const textarea = document.querySelector('textarea')
      return textarea.value.substring(
        textarea.selectionStart,
        textarea.selectionEnd
      )
    }),
    text
  )
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
  t.true(await page.evaluate(() => window.__clicked))
})

test.serial('Page.click should click on checkbox input and toggle', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/input/checkbox.html')
  t.is(await page.evaluate(() => result.check), null)
  await page.click('input#agree')
  t.true(await page.evaluate(() => result.check))
  t.deepEqual(await page.evaluate(() => result.events), [
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
  t.false(await page.evaluate(() => result.check))
})

test.serial('Page.click should click on checkbox label and toggle', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/input/checkbox.html')
  t.is(await page.evaluate(() => result.check), null)
  await page.click('label[for="agree"]')
  t.true(await page.evaluate(() => result.check))
  t.deepEqual(await page.evaluate(() => result.events), [
    'click',
    'input',
    'change'
  ])
  await page.click('label[for="agree"]')
  t.false(await page.evaluate(() => result.check))
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
  t.is(
    await page.evaluate(() => document.querySelector('#button-5').textContent),
    'clicked'
  )
  await page.click('#button-80')
  t.is(
    await page.evaluate(() => document.querySelector('#button-80').textContent),
    'clicked'
  )
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
  await button.click({
    clickCount: 2
  })
  t.true(await page.evaluate('double'))
  t.is(await page.evaluate('result'), 'Clicked')
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
  t.is(await page.evaluate(() => window.result), 'Clicked')
})

test.serial('Page.click should click a rotated button', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/input/rotatedButton.html')
  await page.click('button')
  t.is(await page.evaluate(() => result), 'Clicked')
})

test.serial(
  'Page.click should fire contextmenu event on right click',
  async t => {
    const { page, server } = t.context
    await page.goto(server.PREFIX + '/input/scrollable.html')
    await page.click('#button-8', {
      button: 'right'
    })
    t.is(
      await page.evaluate(
        () => document.querySelector('#button-8').textContent
      ),
      'context menu'
    )
  }
)

test.serial('Page.click should click links which cause navigation', async t => {
  const { page, server } = t.context
  await page.setContent(`<a href="${server.EMPTY_PAGE}">empty.html</a>`) // This await should not hang.

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
  t.is(await frame.evaluate(() => window.result), 'Clicked')
})

test.serial(
  'Page.click should click the button with deviceScaleFactor set',
  async t => {
    const { page, server } = t.context
    await page.setViewport({
      width: 400,
      height: 400,
      deviceScaleFactor: 5
    })
    t.is(await page.evaluate(() => window.devicePixelRatio), 5)
    await page.setContent('<div style="width:100px;height:100px">spacer</div>')
    await utils.attachFrame(
      page,
      'button-test',
      server.PREFIX + '/input/button.html'
    )
    const frame = page.frames()[1]
    const button = await frame.$('button')
    await button.click()
    t.is(await frame.evaluate(() => window.result), 'Clicked')
  }
)
