import test from 'ava'
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

test.serial('Page.evaluateHandle should work', async t => {
  const { page, server } = t.context
  const windowHandle = await page.evaluateHandle(() => window)
  t.truthy(windowHandle)
})

test.serial(
  'Page.evaluateHandle should accept object handle as an argument',
  async t => {
    const { page, server } = t.context
    const navigatorHandle = await page.evaluateHandle(() => navigator)
    const text = await page.evaluate(e => e.userAgent, navigatorHandle)
    t.true(text.includes('Mozilla'))
  }
)

test.serial(
  'Page.evaluateHandle should accept object handle to primitive types',
  async t => {
    const { page, server } = t.context
    const aHandle = await page.evaluateHandle(() => 5)
    const isFive = await page.evaluate(e => Object.is(e, 5), aHandle)
    t.truthy(isFive)
  }
)

test.serial(
  'Page.evaluateHandle should warn on nested object handles',
  async t => {
    const { page, server } = t.context
    const aHandle = await page.evaluateHandle(() => document.body)
    let error = null
    await page
      .evaluateHandle(opts => opts.elem.querySelector('p'), {
        elem: aHandle
      })
      .catch(e => (error = e))
    t.true(error.message.includes('Are you passing a nested JSHandle?'))
  }
)

test.serial(
  'Page.evaluateHandle should accept object handle to unserializable value',
  async t => {
    const { page, server } = t.context
    const aHandle = await page.evaluateHandle(() => Infinity)
    t.true(await page.evaluate(e => Object.is(e, Infinity), aHandle))
  }
)

test.serial('Page.evaluateHandle should use the same JS wrappers', async t => {
  const { page, server } = t.context
  const aHandle = await page.evaluateHandle(() => {
    window.FOO = 123
    return window
  })
  t.is(await page.evaluate(e => e.FOO, aHandle), 123)
})

test.serial('Page.evaluateHandle should work with primitives', async t => {
  const { page, server } = t.context
  const aHandle = await page.evaluateHandle(() => {
    window.FOO = 123
    return window
  })
  t.is(await page.evaluate(e => e.FOO, aHandle), 123)
})

test.serial('JSHandle.getProperty should work', async t => {
  const { page, server } = t.context
  const aHandle = await page.evaluateHandle(() => ({
    one: 1,
    two: 2,
    three: 3
  }))
  const twoHandle = await aHandle.getProperty('two')
  t.deepEqual(await twoHandle.jsonValue(), 2)
})

test.serial('JSHandle.jsonValue should work', async t => {
  const { page, server } = t.context
  const aHandle = await page.evaluateHandle(() => ({
    foo: 'bar'
  }))
  const json = await aHandle.jsonValue()
  t.deepEqual(json, {
    foo: 'bar'
  })
})

test.serial('JSHandle.jsonValue should not work with dates', async t => {
  const { page, server } = t.context
  const dateHandle = await page.evaluateHandle(
    () => new Date('2017-09-26T00:00:00.000Z')
  )
  const json = await dateHandle.jsonValue()
  t.deepEqual(json, {})
})

test.serial('JSHandle.jsonValue should throw for circular objects', async t => {
  const { page, server } = t.context
  const windowHandle = await page.evaluateHandle('window')
  let error = null
  await windowHandle.jsonValue().catch(e => (error = e))
  t.true(error.message.includes('Object reference chain is too long'))
})

test.serial('JSHandle.getProperties should work', async t => {
  const { page, server } = t.context
  const aHandle = await page.evaluateHandle(() => ({
    foo: 'bar'
  }))
  const properties = await aHandle.getProperties()
  const foo = properties.get('foo')
  t.truthy(foo)
  t.is(await foo.jsonValue(), 'bar')
})

test.serial(
  'JSHandle.getProperties should return even non-own properties',
  async t => {
    const { page, server } = t.context
    const aHandle = await page.evaluateHandle(() => {
      class A {
        constructor () {
          this.a = '1'
        }
      }

      class B extends A {
        constructor () {
          super()
          this.b = '2'
        }
      }

      return new B()
    })
    const properties = await aHandle.getProperties()
    t.is(await properties.get('a').jsonValue(), '1')
    t.is(await properties.get('b').jsonValue(), '2')
  }
)

