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

const _addElement2 = tag =>
  document.body.appendChild(document.createElement(tag))

const _addElement = tag =>
  document.body.appendChild(document.createElement(tag))

test.serial('Page.waitFor should wait for selector', async t => {
  const { page, server } = t.context
  let found = false
  const waitFor = page.waitFor('div').then(() => (found = true))
  await page.goto(server.EMPTY_PAGE)
  t.false(found)
  await page.goto(server.PREFIX + '/grid.html')
  await waitFor
  t.true(found)
})

test.serial('Page.waitFor should wait for an xpath', async t => {
  const { page, server } = t.context
  let found = false
  const waitFor = page.waitFor('//div').then(() => (found = true))
  await page.goto(server.EMPTY_PAGE)
  t.false(found)
  await page.goto(server.PREFIX + '/grid.html')
  await waitFor
  t.true(found)
})

test.serial(
  'Page.waitFor should not allow you to select an element with single slash xpath',
  async t => {
    const { page, server } = t.context
    await page.setContent(`<div>some text</div>`)
    let error = null
    await page.waitFor('/html/body/div').catch(e => (error = e))
    t.truthy(error)
  }
)

test.serial('Page.waitFor should timeout', async t => {
  const { page, server } = t.context
  const startTime = Date.now()
  const timeout = 42
  await page.waitFor(timeout)
  t.true(Date.now() - startTime >= timeout / 2)
})

test.serial('Page.waitFor should work with multiline body', async t => {
  const { page, server } = t.context
  const result = await page.waitForFunction(`
        (() => true)()
      `)
  t.true(await result.jsonValue())
})

test.serial('Page.waitFor should wait for predicate', async t => {
  const { page, server } = t.context
  await Promise.all([
    page.waitFor(() => window.innerWidth < 100),
    page.setViewport({
      width: 10,
      height: 10
    })
  ])
  t.pass()
})

test.serial('Page.waitFor should throw when unknown type', async t => {
  const { page, server } = t.context
  let error = null
  await page
    .waitFor({
      foo: 'bar'
    })
    .catch(e => (error = e))
  t.true(error.message.includes('Unsupported target type'))
})

test.serial(
  'Page.waitFor should wait for predicate with arguments',
  async t => {
    const { page, server } = t.context
    await page.waitFor((arg1, arg2) => arg1 !== arg2, {}, 1, 2)
    t.pass()
  }
)

test.serial('Frame.waitForFunction should accept a string', async t => {
  const { page, server } = t.context
  const watchdog = page.waitForFunction('window.__FOO === 1')
  await page.evaluate(() => (window.__FOO = 1))
  await watchdog
  t.pass()
})

test.serial(
  'Frame.waitForFunction should work when resolved right before execution context disposal',
  async t => {
    const { page, server } = t.context
    await page.evaluateOnNewDocument(() => (window.__RELOADED = true))
    await page.waitForFunction(() => {
      if (!window.__RELOADED) window.location.reload()
      return true
    })
    t.pass()
  }
)

test.serial('Frame.waitForFunction should poll on interval', async t => {
  const { page, server } = t.context
  let success = false
  const startTime = Date.now()
  const polling = 100
  const watchdog = page
    .waitForFunction(() => window.__FOO === 'hit', {
      polling
    })
    .then(() => (success = true))
  await page.evaluate(() => (window.__FOO = 'hit'))
  t.false(success)
  await page.evaluate(() =>
    document.body.appendChild(document.createElement('div'))
  )
  await watchdog
  t.true(Date.now() - startTime >= polling / 2)
})

test.serial('Frame.waitForFunction should poll on mutation', async t => {
  const { page, server } = t.context
  let success = false
  const watchdog = page
    .waitForFunction(() => window.__FOO === 'hit', {
      polling: 'mutation'
    })
    .then(() => (success = true))
  await page.evaluate(() => (window.__FOO = 'hit'))
  t.false(success)
  await page.evaluate(() =>
    document.body.appendChild(document.createElement('div'))
  )
  await watchdog
})

test.serial('Frame.waitForFunction should poll on raf', async t => {
  const { page, server } = t.context
  const watchdog = page.waitForFunction(() => window.__FOO === 'hit', {
    polling: 'raf'
  })
  await page.evaluate(() => (window.__FOO = 'hit'))
  await watchdog
  t.pass()
})

