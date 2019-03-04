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

test.serial.afterEach(async t => {
  await helper.cleanup()
})

test.after.always(async t => {
  await helper.end()
})

test.serial('ElementHandle.boundingBox should work', async t => {
  const { page, server } = t.context
  await page.setViewport({
    width: 500,
    height: 500
  })
  await page.goto(server.PREFIX + '/grid.html')
  const elementHandle = await page.$('.box:nth-of-type(13)')
  const box = await elementHandle.boundingBox()
  t.deepEqual(box, {
    x: 100,
    y: 50,
    width: 50,
    height: 50
  })
})

test.serial(
  'ElementHandle.boundingBox should handle nested frames',
  async t => {
    const { page, server } = t.context
    await page.setViewport({
      width: 500,
      height: 500
    })
    await page.goto(server.PREFIX + '/frames/nested-frames.html')
    const nestedFrame = page.frames()[1].childFrames()[1]
    const elementHandle = await nestedFrame.$('div')
    const box = await elementHandle.boundingBox()
    t.deepEqual(box, {
      x: 28,
      y: 260,
      width: 264,
      height: 18
    })
  }
)

test.serial(
  'ElementHandle.boundingBox should return null for invisible elements',
  async t => {
    const { page, server } = t.context
    await page.setContent('<div style="display:none">hi</div>')
    const element = await page.$('div')
    t.falsy(await element.boundingBox())
  }
)

test.serial('ElementHandle.boundingBox should force a layout', async t => {
  const { page, server } = t.context
  await page.setViewport({
    width: 500,
    height: 500
  })
  await page.setContent('<div style="width: 100px; height: 100px">hello</div>')
  const elementHandle = await page.$('div')
  await page.evaluate(
    element => (element.style.height = '200px'),
    elementHandle
  )
  const box = await elementHandle.boundingBox()
  t.deepEqual(box, {
    x: 8,
    y: 8,
    width: 100,
    height: 200
  })
})

test.serial('ElementHandle.boundingBox should work with SVG nodes', async t => {
  const { page, server } = t.context
  await page.setContent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="500" height="500">
          <rect id="theRect" x="30" y="50" width="200" height="300"></rect>
        </svg>
      `)
  const element = await page.$('#therect')
  const pptrBoundingBox = await element.boundingBox()
  const webBoundingBox = await page.evaluate(e => {
    const rect = e.getBoundingClientRect()
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height
    }
  }, element)
  t.deepEqual(pptrBoundingBox, webBoundingBox)
})

test.serial('ElementHandle.boxModel should work', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/resetcss.html') // Step 1: Add Frame and position it absolutely.

  await utils.attachFrame(page, 'frame1', server.PREFIX + '/resetcss.html')
  await page.evaluate(() => {
    const frame = document.querySelector('#frame1')
    frame.style = `
          position: absolute;
          left: 1px;
          top: 2px;
        `
  }) // Step 2: Add div and position it absolutely inside frame.

  const frame = page.frames()[1]
  const divHandle = (await frame.evaluateHandle(() => {
    const div = document.createElement('div')
    document.body.appendChild(div)
    div.style = `
          box-sizing: border-box;
          position: absolute;
          border-left: 1px solid black;
          padding-left: 2px;
          margin-left: 3px;
          left: 4px;
          top: 5px;
          width: 6px;
          height: 7px;
        `
    return div
  })).asElement() // Step 3: query div's boxModel and assert box values.

  const box = await divHandle.boxModel()
  t.is(box.width, 6)
  t.is(box.height, 7)
  t.deepEqual(box.margin[0], {
    x: 1 + 4,
    // frame.left + div.left
    y: 2 + 5
  })
  t.deepEqual(box.border[0], {
    x: 1 + 4 + 3,
    // frame.left + div.left + div.margin-left
    y: 2 + 5
  })
  t.deepEqual(box.padding[0], {
    x: 1 + 4 + 3 + 1,
    // frame.left + div.left + div.marginLeft + div.borderLeft
    y: 2 + 5
  })
  t.deepEqual(box.content[0], {
    x: 1 + 4 + 3 + 1 + 2,
    // frame.left + div.left + div.marginLeft + div.borderLeft + dif.paddingLeft
    y: 2 + 5
  })
})

test.serial(
  'ElementHandle.boxModel should return null for invisible elements',
  async t => {
    const { page, server } = t.context
    await page.setContent('<div style="display:none">hi</div>')
    const element = await page.$('div')
    t.falsy(await element.boxModel())
  }
)

test.serial('ElementHandle.contentFrame should work', async t => {
  const { page, server } = t.context
  await page.goto(server.EMPTY_PAGE)
  await utils.attachFrame(page, 'frame1', server.EMPTY_PAGE)
  const elementHandle = await page.$('#frame1')
  const frame = await elementHandle.contentFrame()
  t.is(frame, page.frames()[1])
})

test.serial('ElementHandle.click should work', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/input/button.html')
  const button = await page.$('button')
  await button.click()
  t.is(await page.evaluate(() => result), 'Clicked')
})

test.serial('ElementHandle.click should work for Shadow DOM v1', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/shadow.html')
  const buttonHandle = await page.evaluateHandle(() => button)
  await buttonHandle.click()
  t.true(await page.evaluate(() => clicked))
})

test.serial('ElementHandle.click should work for TextNodes', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/input/button.html')
  const buttonTextNode = await page.evaluateHandle(
    () => document.querySelector('button').firstChild
  )
  let error = null
  await buttonTextNode.click().catch(err => (error = err))
  t.is(error.message, 'Node is not of type HTMLElement')
})

test.serial('ElementHandle.click should throw for detached nodes', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/input/button.html')
  const button = await page.$('button')
  await page.evaluate(button => button.remove(), button)
  let error = null
  await button.click().catch(err => (error = err))
  t.is(error.message, 'Node is detached from document')
})

test.serial('ElementHandle.click should throw for hidden nodes', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/input/button.html')
  const button = await page.$('button')
  await page.evaluate(button => (button.style.display = 'none'), button)
  const error = await button.click().catch(err => err)
  t.is(error.message, 'Node is either not visible or not an HTMLElement')
})

test.serial(
  'ElementHandle.click should throw for recursively hidden nodes',
  async t => {
    const { page, server } = t.context
    await page.goto(server.PREFIX + '/input/button.html')
    const button = await page.$('button')
    await page.evaluate(
      button => (button.parentElement.style.display = 'none'),
      button
    )
    const error = await button.click().catch(err => err)
    t.is(error.message, 'Node is either not visible or not an HTMLElement')
  }
)

test.serial('ElementHandle.click should throw for <br> elements', async t => {
  const { page, server } = t.context
  await page.setContent('hello<br>goodbye')
  const br = await page.$('br')
  const error = await br.click().catch(err => err)
  t.is(error.message, 'Node is either not visible or not an HTMLElement')
})

test.serial('ElementHandle.hover should work', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/input/scrollable.html')
  const button = await page.$('#button-6')
  await button.hover()
  t.is(
    await page.evaluate(() => document.querySelector('button:hover').id),
    'button-6'
  )
})

test.serial('ElementHandle.isIntersectingViewport should work', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/offscreenbuttons.html')

  for (let i = 0; i < 11; ++i) {
    const button = await page.$('#btn' + i) // All but last button are visible.

    const visible = i < 10
    t.is(await button.isIntersectingViewport(), visible)
  }
})
