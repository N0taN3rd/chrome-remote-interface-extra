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
  /**  @type {Browser} */
  t.context.browser = helper.browser()
  t.context.server = helper.server()
})

test.serial.afterEach(async t => {
  await helper.cleanup()
})

test.after.always(async t => {
  await helper.end()
})

test.serial('BrowserContext should have default context', async t => {
  const { browser, server } = t.context
  t.is(browser.browserContexts().length, 1)
  const defaultContext = browser.browserContexts()[0]
  t.false(defaultContext.isIncognito())
  let error = null
  await defaultContext.close().catch(e => (error = e))
  t.is(browser.defaultBrowserContext(), defaultContext)
  t.true(error.message.includes('cannot be closed'))
})

test.serial('BrowserContext should create new incognito context', async t => {
  const { browser, server } = t.context
  t.is(browser.browserContexts().length, 1)
  const context = await browser.createIncognitoBrowserContext()
  t.true(context.isIncognito())
  t.is(browser.browserContexts().length, 2)
  t.true(browser.browserContexts().indexOf(context) !== -1)
  await context.close()
  t.is(browser.browserContexts().length, 1)
})

test.serial(
  'BrowserContext should close all belonging targets once closing context',
  async t => {
    const { browser, server } = t.context
    t.is((await browser.pages()).length, 1)
    const context = await browser.createIncognitoBrowserContext()
    await context.newPage()
    t.is((await browser.pages()).length, 2)
    t.is((await context.pages()).length, 1)
    await context.close()
    t.is((await browser.pages()).length, 1)
  }
)

test.serial(
  'BrowserContext window.open should use parent tab context',
  async t => {
    const { browser, server } = t.context
    const context = await browser.createIncognitoBrowserContext()
    const page = await context.newPage()
    await page.goto(server.EMPTY_PAGE)
    const [popupTarget] = await Promise.all([
      utils.waitEvent(browser, 'targetcreated'),
      page.evaluate(url => window.open(url), server.EMPTY_PAGE)
    ])
    t.is(popupTarget.browserContext(), context)
    await context.close()
  }
)

test.serial('BrowserContext should fire target events', async t => {
  const { browser, server } = t.context
  const context = await browser.createIncognitoBrowserContext()
  const events = []
  context.on('targetcreated', target => events.push('CREATED: ' + target.url()))
  context.on('targetchanged', target => events.push('CHANGED: ' + target.url()))
  context.on('targetdestroyed', target =>
    events.push('DESTROYED: ' + target.url())
  )
  const page = await context.newPage()
  await page.goto(server.EMPTY_PAGE)
  await page.close()
  t.deepEqual(events, [
    'CREATED: about:blank',
    `CHANGED: ${server.EMPTY_PAGE}`,
    `DESTROYED: ${server.EMPTY_PAGE}`
  ])
  await context.close()
})

test.serial('BrowserContext should wait for a target', async t => {
  const { browser, server } = t.context
  const context = await browser.createIncognitoBrowserContext()
  let resolved = false
  const targetPromise = context.waitForTarget(
    target => target.url() === server.EMPTY_PAGE
  )
  targetPromise.then(() => (resolved = true))
  const page = await context.newPage()
  t.false(resolved)
  await page.goto(server.EMPTY_PAGE)
  const target = await targetPromise
  t.is(await target.page(), page)
  await context.close()
})

test.serial(
  'BrowserContext should timeout waiting for a non-existent target',
  async t => {
    const { browser, server } = t.context
    const context = await browser.createIncognitoBrowserContext()
    const error = await context
      .waitForTarget(target => target.url() === server.EMPTY_PAGE, {
        timeout: 1
      })
      .catch(e => e)
    t.true(error instanceof TimeoutError)
    await context.close()
  }
)

test.serial(
  'BrowserContext should isolate localStorage and cookies',
  async t => {
    const { browser, server } = t.context
    // Create two incognito contexts.
    const context1 = await browser.createIncognitoBrowserContext()
    const context2 = await browser.createIncognitoBrowserContext()
    t.is(context1.targets().length, 0)
    t.is(context2.targets().length, 0) // Create a page in first incognito context.

    const page1 = await context1.newPage()
    await page1.goto(server.EMPTY_PAGE)
    await page1.evaluate(() => {
      localStorage.setItem('name', 'page1')
      document.cookie = 'name=page1'
    })
    t.is(context1.targets().length, 1)
    t.is(context2.targets().length, 0) // Create a page in second incognito context.

    const page2 = await context2.newPage()
    await page2.goto(server.EMPTY_PAGE)
    await page2.evaluate(() => {
      localStorage.setItem('name', 'page2')
      document.cookie = 'name=page2'
    })
    t.is(context1.targets().length, 1)
    t.is(context1.targets()[0], page1.target())
    t.is(context2.targets().length, 1)
    t.is(context2.targets()[0], page2.target()) // Make sure pages don't share localstorage or cookies.

    t.is(await page1.evaluate(() => localStorage.getItem('name')), 'page1')
    t.is(await page1.evaluate(() => document.cookie), 'name=page1')
    t.is(await page2.evaluate(() => localStorage.getItem('name')), 'page2')
    t.is(await page2.evaluate(() => document.cookie), 'name=page2') // Cleanup contexts.

    await Promise.all([context1.close(), context2.close()])
    t.is(browser.browserContexts().length, 1)
  }
)

test.serial('BrowserContext should work across sessions', async t => {
  const { browser, server } = t.context
  t.is(browser.browserContexts().length, 1)
  const context = await browser.createIncognitoBrowserContext()
  t.is(browser.browserContexts().length, 2)
  const remoteBrowser = await helper.newBrowser(browser.wsEndpoint())
  const contexts = remoteBrowser.browserContexts()
  t.is(contexts.length, 2)
  await remoteBrowser.disconnect()
  await context.close()
})