test.serial(
  'Frame.waitForFunction should work with strict CSP policy',
  async t => {
    const { page, server } = t.context
    await page.goto(server.EMPTY_CSP)
    let error = null
    await Promise.all([
      page
        .waitForFunction(() => window.__FOO === 'hit', {
          polling: 'raf'
        })
        .catch(e => (error = e)),
      page.evaluate(() => (window.__FOO = 'hit'))
    ])
    t.falsy(error)
  }
)

test.serial(
  'Frame.waitForFunction should throw on bad polling value',
  async t => {
    const { page, server } = t.context
    let error = null

    try {
      await page.waitForFunction(() => !!document.body, {
        polling: 'unknown'
      })
    } catch (e) {
      error = e
    }

    t.truthy(error)
    t.true(error.message.includes('polling'))
  }
)

test.serial(
  'Frame.waitForFunction should throw negative polling interval',
  async t => {
    const { page, server } = t.context
    let error = null

    try {
      await page.waitForFunction(() => !!document.body, {
        polling: -10
      })
    } catch (e) {
      error = e
    }

    t.truthy(error)
    t.true(error.message.includes('Cannot poll with non-positive interval'))
  }
)

test.serial(
  'Frame.waitForFunction should return the success value as a JSHandle',
  async t => {
    const { page } = t.context
    t.is(await (await page.waitForFunction(() => 5)).jsonValue(), 5)
  }
)

test.serial(
  'Frame.waitForFunction should return the window as a success value',
  async t => {
    const { page } = t.context
    t.truthy(await page.waitForFunction(() => window))
  }
)

test.serial(
  'Frame.waitForFunction should accept ElementHandle arguments',
  async t => {
    const { page } = t.context
    await page.setContent('<div></div>')
    const div = await page.$('div')
    let resolved = false
    const waitForFunction = page
      .waitForFunction(element => !element.parentElement, {}, div)
      .then(() => (resolved = true))
    t.false(resolved)
    await page.evaluate(element => element.remove(), div)
    await waitForFunction
  }
)

test.serial('Frame.waitForFunction should respect timeout', async t => {
  const { page } = t.context
  let error = null
  await page
    .waitForFunction('false', {
      timeout: 10
    })
    .catch(e => (error = e))
  t.truthy(error)
  t.true(error.message.includes('waiting for function failed: timeout'))
  t.true(error instanceof TimeoutError)
})

test.serial('Frame.waitForFunction should respect default timeout', async t => {
  const { page } = t.context
  page.setDefaultTimeout(1)
  let error = null
  await page.waitForFunction('false').catch(e => (error = e))
  t.true(error instanceof TimeoutError)
  t.true(error.message.includes('waiting for function failed: timeout'))
})

test.serial(
  'Frame.waitForFunction should disable timeout when its set to 0',
  async t => {
    const { page } = t.context
    const watchdog = page.waitForFunction(
      () => {
        window.__counter = (window.__counter || 0) + 1
        return window.__injected
      },
      {
        timeout: 0,
        polling: 10
      }
    )
    await page.waitForFunction(() => window.__counter > 10)
    await page.evaluate(() => (window.__injected = true))
    await watchdog
    t.pass()
  }
)

test.serial(
  'Frame.waitForFunction should survive cross-process navigation',
  async t => {
    const { page, server } = t.context
    let fooFound = false
    const waitForFunction = page
      .waitForFunction('window.__FOO === 1')
      .then(() => (fooFound = true))
    await page.goto(server.EMPTY_PAGE)
    t.false(fooFound)
    await page.reload()
    t.false(fooFound)
    await page.goto(server.CROSS_PROCESS_PREFIX + '/grid.html')
    t.false(fooFound)
    await page.evaluate(() => (window.__FOO = 1))
    await waitForFunction
    t.true(fooFound)
  }
)

test.serial('Frame.waitForFunction should survive navigations', async t => {
  const { page, server } = t.context
  const watchdog = page.waitForFunction(() => window.__done)
  await page.goto(server.EMPTY_PAGE)
  await page.goto(server.PREFIX + '/consolelog.html')
  await page.evaluate(() => (window.__done = true))
  await watchdog
  t.pass()
})

