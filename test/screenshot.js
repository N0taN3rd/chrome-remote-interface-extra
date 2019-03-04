import test from 'ava'
import { TestHelper } from './helpers/testHelper'
import { TimeoutError } from '../lib/Errors'

/** @type {TestHelper} */
let helper

test.serial.before(async t => {
  helper = await TestHelper.withHTTP(t)
})

test.serial.beforeEach(async t => {
  t.context.toBeGolden = (t, what, filePath) => {
    const results = helper.toBeGolden(what, filePath)
    t.true(results.pass, results.message)
  }
  /** @type {Page} */
  t.context.page = await helper.newPage()
  t.context.server = helper.server()
  t.context.context = await helper.context()
})

test.serial.afterEach(async t => {
  await helper.cleanup()
})

test.after.always(async t => {
  await helper.end()
})

test.serial('Page.screenshot should work', async t => {
  const { page, server } = t.context
  await page.setViewport({
    width: 500,
    height: 500
  })
  await page.goto(server.PREFIX + '/grid.html')
  const screenshot = await page.screenshot()
  t.context.toBeGolden(t, screenshot, 'screenshot-sanity.png')
})

test.serial('Page.screenshot should clip rect', async t => {
  const { page, server } = t.context
  await page.setViewport({
    width: 500,
    height: 500
  })
  await page.goto(server.PREFIX + '/grid.html')
  const screenshot = await page.screenshot({
    clip: {
      x: 50,
      y: 100,
      width: 150,
      height: 100
    }
  })
  t.context.toBeGolden(t, screenshot, 'screenshot-clip-rect.png')
})

test.serial('Page.screenshot should work for offscreen clip', async t => {
  const { page, server } = t.context
  await page.setViewport({
    width: 500,
    height: 500
  })
  await page.goto(server.PREFIX + '/grid.html')
  const screenshot = await page.screenshot({
    clip: {
      x: 50,
      y: 600,
      width: 100,
      height: 100
    }
  })
  t.context.toBeGolden(t, screenshot, 'screenshot-offscreen-clip.png')
})

test.serial('Page.screenshot should run in parallel', async t => {
  const { page, server } = t.context
  await page.setViewport({
    width: 500,
    height: 500
  })
  await page.goto(server.PREFIX + '/grid.html')
  const promises = []

  for (let i = 0; i < 3; ++i) {
    promises.push(
      page.screenshot({
        clip: {
          x: 50 * i,
          y: 0,
          width: 50,
          height: 50
        }
      })
    )
  }

  const screenshots = await Promise.all(promises)
  t.context.toBeGolden(t, screenshots[1], 'grid-cell-1.png')
})

test.serial('Page.screenshot should take fullPage screenshots', async t => {
  const { page, server } = t.context
  await page.setViewport({
    width: 500,
    height: 500
  })
  await page.goto(server.PREFIX + '/grid.html')
  const screenshot = await page.screenshot({
    fullPage: true
  })
  t.context.toBeGolden(t, screenshot, 'screenshot-grid-fullpage.png')
})

test.serial(
  'Page.screenshot should run in parallel in multiple pages',
  async t => {
    const { page, server, context } = t.context
    const N = 2
    const pages = await Promise.all(
      Array(N)
        .fill(0)
        .map(async () => {
          const page = await context.newPage()
          await page.goto(server.PREFIX + '/grid.html')
          return page
        })
    )
    const promises = []

    for (let i = 0; i < N; ++i)
      promises.push(
        pages[i].screenshot({
          clip: {
            x: 50 * i,
            y: 0,
            width: 50,
            height: 50
          }
        })
      )

    const screenshots = await Promise.all(promises)

    for (let i = 0; i < N; ++i)
      t.context.toBeGolden(t, screenshots[i], `grid-cell-${i}.png`)

    await Promise.all(pages.map(page => page.close()))
  }
)

test.serial('Page.screenshot should allow transparency', async t => {
  const { page, server } = t.context
  await page.setViewport({
    width: 100,
    height: 100
  })
  await page.goto(server.EMPTY_PAGE)
  const screenshot = await page.screenshot({
    omitBackground: true
  })
  t.context.toBeGolden(t, screenshot, 'transparent.png')
})

test.serial(
  'Page.screenshot should render white background on jpeg file',
  async t => {
    const { page, server } = t.context
    await page.setViewport({
      width: 100,
      height: 100
    })
    await page.goto(server.EMPTY_PAGE)
    const screenshot = await page.screenshot({
      omitBackground: true,
      type: 'jpeg'
    })
    t.context.toBeGolden(t, screenshot, 'white.jpg')
  }
)

test.serial(
  'Page.screenshot should work with odd clip size on Retina displays',
  async t => {
    const { page, server } = t.context
    const screenshot = await page.screenshot({
      clip: {
        x: 0,
        y: 0,
        width: 11,
        height: 11
      }
    })
    t.context.toBeGolden(t, screenshot, 'screenshot-clip-odd-size.png')
  }
)

test.serial('Page.screenshot should return base64', async t => {
  const { page, server } = t.context
  await page.setViewport({
    width: 500,
    height: 500
  })
  await page.goto(server.PREFIX + '/grid.html')
  const screenshot = await page.screenshot({
    encoding: 'base64'
  })
  t.context.toBeGolden(
    t,
    Buffer.from(screenshot, 'base64'),
    'screenshot-sanity.png'
  )
})

