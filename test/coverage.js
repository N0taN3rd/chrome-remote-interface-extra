import test from 'ava'
import { TestHelper } from './helpers/testHelper'

/** @type {TestHelper} */
let helper

test.serial.before(async t => {
  helper = await TestHelper.withHTTP(t)
})

test.serial.beforeEach(async t => {
  t.context.page = await helper.newPage()
  t.context.server = helper.server()
  t.context.toBeGolden = (t, what, filePath) => {
    const results = helper.toBeGolden(what, filePath)
    t.true(results.pass, results.message)
  }
})

test.serial.afterEach.always(async t => {
  await helper.cleanup()
})

test.after.always(async t => {
  await helper.end()
})

test.serial('JSCoverage should work', async t => {
  const { page, server } = t.context
  await page.coverage.startJSCoverage()
  await page.goto(server.PREFIX + '/jscoverage/simple.html', {
    waitUntil: 'networkidle0'
  })
  const coverage = await page.coverage.stopJSCoverage()
  t.is(coverage.length, 1)
  t.true(coverage[0].url.includes('/jscoverage/simple.html'))
  t.deepEqual(coverage[0].ranges, [
    {
      start: 0,
      end: 17
    },
    {
      start: 35,
      end: 61
    }
  ])
})

test.serial('JSCoverage should report sourceURLs', async t => {
  const { page, server } = t.context
  await page.coverage.startJSCoverage()
  await page.goto(server.PREFIX + '/jscoverage/sourceurl.html')
  const coverage = await page.coverage.stopJSCoverage()
  t.is(coverage.length, 1)
  t.is(coverage[0].url, 'nicename.js')
})

test.serial('JSCoverage should ignore eval() scripts by default', async t => {
  const { page, server } = t.context
  await page.coverage.startJSCoverage()
  await page.goto(server.PREFIX + '/jscoverage/eval.html')
  const coverage = await page.coverage.stopJSCoverage()
  t.is(coverage.length, 1)
})

test.serial(
  "JSCoverage shouldn't ignore eval() scripts if reportAnonymousScripts is true",
  async t => {
    const { page, server } = t.context
    await page.coverage.startJSCoverage({
      reportAnonymousScripts: true
    })
    await page.goto(server.PREFIX + '/jscoverage/eval.html')
    const coverage = await page.coverage.stopJSCoverage()
    t.truthy(coverage.find(entry => entry.url.startsWith('debugger://')))
    t.is(coverage.length, 2)
  }
)

test.serial(
  'JSCoverage should ignore pptr internal scripts if reportAnonymousScripts is true',
  async t => {
    const { page, server } = t.context
    await page.coverage.startJSCoverage({
      reportAnonymousScripts: true
    })
    await page.goto(server.EMPTY_PAGE)
    await page.evaluate('console.log("foo")')
    await page.evaluate(() => console.log('bar'))
    const coverage = await page.coverage.stopJSCoverage()
    t.is(coverage.length, 0)
  }
)

test.serial('JSCoverage should report multiple scripts', async t => {
  const { page, server } = t.context
  await page.coverage.startJSCoverage()
  await page.goto(server.PREFIX + '/jscoverage/multiple.html')
  const coverage = await page.coverage.stopJSCoverage()
  t.is(coverage.length, 2)
  coverage.sort((a, b) => a.url.localeCompare(b.url))
  t.true(coverage[0].url.includes('/jscoverage/script1.js'))
  t.true(coverage[1].url.includes('/jscoverage/script2.js'))
})

test.serial('JSCoverage should report right ranges', async t => {
  const { page, server } = t.context
  await page.coverage.startJSCoverage()
  await page.goto(server.PREFIX + '/jscoverage/ranges.html')
  const coverage = await page.coverage.stopJSCoverage()
  t.is(coverage.length, 1)
  const entry = coverage[0]
  t.is(entry.ranges.length, 1)
  const range = entry.ranges[0]
  t.is(entry.text.substring(range.start, range.end), `console.log('used!');`)
})

test.serial(
  'JSCoverage should report scripts that have no coverage',
  async t => {
    const { page, server } = t.context
    await page.coverage.startJSCoverage()
    await page.goto(server.PREFIX + '/jscoverage/unused.html')
    const coverage = await page.coverage.stopJSCoverage()
    t.is(coverage.length, 1)
    const entry = coverage[0]
    t.true(entry.url.includes('unused.html'))
    t.is(entry.ranges.length, 0)
  }
)