test.serial('JSHandle.asElement should work', async t => {
  const { page, server } = t.context
  const aHandle = await page.evaluateHandle(() => document.body)
  const element = aHandle.asElement()
  t.truthy(element)
})

test.serial(
  'JSHandle.asElement should return null for non-elements',
  async t => {
    const { page, server } = t.context
    const aHandle = await page.evaluateHandle(() => 2)
    const element = aHandle.asElement()
    t.falsy(element)
  }
)

test.serial(
  'JSHandle.asElement should return ElementHandle for TextNodes',
  async t => {
    const { page, server } = t.context
    await page.setContent('<div>ee!</div>')
    const aHandle = await page.evaluateHandle(
      () => document.querySelector('div').firstChild
    )
    const element = aHandle.asElement()
    t.truthy(element)
    t.truthy(
      await page.evaluate(e => e.nodeType === HTMLElement.TEXT_NODE, element)
    )
  }
)

test.serial('JSHandle.asElement should work with nullified Node', async t => {
  const { page, server } = t.context
  await page.setContent('<section>test</section>')
  await page.evaluate('() => delete Node')
  const handle = await page.evaluateHandle(() =>
    document.querySelector('section')
  )
  const element = handle.asElement()
  t.truthy(element)
})

test.serial('JSHandle.toString should work for primitives', async t => {
  const { page, server } = t.context
  const numberHandle = await page.evaluateHandle(() => 2)
  t.is(numberHandle.toString(), 'JSHandle:2')
  const stringHandle = await page.evaluateHandle(() => 'a')
  t.is(stringHandle.toString(), 'JSHandle:a')
})

test.serial(
  'JSHandle.toString should work for complicated objects',
  async t => {
    const { page, server } = t.context
    const aHandle = await page.evaluateHandle(() => window)
    t.is(aHandle.toString(), 'JSHandle@object')
  }
)

test.serial(
  'JSHandle.toString should work with different subtypes',
  async t => {
    const { page, server } = t.context
    t.is(
      (await page.evaluateHandle('(function(){})')).toString(),
      'JSHandle@function'
    )
    t.is((await page.evaluateHandle('12')).toString(), 'JSHandle:12')
    t.is((await page.evaluateHandle('true')).toString(), 'JSHandle:true')
    t.is(
      (await page.evaluateHandle('undefined')).toString(),
      'JSHandle:undefined'
    )
    t.is((await page.evaluateHandle('"foo"')).toString(), 'JSHandle:foo')
    t.is((await page.evaluateHandle('Symbol()')).toString(), 'JSHandle@symbol')
    t.is((await page.evaluateHandle('new Map()')).toString(), 'JSHandle@map')
    t.is((await page.evaluateHandle('new Set()')).toString(), 'JSHandle@set')
    t.is((await page.evaluateHandle('[]')).toString(), 'JSHandle@array')
    t.is((await page.evaluateHandle('null')).toString(), 'JSHandle:null')
    t.is((await page.evaluateHandle('/foo/')).toString(), 'JSHandle@regexp')
    t.is(
      (await page.evaluateHandle('document.body')).toString(),
      'ElementHandle@node'
    )
    t.is((await page.evaluateHandle('new Date()')).toString(), 'JSHandle@date')
    t.is(
      (await page.evaluateHandle('new WeakMap()')).toString(),
      'JSHandle@weakmap'
    )
    t.is(
      (await page.evaluateHandle('new WeakSet()')).toString(),
      'JSHandle@weakset'
    )
    t.is(
      (await page.evaluateHandle('new Error()')).toString(),
      'JSHandle@error'
    )
    t.is(
      (await page.evaluateHandle('new Int32Array()')).toString(),
      'JSHandle@typedarray'
    )
    t.is(
      (await page.evaluateHandle('new Proxy({}, {})')).toString(),
      'JSHandle@proxy'
    )
  }
)
