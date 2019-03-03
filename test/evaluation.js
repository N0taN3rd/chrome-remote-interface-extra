import test from 'ava'
import * as utils from './helpers/utils'
import TestHelper from './helpers/testHelper'
import { TimeoutError } from '../lib/Errors'

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

test.serial('Page.evaluate should work', async t => {
  const { page, server } = t.context
  const result = await page.evaluate(() => 7 * 3)
  t.is(result, 21)
})

test.serial('Page.evaluate should transfer NaN', async t => {
  const { page, server } = t.context
  const result = await page.evaluate(a => a, NaN)
  t.true(Object.is(result, NaN))
})

test.serial('Page.evaluate should transfer -0', async t => {
  const { page, server } = t.context
  const result = await page.evaluate(a => a, -0)
  t.true(Object.is(result, -0))
})

test.serial('Page.evaluate should transfer Infinity', async t => {
  const { page, server } = t.context
  const result = await page.evaluate(a => a, Infinity)
  t.true(Object.is(result, Infinity))
})

test.serial('Page.evaluate should transfer -Infinity', async t => {
  const { page, server } = t.context
  const result = await page.evaluate(a => a, -Infinity)
  t.true(Object.is(result, -Infinity))
})

test.serial('Page.evaluate should transfer arrays', async t => {
  const { page, server } = t.context
  const result = await page.evaluate(a => a, [1, 2, 3])
  t.deepEqual(result, [1, 2, 3])
})

test.serial(
  'Page.evaluate should transfer arrays as arrays, not objects',
  async t => {
    const { page, server } = t.context
    const result = await page.evaluate(a => Array.isArray(a), [1, 2, 3])
    t.true(result)
  }
)

test.serial('Page.evaluate should modify global environment', async t => {
  const { page } = t.context
  await page.evaluate(() => (window.globalVar = 123))
  t.is(await page.evaluate('globalVar'), 123)
})

test.serial('Page.evaluate should evaluate in the page context', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/global-var.html')
  t.is(await page.evaluate('globalVar'), 123)
})

test.serial(
  'Page.evaluate should return undefined for objects with symbols',
  async t => {
    const { page, server } = t.context
    t.is(await page.evaluate(() => [Symbol('foo4')]), undefined)
  }
)

test.serial('Page.evaluate should work with function shorthands', async t => {
  const { page, server } = t.context
  const a = {
    sum (a, b) {
      return a + b
    },
    async mult (a, b) {
      return a * b
    }
  }
  t.is(await page.evaluate(a.sum, 1, 2), 3)
  t.is(await page.evaluate(a.mult, 2, 4), 8)
})

test.serial(
  'Page.evaluate should throw when evaluation triggers reload',
  async t => {
    const { page, server } = t.context
    let error = null
    await page
      .evaluate(() => {
        location.reload()
        return new Promise(resolve => {
          setTimeout(() => resolve(1), 0)
        })
      })
      .catch(e => (error = e))
    t.true(error.message.includes('Protocol error'))
  }
)

test.serial('Page.evaluate should await promise', async t => {
  const { page, server } = t.context
  const result = await page.evaluate(() => Promise.resolve(8 * 7))
  t.is(result, 56)
})

test.serial('Page.evaluate should work right after framenavigated', async t => {
  const { page, server } = t.context
  let frameEvaluation = null
  page.on('framenavigated', async frame => {
    frameEvaluation = frame.evaluate(() => 6 * 7)
  })
  await page.goto(server.EMPTY_PAGE)
  t.is(await frameEvaluation, 42)
})

test.serial(
  'Page.evaluate should work from-inside an exposed function',
  async t => {
    const { page, server } = t.context
    // Setup inpage callback, which calls Page.evaluate
    await page.exposeFunction('callController', async function (a, b) {
      return await page.evaluate((a, b) => a * b, a, b)
    })
    const result = await page.evaluate(async function () {
      return await callController(9, 3)
    })
    t.is(result, 27)
  }
)