test.serial('ElementHandle.screenshot should work', async t => {
  const { page, server } = t.context
  await page.setViewport({
    width: 500,
    height: 500
  })
  await page.goto(server.PREFIX + '/grid.html')
  await page.evaluate(() => window.scrollBy(50, 100))
  const elementHandle = await page.$('.box:nth-of-type(3)')
  const screenshot = await elementHandle.screenshot()
  t.context.toBeGolden(t, screenshot, 'screenshot-element-bounding-box.png')
})

test.serial(
  'ElementHandle.screenshot should take into account padding and border',
  async t => {
    const { page, server } = t.context
    await page.setViewport({
      width: 500,
      height: 500
    })
    await page.setContent(`
        something above
        <style>div {
          border: 2px solid blue;
          background: green;
          width: 50px;
          height: 50px;
        }
        </style>
        <div></div>
      `)
    const elementHandle = await page.$('div')
    const screenshot = await elementHandle.screenshot()
    t.context.toBeGolden(t, screenshot, 'screenshot-element-padding-border.png')
  }
)

test.serial(
  'ElementHandle.screenshot should capture full element when larger than viewport',
  async t => {
    const { page, server } = t.context
    await page.setViewport({
      width: 500,
      height: 500
    })
    await page.setContent(`
        something above
        <style>
        div.to-screenshot {
          border: 1px solid blue;
          width: 600px;
          height: 600px;
          margin-left: 50px;
        }
        ::-webkit-scrollbar{
          display: none;
        }
        </style>
        <div class="to-screenshot"></div>
      `)
    const elementHandle = await page.$('div.to-screenshot')
    const screenshot = await elementHandle.screenshot()
    t.context.toBeGolden(
      t,
      screenshot,
      'screenshot-element-larger-than-viewport.png'
    )
    t.deepEqual(
      await page.evaluate(() => ({
        w: window.innerWidth,
        h: window.innerHeight
      })),
      {
        w: 500,
        h: 500
      }
    )
  }
)

test.serial(
  'ElementHandle.screenshot should scroll element into view',
  async t => {
    const { page, server } = t.context
    await page.setViewport({
      width: 500,
      height: 500
    })
    await page.setContent(`
        something above
        <style>div.above {
          border: 2px solid blue;
          background: red;
          height: 1500px;
        }
        div.to-screenshot {
          border: 2px solid blue;
          background: green;
          width: 50px;
          height: 50px;
        }
        </style>
        <div class="above"></div>
        <div class="to-screenshot"></div>
      `)
    const elementHandle = await page.$('div.to-screenshot')
    const screenshot = await elementHandle.screenshot()
    t.context.toBeGolden(
      t,
      screenshot,
      'screenshot-element-scrolled-into-view.png'
    )
  }
)

test.serial(
  'ElementHandle.screenshot should work with a rotated element',
  async t => {
    const { page, server } = t.context
    await page.setViewport({
      width: 500,
      height: 500
    })
    await page.setContent(`<div style="position:absolute;
                                        top: 100px;
                                        left: 100px;
                                        width: 100px;
                                        height: 100px;
                                        background: green;
                                        transform: rotateZ(200deg);">&nbsp;</div>`)
    const elementHandle = await page.$('div')
    const screenshot = await elementHandle.screenshot()
    t.context.toBeGolden(t, screenshot, 'screenshot-element-rotate.png')
  }
)

test.serial(
  'ElementHandle.screenshot should fail to screenshot a detached element',
  async t => {
    const { page, server } = t.context
    await page.setContent('<h1>remove this</h1>')
    const elementHandle = await page.$('h1')
    await page.evaluate(element => element.remove(), elementHandle)
    const screenshotError = await elementHandle
      .screenshot()
      .catch(error => error)
    t.is(
      screenshotError.message,
      'Node is either not visible or not an HTMLElement'
    )
  }
)

test.serial(
  'ElementHandle.screenshot should not hang with zero width/height element',
  async t => {
    const { page, server } = t.context
    await page.setContent('<div style="width: 50px; height: 0"></div>')
    const div = await page.$('div')
    const error = await div.screenshot().catch(e => e)
    t.is(error.message, 'Node has 0 height.')
  }
)

test.serial(
  'ElementHandle.screenshot should work for an element with fractional dimensions',
  async t => {
    const { page } = t.context
    await page.setContent(
      '<div style="width:48.51px;height:19.8px;border:1px solid black;"></div>'
    )
    const elementHandle = await page.$('div')
    const screenshot = await elementHandle.screenshot()
    t.context.toBeGolden(t, screenshot, 'screenshot-element-fractional.png')
  }
)

test.serial(
  'ElementHandle.screenshot should work for an element with an offset',
  async t => {
    const { page } = t.context
    await page.setContent(
      '<div style="position:absolute; top: 10.3px; left: 20.4px;width:50.3px;height:20.2px;border:1px solid black;"></div>'
    )
    const elementHandle = await page.$('div')
    const screenshot = await elementHandle.screenshot()
    t.context.toBeGolden(
      t,
      screenshot,
      'screenshot-element-fractional-offset.png'
    )
  }
)