test.serial(
  'Frame.waitForSelector should immediately resolve promise if node exists',
  async t => {
    const { page, server } = t.context
    await page.goto(server.EMPTY_PAGE)
    const frame = page.mainFrame()
    await frame.waitForSelector('*')
    await frame.evaluate(_addElement, 'div')
    await frame.waitForSelector('div')
    t.pass()
  }
)

test.serial(
  'Frame.waitForSelector should work with removed MutationObserver',
  async t => {
    const { page, server } = t.context
    await page.evaluate('() => delete window.MutationObserver')
    const [handle] = await Promise.all([
      page.waitForSelector('.zombo'),
      page.setContent(`<div class='zombo'>anything</div>`)
    ])
    t.is(await page.evaluate(x => x.textContent, handle), 'anything')
  }
)

test.serial(
  'Frame.waitForSelector should resolve promise when node is added',
  async t => {
    const { page, server } = t.context
    await page.goto(server.EMPTY_PAGE)
    const frame = page.mainFrame()
    const watchdog = frame.waitForSelector('div')
    await frame.evaluate(_addElement, 'br')
    await frame.evaluate(_addElement, 'div')
    const eHandle = await watchdog
    const tagName = await eHandle
      .getProperty('tagName')
      .then(e => e.jsonValue())
    t.is(tagName, 'DIV')
  }
)

test.serial(
  'Frame.waitForSelector should work when node is added through innerHTML',
  async t => {
    const { page, server } = t.context
    await page.goto(server.EMPTY_PAGE)
    const watchdog = page.waitForSelector('h3 div')
    await page.evaluate(_addElement, 'span')
    await page.evaluate(
      () => (document.querySelector('span').innerHTML = '<h3><div></div></h3>')
    )
    await watchdog
    t.pass()
  }
)

test.serial(
  'Frame.waitForSelector Page.waitForSelector is shortcut for main frame',
  async t => {
    const { page, server } = t.context
    await page.goto(server.EMPTY_PAGE)
    await utils.attachFrame(page, 'frame1', server.EMPTY_PAGE)
    const otherFrame = page.frames()[1]
    const watchdog = page.waitForSelector('div')
    await otherFrame.evaluate(_addElement, 'div')
    await page.evaluate(_addElement, 'div')
    const eHandle = await watchdog
    t.is(eHandle.executionContext().frame(), page.mainFrame())
  }
)

test.serial('Frame.waitForSelector should run in specified frame', async t => {
  const { page, server } = t.context
  await utils.attachFrame(page, 'frame1', server.EMPTY_PAGE)
  await utils.attachFrame(page, 'frame2', server.EMPTY_PAGE)
  const frame1 = page.frames()[1]
  const frame2 = page.frames()[2]
  const waitForSelectorPromise = frame2.waitForSelector('div')
  await frame1.evaluate(_addElement, 'div')
  await frame2.evaluate(_addElement, 'div')
  const eHandle = await waitForSelectorPromise
  t.is(eHandle.executionContext().frame(), frame2)
})

test.serial(
  'Frame.waitForSelector should throw when frame is detached',
  async t => {
    const { page, server } = t.context
    await utils.attachFrame(page, 'frame1', server.EMPTY_PAGE)
    const frame = page.frames()[1]
    let waitError = null
    const waitPromise = frame
      .waitForSelector('.box')
      .catch(e => (waitError = e))
    await utils.detachFrame(page, 'frame1')
    await waitPromise
    t.truthy(waitError)
    t.true(
      waitError.message.includes('waitForFunction failed: frame got detached.')
    )
  }
)

test.serial(
  'Frame.waitForSelector should survive cross-process navigation',
  async t => {
    const { page, server } = t.context
    let boxFound = false
    const waitForSelector = page
      .waitForSelector('.box')
      .then(() => (boxFound = true))
    await page.goto(server.EMPTY_PAGE)
    t.false(boxFound)
    await page.reload()
    t.false(boxFound)
    await page.goto(server.CROSS_PROCESS_PREFIX + '/grid.html')
    await waitForSelector
    t.true(boxFound)
  }
)