test.serial('Page.evaluate should reject promise with exception', async t => {
  const { page, server } = t.context
  let error = null
  await page
    .evaluate(() => not.existing.object.property)
    .catch(e => (error = e))
  t.truthy(error)
  t.true(error.message.includes('not is not defined'))
})

test.serial(
  'Page.evaluate should support thrown strings as error messages',
  async t => {
    const { page, server } = t.context
    let error = null
    await page
      .evaluate(() => {
        throw 'qwerty'
      })
      .catch(e => (error = e))
    t.truthy(error)
    t.true(error.message.includes('qwerty'))
  }
)

test.serial(
  'Page.evaluate should support thrown numbers as error messages',
  async t => {
    const { page, server } = t.context
    let error = null
    await page
      .evaluate(() => {
        throw 100500
      })
      .catch(e => (error = e))
    t.truthy(error)
    t.true(error.message.includes('100500'))
  }
)

test.serial('Page.evaluate should return complex objects', async t => {
  const { page, server } = t.context
  const object = {
    foo: 'bar!'
  }
  const result = await page.evaluate(a => a, object)
  t.true(result != object)
  t.deepEqual(result, object)
})

test.serial('Page.evaluate should return NaN', async t => {
  const { page, server } = t.context
  const result = await page.evaluate(() => NaN)
  t.true(Object.is(result, NaN))
})

test.serial('Page.evaluate should return -0', async t => {
  const { page, server } = t.context
  const result = await page.evaluate(() => -0)
  t.true(Object.is(result, -0))
})

test.serial('Page.evaluate should return Infinity', async t => {
  const { page, server } = t.context
  const result = await page.evaluate(() => Infinity)
  t.true(Object.is(result, Infinity))
})

test.serial('Page.evaluate should return -Infinity', async t => {
  const { page, server } = t.context
  const result = await page.evaluate(() => -Infinity)
  t.true(Object.is(result, -Infinity))
})

test.serial(
  'Page.evaluate should accept "undefined" as one of multiple parameters',
  async t => {
    const { page, server } = t.context
    const result = await page.evaluate(
      (a, b) => Object.is(a, undefined) && Object.is(b, 'foo'),
      undefined,
      'foo'
    )
    t.true(result)
  }
)

test.serial('Page.evaluate should properly serialize null fields', async t => {
  const { page } = t.context
  t.deepEqual(
    await page.evaluate(() => ({
      a: undefined
    })),
    {}
  )
})

test.serial(
  'Page.evaluate should return undefined for non-serializable objects',
  async t => {
    const { page, server } = t.context
    t.is(await page.evaluate(() => window), undefined)
  }
)

test.serial('Page.evaluate should fail for circular object', async t => {
  const { page, server } = t.context
  const result = await page.evaluate(() => {
    const a = {}
    const b = {
      a
    }
    a.b = b
    return a
  })
  t.is(result, undefined)
})

test.serial('Page.evaluate should accept a string', async t => {
  const { page, server } = t.context
  const result = await page.evaluate('1 + 2')
  t.is(result, 3)
})

test.serial(
  'Page.evaluate should accept a string with semi colons',
  async t => {
    const { page, server } = t.context
    const result = await page.evaluate('1 + 5;')
    t.is(result, 6)
  }
)

test.serial('Page.evaluate should accept a string with comments', async t => {
  const { page, server } = t.context
  const result = await page.evaluate('2 + 5;\n// do some math!')
  t.is(result, 7)
})

test.serial(
  'Page.evaluate should accept element handle as an argument',
  async t => {
    const { page, server } = t.context
    await page.setContent('<section>42</section>')
    const element = await page.$('section')
    const text = await page.evaluate(e => e.textContent, element)
    t.is(text, '42')
  }
)

