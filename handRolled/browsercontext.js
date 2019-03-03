import test from 'ava'
import { TestHelper } from '../test/helpers'

/** @type {TestHelper} */
let helper

test.before(async t => {
  helper = await TestHelper.withHTTP(t)
  t.context.browser = helper.browser()
  t.context.server = helper.server()
})

test.after.always(async t => {
  await helper.end()
})

test('Browser.target: should return browser target', async t => {
  const { browser } = t.context
})

test.serial('should have default context', async function ({
  browser,
  server
}) {
  expect(browser.browserContexts().length).toBe(1)
  const defaultContext = browser.browserContexts()[0]
  expect(defaultContext.isIncognito()).toBe(false)
  let error = null
  await defaultContext.close().catch(e => (error = e))
  expect(browser.defaultBrowserContext()).toBe(defaultContext)
  expect(error.message).toContain('cannot be closed')
})

test.serial('should create new incognito context', async function ({
  browser,
  server
}) {
  expect(browser.browserContexts().length).toBe(1)
  const context = await browser.createIncognitoBrowserContext()
  expect(context.isIncognito()).toBe(true)
  expect(browser.browserContexts().length).toBe(2)
  expect(browser.browserContexts().indexOf(context) !== -1).toBe(true)
  await context.close()
  expect(browser.browserContexts().length).toBe(1)
})

test.serial(
  'should close all belonging targets once closing context',
  async function ({ browser, server }) {
    expect((await browser.pages()).length).toBe(1)

    const context = await browser.createIncognitoBrowserContext()
    await context.newPage()
    expect((await browser.pages()).length).toBe(2)
    expect((await context.pages()).length).toBe(1)

    await context.close()
    expect((await browser.pages()).length).toBe(1)
  }
)

test.serial('window.open should use parent tab context', async function ({
  browser,
  server
}) {
  const context = await browser.createIncognitoBrowserContext()
  const page = await context.newPage()
  await page.goto(server.EMPTY_PAGE)
  const [popupTarget] = await Promise.all([
    utils.waitEvent(browser, 'targetcreated'),
    page.evaluate(url => window.open(url), server.EMPTY_PAGE)
  ])
  expect(popupTarget.browserContext()).toBe(context)
  await context.close()
})

test.serial('should fire target events', async function ({ browser, server }) {
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
  expect(events).toEqual([
    'CREATED: about:blank',
    `CHANGED: ${server.EMPTY_PAGE}`,
    `DESTROYED: ${server.EMPTY_PAGE}`
  ])
  await context.close()
})

test.serial('should wait for a target', async function ({ browser, server }) {
  const context = await browser.createIncognitoBrowserContext()
  let resolved = false
  const targetPromise = context.waitForTarget(
    target => target.url() === server.EMPTY_PAGE
  )
  targetPromise.then(() => (resolved = true))
  const page = await context.newPage()
  expect(resolved).toBe(false)
  await page.goto(server.EMPTY_PAGE)
  const target = await targetPromise
  expect(await target.page()).toBe(page)
  await context.close()
})

test.serial(
  'should timeout waiting for a non-existent target',
  async function ({ browser, server }) {
    const context = await browser.createIncognitoBrowserContext()
    const error = await context
      .waitForTarget(target => target.url() === server.EMPTY_PAGE, {
        timeout: 1
      })
      .catch(e => e)
    expect(error).toBeInstanceOf(TimeoutError)
    await context.close()
  }
)

test.serial('should isolate localStorage and cookies', async function ({
  browser,
  server
}) {
  // Create two incognito contexts.
  const context1 = await browser.createIncognitoBrowserContext()
  const context2 = await browser.createIncognitoBrowserContext()
  expect(context1.targets().length).toBe(0)
  expect(context2.targets().length).toBe(0)

  // Create a page in first incognito context.
  const page1 = await context1.newPage()
  await page1.goto(server.EMPTY_PAGE)
  await page1.evaluate(() => {
    localStorage.setItem('name', 'page1')
    document.cookie = 'name=page1'
  })

  expect(context1.targets().length).toBe(1)
  expect(context2.targets().length).toBe(0)

  // Create a page in second incognito context.
  const page2 = await context2.newPage()
  await page2.goto(server.EMPTY_PAGE)
  await page2.evaluate(() => {
    localStorage.setItem('name', 'page2')
    document.cookie = 'name=page2'
  })

  expect(context1.targets().length).toBe(1)
  expect(context1.targets()[0]).toBe(page1.target())
  expect(context2.targets().length).toBe(1)
  expect(context2.targets()[0]).toBe(page2.target())

  // Make sure pages don't share localstorage or cookies.
  expect(await page1.evaluate(() => localStorage.getItem('name'))).toBe('page1')
  expect(await page1.evaluate(() => document.cookie)).toBe('name=page1')
  expect(await page2.evaluate(() => localStorage.getItem('name'))).toBe('page2')
  expect(await page2.evaluate(() => document.cookie)).toBe('name=page2')

  // Cleanup contexts.
  await Promise.all([context1.close(), context2.close()])
  expect(browser.browserContexts().length).toBe(1)
})

test.serial('should work across sessions', async function ({
  browser,
  server
}) {
  expect(browser.browserContexts().length).toBe(1)
  const context = await browser.createIncognitoBrowserContext()
  expect(browser.browserContexts().length).toBe(2)
  const remoteBrowser = await puppeteer.connect({
    browserWSEndpoint: browser.wsEndpoint()
  })
  const contexts = remoteBrowser.browserContexts()
  expect(contexts.length).toBe(2)
  await remoteBrowser.disconnect()
  await context.close()
})