test.serial('JSCoverage should work with conditionals', async t => {
  const { page, server } = t.context
  await page.coverage.startJSCoverage()
  await page.goto(server.PREFIX + '/jscoverage/involved.html')
  const coverage = await page.coverage.stopJSCoverage()
  t.context.toBeGolden(
    t,
    JSON.stringify(coverage, null, 2).replace(/:\d{4}\//g, ':<PORT>/'),
    'jscoverage-involved.txt'
  )
})

test.serial(
  'JSCoverage - resetOnNavigation: should report scripts across navigations when disabled',
  async t => {
    const { page, server } = t.context
    await page.coverage.startJSCoverage({
      resetOnNavigation: false
    })
    await page.goto(server.PREFIX + '/jscoverage/multiple.html')
    await page.goto(server.EMPTY_PAGE)
    const coverage = await page.coverage.stopJSCoverage()
    t.is(coverage.length, 2)
  }
)

test.serial(
  'JSCoverage - resetOnNavigation: should NOT report scripts across navigations when enabled',
  async t => {
    const { page, server } = t.context
    await page.coverage.startJSCoverage() // Enabled by default.

    await page.goto(server.PREFIX + '/jscoverage/multiple.html')
    await page.goto(server.EMPTY_PAGE)
    const coverage = await page.coverage.stopJSCoverage()
    t.is(coverage.length, 0)
  }
)

test.serial(
  'JSCoverage should not hang when there is a debugger statement',
  async t => {
    const { page, server } = t.context
    await page.coverage.startJSCoverage()
    await page.goto(server.EMPTY_PAGE)
    await page.evaluate(`() => {
      debugger // eslint-disable-line no-debugger
    }`)
    await page.coverage.stopJSCoverage()
    t.pass()
  }
)

test.serial('CSSCoverage should work', async t => {
  const { page, server } = t.context
  await page.coverage.startCSSCoverage()
  await page.goto(server.PREFIX + '/csscoverage/simple.html')
  const coverage = await page.coverage.stopCSSCoverage()
  t.is(coverage.length, 1)
  t.true(coverage[0].url.includes('/csscoverage/simple.html'))
  t.deepEqual(coverage[0].ranges, [
    {
      start: 1,
      end: 22
    }
  ])
  const range = coverage[0].ranges[0]
  t.is(
    coverage[0].text.substring(range.start, range.end),
    'div { color: green; }'
  )
})

test.serial('CSSCoverage should report sourceURLs', async t => {
  const { page, server } = t.context
  await page.coverage.startCSSCoverage()
  await page.goto(server.PREFIX + '/csscoverage/sourceurl.html')
  const coverage = await page.coverage.stopCSSCoverage()
  t.is(coverage.length, 1)
  t.is(coverage[0].url, 'nicename.css')
})

test.serial('CSSCoverage should report multiple stylesheets', async t => {
  const { page, server } = t.context
  await page.coverage.startCSSCoverage()
  await page.goto(server.PREFIX + '/csscoverage/multiple.html')
  const coverage = await page.coverage.stopCSSCoverage()
  t.is(coverage.length, 2)
  coverage.sort((a, b) => a.url.localeCompare(b.url))
  t.true(coverage[0].url.includes('/csscoverage/stylesheet1.css'))
  t.true(coverage[1].url.includes('/csscoverage/stylesheet2.css'))
})

test.serial(
  'CSSCoverage should report stylesheets that have no coverage',
  async t => {
    const { page, server } = t.context
    await page.coverage.startCSSCoverage()
    await page.goto(server.PREFIX + '/csscoverage/unused.html')
    const coverage = await page.coverage.stopCSSCoverage()
    t.is(coverage.length, 1)
    t.is(coverage[0].url, 'unused.css')
    t.is(coverage[0].ranges.length, 0)
  }
)

test.serial('CSSCoverage should work with media queries', async t => {
  const { page, server } = t.context
  await page.coverage.startCSSCoverage()
  await page.goto(server.PREFIX + '/csscoverage/media.html')
  const coverage = await page.coverage.stopCSSCoverage()
  t.is(coverage.length, 1)
  t.true(coverage[0].url.includes('/csscoverage/media.html'))
  t.deepEqual(coverage[0].ranges, [
    {
      start: 17,
      end: 38
    }
  ])
})

test.serial('CSSCoverage should work with complicated usecases', async t => {
  const { page, server } = t.context
  await page.coverage.startCSSCoverage()
  await page.goto(server.PREFIX + '/csscoverage/involved.html')
  const coverage = await page.coverage.stopCSSCoverage()
  t.context.toBeGolden(
    t,
    JSON.stringify(coverage, null, 2).replace(/:\d{4}\//g, ':<PORT>/'),
    'csscoverage-involved.txt'
  )
})

test.serial('CSSCoverage should ignore injected stylesheets', async t => {
  const { page, server } = t.context
  await page.coverage.startCSSCoverage()
  await page.addStyleTag({
    content: 'body { margin: 10px;}'
  }) // trigger style recalc

  const margin = await page.evaluate(
    () => window.getComputedStyle(document.body).margin
  )
  t.is(margin, '10px')
  const coverage = await page.coverage.stopCSSCoverage()
  t.is(coverage.length, 0)
})

test.serial(
  'CSSCoverage - resetOnNavigation: should report stylesheets across navigations',
  async t => {
    const { page, server } = t.context
    await page.coverage.startCSSCoverage({
      resetOnNavigation: false
    })
    await page.goto(server.PREFIX + '/csscoverage/multiple.html')
    await page.goto(server.EMPTY_PAGE)
    const coverage = await page.coverage.stopCSSCoverage()
    t.is(coverage.length, 2)
  }
)

test.serial(
  'CSSCoverage - resetOnNavigation: should NOT report scripts across navigations',
  async t => {
    const { page, server } = t.context
    await page.coverage.startCSSCoverage() // Enabled by default.

    await page.goto(server.PREFIX + '/csscoverage/multiple.html')
    await page.goto(server.EMPTY_PAGE)
    const coverage = await page.coverage.stopCSSCoverage()
    t.is(coverage.length, 0)
  }
)

test.serial(
  'CSSCoverage should work with a recently loaded stylesheet',
  async t => {
    const { page, server } = t.context
    await page.coverage.startCSSCoverage()
    await page.evaluate(async url => {
      document.body.textContent = 'hello, world'
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = url
      document.head.appendChild(link)
      await new Promise(x => (link.onload = x))
    }, server.PREFIX + '/csscoverage/stylesheet1.css')
    const coverage = await page.coverage.stopCSSCoverage()
    t.is(coverage.length, 1)
  }
)