test.serial(
  'Page.evaluate should throw if underlying element was disposed',
  async t => {
    const { page, server } = t.context
    await page.setContent('<section>39</section>')
    const element = await page.$('section')
    t.truthy(element)
    await element.dispose()
    let error = null
    await page.evaluate(e => e.textContent, element).catch(e => (error = e))
    t.true(error.message.includes('JSHandle is disposed'))
  }
)

test.serial(
  'Page.evaluate should throw if elementHandles are from other frames',
  async t => {
    const { page, server } = t.context
    await utils.attachFrame(page, 'frame1', server.EMPTY_PAGE)
    const bodyHandle = await page.frames()[1].$('body')
    let error = null
    await page
      .evaluate(body => body.innerHTML, bodyHandle)
      .catch(e => (error = e))
    t.truthy(error)
    t.true(
      error.message.includes(
        'JSHandles can be evaluated only in the context they were created'
      )
    )
  }
)

test.serial('Page.evaluate should simulate a user gesture', async t => {
  const { page, server } = t.context
  const result = await page.evaluate(() => document.execCommand('copy'))
  t.true(result)
})

test.serial(
  'Page.evaluate should throw a nice error after a navigation',
  async t => {
    const { page, server } = t.context
    const executionContext = await page.mainFrame().executionContext()
    await Promise.all([
      page.waitForNavigation(),
      executionContext.evaluate(() => window.location.reload())
    ])
    const error = await executionContext.evaluate(() => null).catch(e => e)
    t.true(error.message.includes('navigation'))
  }
)

test.serial(
  'Page.evaluateOnNewDocument should evaluate before anything else on the page',
  async t => {
    const { page, server } = t.context
    await page.evaluateOnNewDocument(function () {
      window.injected = 123
    })
    await page.goto(server.PREFIX + '/tamperable.html')
    t.is(await page.evaluate(() => window.result), 123)
  }
)

test.serial('Page.evaluateOnNewDocument should work with CSP', async t => {
  const { page, server } = t.context
  server.setCSP('/empty.html', 'script-src ' + server.PREFIX)
  await page.evaluateOnNewDocument(function () {
    window.injected = 123
  })
  await page.goto(server.PREFIX + '/empty.html')
  t.is(await page.evaluate(() => window.injected), 123) // Make sure CSP works.

  await page
    .addScriptTag({
      content: 'window.e = 10;'
    })
    .catch(e => void e)
  t.is(await page.evaluate(() => window.e), undefined)
})

test.serial(
  'Frame.evaluate should have different execution contexts',
  async t => {
    const { page, server } = t.context
    await page.goto(server.EMPTY_PAGE)
    await utils.attachFrame(page, 'frame1', server.EMPTY_PAGE)
    t.is(page.frames().length, 2)
    await page.frames()[0].evaluate(() => (window.FOO = 'foo'))
    await page.frames()[1].evaluate(() => (window.FOO = 'bar'))
    t.is(await page.frames()[0].evaluate(() => window.FOO), 'foo')
    t.is(await page.frames()[1].evaluate(() => window.FOO), 'bar')
  }
)

test.serial(
  'Frame.evaluate should have correct execution contexts',
  async t => {
    const { page, server } = t.context
    await page.goto(server.PREFIX + '/frames/one-frame.html')
    t.is(page.frames().length, 2)
    t.is(
      await page.frames()[0].evaluate(() => document.body.textContent.trim()),
      ''
    )
    t.is(
      await page.frames()[1].evaluate(() => document.body.textContent.trim()),
      `Hi, I'm frame`
    )
  }
)

test.serial(
  'Frame.evaluate should execute after cross-site navigation',
  async t => {
    const { page, server } = t.context
    await page.goto(server.EMPTY_PAGE)
    const mainFrame = page.mainFrame()
    t.true(
      (await mainFrame.evaluate(() => window.location.href)).includes(
        'localhost'
      )
    )
    await page.goto(server.CROSS_PROCESS_PREFIX + '/empty.html')
    t.true(
      (await mainFrame.evaluate(() => window.location.href)).includes('127')
    )
  }
)