test.serial('Frame.waitForSelector should wait for visible', async t => {
  const { page, server } = t.context
  let divFound = false
  const waitForSelector = page
    .waitForSelector('div', {
      visible: true
    })
    .then(() => (divFound = true))
  await page.setContent(
    `<div style='display: none; visibility: hidden;'>1</div>`
  )
  t.false(divFound)
  await page.evaluate(() =>
    document.querySelector('div').style.removeProperty('display')
  )
  t.false(divFound)
  await page.evaluate(() =>
    document.querySelector('div').style.removeProperty('visibility')
  )
  t.true(await waitForSelector)
  t.true(divFound)
})

test.serial(
  'Frame.waitForSelector should wait for visible recursively',
  async t => {
    const { page, server } = t.context
    let divVisible = false
    const waitForSelector = page
      .waitForSelector('div#inner', {
        visible: true
      })
      .then(() => (divVisible = true))
    await page.setContent(
      `<div style='display: none; visibility: hidden;'><div id="inner">hi</div></div>`
    )
    t.false(divVisible)
    await page.evaluate(() =>
      document.querySelector('div').style.removeProperty('display')
    )
    t.false(divVisible)
    await page.evaluate(() =>
      document.querySelector('div').style.removeProperty('visibility')
    )
    t.true(await waitForSelector)
    t.true(divVisible)
  }
)

test.serial(
  'Frame.waitForSelector hidden should wait for visibility: hidden',
  async t => {
    const { page, server } = t.context
    let divHidden = false
    await page.setContent(`<div style='display: block;'></div>`)
    const waitForSelector = page
      .waitForSelector('div', {
        hidden: true
      })
      .then(() => (divHidden = true))
    await page.waitForSelector('div') // do a round trip

    t.false(divHidden)
    await page.evaluate(() =>
      document.querySelector('div').style.setProperty('visibility', 'hidden')
    )
    t.true(await waitForSelector)
    t.true(divHidden)
  }
)

test.serial(
  'Frame.waitForSelector hidden should wait for display: none',
  async t => {
    const { page, server } = t.context
    let divHidden = false
    await page.setContent(`<div style='display: block;'></div>`)
    const waitForSelector = page
      .waitForSelector('div', {
        hidden: true
      })
      .then(() => (divHidden = true))
    await page.waitForSelector('div') // do a round trip

    t.false(divHidden)
    await page.evaluate(() =>
      document.querySelector('div').style.setProperty('display', 'none')
    )
    t.true(await waitForSelector)
    t.true(divHidden)
  }
)

test.serial('Frame.waitForSelector hidden should wait for removal', async t => {
  const { page, server } = t.context
  await page.setContent(`<div></div>`)
  let divRemoved = false
  const waitForSelector = page
    .waitForSelector('div', {
      hidden: true
    })
    .then(() => (divRemoved = true))
  await page.waitForSelector('div') // do a round trip

  t.false(divRemoved)
  await page.evaluate(() => document.querySelector('div').remove())
  t.true(await waitForSelector)
  t.true(divRemoved)
})

test.serial(
  'Frame.waitForSelector should return null if waiting to hide non-existing element',
  async t => {
    const { page, server } = t.context
    const handle = await page.waitForSelector('non-existing', {
      hidden: true
    })
    t.falsy(handle)
  }
)

test.serial('Frame.waitForSelector should respect timeout', async t => {
  const { page, server } = t.context
  let error = null
  await page
    .waitForSelector('div', {
      timeout: 10
    })
    .catch(e => (error = e))
  t.truthy(error)
  t.true(error.message.includes('waiting for selector "div" failed: timeout'))
  t.true(error instanceof TimeoutError)
})

test.serial(
  'Frame.waitForSelector should have an error message specifically for awaiting an element to be hidden',
  async t => {
    const { page, server } = t.context
    await page.setContent(`<div></div>`)
    let error = null
    await page
      .waitForSelector('div', {
        hidden: true,
        timeout: 10
      })
      .catch(e => (error = e))
    t.truthy(error)
    t.true(
      error.message.includes(
        'waiting for selector "div" to be hidden failed: timeout'
      )
    )
  }
)

test.serial(
  'Frame.waitForSelector should respond to node attribute mutation',
  async t => {
    const { page, server } = t.context
    let divFound = false
    const waitForSelector = page
      .waitForSelector('.zombo')
      .then(() => (divFound = true))
    await page.setContent(`<div class='notZombo'></div>`)
    t.false(divFound)
    await page.evaluate(
      () => (document.querySelector('div').className = 'zombo')
    )
    t.true(await waitForSelector)
  }
)

test.serial(
  'Frame.waitForSelector should return the element handle',
  async t => {
    const { page, server } = t.context
    const waitForSelector = page.waitForSelector('.zombo')
    await page.setContent(`<div class='zombo'>anything</div>`)
    t.is(
      await page.evaluate(x => x.textContent, await waitForSelector),
      'anything'
    )
  }
)

test.serial(
  'Frame.waitForSelector should have correct stack trace for timeout',
  async t => {
    const { page, server } = t.context
    let error
    await page
      .waitForSelector('.zombo', {
        timeout: 10
      })
      .catch(e => (error = e))
    t.true(error.stack.includes('waittask.js'))
  }
)

test.serial('Frame.waitForXPath should support some fancy xpath', async t => {
  const { page, server } = t.context
  await page.setContent(`<p>red herring</p><p>hello  world  </p>`)
  const waitForXPath = page.waitForXPath(
    '//p[normalize-space(.)="hello world"]'
  )
  t.is(
    await page.evaluate(x => x.textContent, await waitForXPath),
    'hello  world  '
  )
})

test.serial('Frame.waitForXPath should respect timeout', async t => {
  const { page } = t.context
  let error = null
  await page
    .waitForXPath('//div', {
      timeout: 10
    })
    .catch(e => (error = e))
  t.truthy(error)
  t.true(error.message.includes('waiting for XPath "//div" failed: timeout'))
  t.true(error instanceof TimeoutError)
})

test.serial('Frame.waitForXPath should run in specified frame', async t => {
  const { page, server } = t.context
  await utils.attachFrame(page, 'frame1', server.EMPTY_PAGE)
  await utils.attachFrame(page, 'frame2', server.EMPTY_PAGE)
  const frame1 = page.frames()[1]
  const frame2 = page.frames()[2]
  const waitForXPathPromise = frame2.waitForXPath('//div')
  await frame1.evaluate(_addElement2, 'div')
  await frame2.evaluate(_addElement2, 'div')
  const eHandle = await waitForXPathPromise
  t.is(eHandle.executionContext().frame(), frame2)
})

test.serial(
  'Frame.waitForXPath should throw when frame is detached',
  async t => {
    const { page, server } = t.context
    await utils.attachFrame(page, 'frame1', server.EMPTY_PAGE)
    const frame = page.frames()[1]
    let waitError = null
    const waitPromise = frame
      .waitForXPath('//*[@class="box"]')
      .catch(e => (waitError = e))
    await utils.detachFrame(page, 'frame1')
    await waitPromise
    t.truthy(waitError)
    t.true(
      waitError.message.includes('waitForFunction failed: frame got detached.')
    )
  }
)

test.serial(
  'Frame.waitForXPath hidden should wait for display: none',
  async t => {
    const { page, server } = t.context
    let divHidden = false
    await page.setContent(`<div style='display: block;'></div>`)
    const waitForXPath = page
      .waitForXPath('//div', {
        hidden: true
      })
      .then(() => (divHidden = true))
    await page.waitForXPath('//div') // do a round trip

    t.false(divHidden)
    await page.evaluate(() =>
      document.querySelector('div').style.setProperty('display', 'none')
    )
    t.true(await waitForXPath)
    t.true(divHidden)
  }
)

test.serial('Frame.waitForXPath should return the element handle', async t => {
  const { page, server } = t.context
  const waitForXPath = page.waitForXPath('//*[@class="zombo"]')
  await page.setContent(`<div class='zombo'>anything</div>`)
  t.is(await page.evaluate(x => x.textContent, await waitForXPath), 'anything')
})

test.serial(
  'Frame.waitForXPath should allow you to select a text node',
  async t => {
    const { page, server } = t.context
    await page.setContent(`<div>some text</div>`)
    const text = await page.waitForXPath('//div/text()')
    t.is(
      await (await text.getProperty('nodeType')).jsonValue(),
      3
      /* Node.TEXT_NODE */
    )
  }
)

test.serial(
  'Frame.waitForXPath should allow you to select an element with single slash',
  async t => {
    const { page, server } = t.context
    await page.setContent(`<div>some text</div>`)
    const waitForXPath = page.waitForXPath('/html/body/div')
    t.is(
      await page.evaluate(x => x.textContent, await waitForXPath),
      'some text'
    )
  }
)
