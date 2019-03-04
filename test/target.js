import test from 'ava'
import * as utils from './helpers/utils'
import TestHelper from './helpers/testHelper'
import { TimeoutError } from '../lib/Errors'

const { waitEvent } = utils

/** @type {TestHelper} */
let helper

test.before(async t => {
  helper = await TestHelper.withHTTP(t)
})

test.serial.beforeEach(async t => {
  /** @type {Page} */
  t.context.page = await helper.newPage()
  t.context.server = helper.server()
  /**  @type {Browser} */
  t.context.browser = helper.browser()
  t.context.context = await helper.context()
})

test.serial.afterEach(async t => {
  await helper.cleanup()
})

test.after.always(async t => {
  await helper.end()
})

test.serial(
  'Target Browser.targets should return all of the targets',
  async t => {
    const { page, server, browser } = t.context
    // The pages will be the testing page and the original newtab page
    const targets = browser.targets()
    t.truthy(
      targets.some(
        target => target.type() === 'page' && target.url() === 'about:blank'
      )
    )
    t.truthy(targets.some(target => target.type() === 'browser'))
  }
)

test.serial('Target Browser.pages should return all of the pages', async t => {
  const { page, server, context } = t.context
  // The pages will be the testing page
  const allPages = await context.pages()
  t.is(allPages.length, 1)
  t.true(allPages.includes(page))
  t.true(allPages[0] != allPages[1])
})

test.serial('Target should contain browser target', async t => {
  const { browser } = t.context
  const targets = browser.targets()
  const browserTarget = targets.find(target => target.type() === 'browser')
  t.truthy(browserTarget)
})

test.serial(
  'Target should be able to use the default page in the browser',
  async t => {
    const { page, server, browser } = t.context
    // The pages will be the testing page and the original newtab page
    const allPages = await browser.pages()
    const originalPage = allPages.find(p => p !== page)
    t.is(
      await originalPage.evaluate(() => ['Hello', 'world'].join(' ')),
      'Hello world'
    )
    t.truthy(await originalPage.$('body'))
  }
)

test.serial(
  'Target should report when a new page is created and closed',
  async t => {
    const { page, server, context } = t.context
    const [otherPage] = await Promise.all([
      context
        .waitForTarget(
          target => target.url() === server.CROSS_PROCESS_PREFIX + '/empty.html'
        )
        .then(target => target.page()),
      page.evaluate(
        url => window.open(url),
        server.CROSS_PROCESS_PREFIX + '/empty.html'
      )
    ])
    t.true(otherPage.url().includes(server.CROSS_PROCESS_PREFIX))
    t.is(
      await otherPage.evaluate(() => ['Hello', 'world'].join(' ')),
      'Hello world'
    )
    t.truthy(await otherPage.$('body'))
    let allPages = await context.pages()
    t.true(allPages.includes(page))
    t.true(allPages.includes(otherPage))
    const closePagePromise = new Promise(fulfill =>
      context.once('targetdestroyed', target => fulfill(target.page()))
    )
    await otherPage.close()
    t.is(await closePagePromise, otherPage)
    allPages = await Promise.all(context.targets().map(target => target.page()))
    t.true(allPages.includes(page))
    t.false(allPages.includes(otherPage))
  }
)

test.serial(
  'Target should report when a service worker is created and destroyed',
  async t => {
    const { page, server, context } = t.context
    await page.goto(server.EMPTY_PAGE)
    const createdTarget = new Promise(fulfill =>
      context.once('targetcreated', target => fulfill(target))
    )
    await page.goto(server.PREFIX + '/serviceworkers/empty/sw.html')
    t.is((await createdTarget).type(), 'service_worker')
    t.is(
      (await createdTarget).url(),
      server.PREFIX + '/serviceworkers/empty/sw.js'
    )
    const destroyedTarget = new Promise(fulfill =>
      context.once('targetdestroyed', target => fulfill(target))
    )
    await page.evaluate(() =>
      window.registrationPromise.then(registration => registration.unregister())
    )
    t.is(await destroyedTarget, await createdTarget)
  }
)

test.serial('Target should report when a target url changes', async t => {
  const { page, server, context } = t.context
  await page.goto(server.EMPTY_PAGE)
  let changedTarget = new Promise(fulfill =>
    context.once('targetchanged', target => fulfill(target))
  )
  await page.goto(server.CROSS_PROCESS_PREFIX + '/')
  t.is((await changedTarget).url(), server.CROSS_PROCESS_PREFIX + '/')
  changedTarget = new Promise(fulfill =>
    context.once('targetchanged', target => fulfill(target))
  )
  await page.goto(server.EMPTY_PAGE)
  t.is((await changedTarget).url(), server.EMPTY_PAGE)
})

test.serial('Target should not report uninitialized pages', async t => {
  const { page, server, context } = t.context
  let targetChanged = false

  const listener = () => (targetChanged = true)

  context.on('targetchanged', listener)
  const targetPromise = new Promise(fulfill =>
    context.once('targetcreated', target => fulfill(target))
  )
  const newPagePromise = context.newPage()
  const target = await targetPromise
  t.is(target.url(), 'about:blank')
  const newPage = await newPagePromise
  const targetPromise2 = new Promise(fulfill =>
    context.once('targetcreated', target => fulfill(target))
  )
  const evaluatePromise = newPage.evaluate(() => window.open('about:blank'))
  const target2 = await targetPromise2
  t.is(target2.url(), 'about:blank')
  await evaluatePromise
  await newPage.close()
  t.false(targetChanged)
  context.removeListener('targetchanged', listener)
})

test.serial(
  'Target should not crash while redirecting if original request was missed',
  async t => {
    const { page, server, context } = t.context

    await Promise.all([
      page.evaluate(
        url => window.open(url),
        server.PREFIX + '/one-style-redir.html'
      ),
      server.waitForRequest('/one-style-redir.css')
    ]) // Connect to the opened page.

    const target = await context.waitForTarget(target =>
      target.url().includes('one-style-redir.html')
    )
    const newPage = await target.page() // Issue a redirect.

    await waitEvent(newPage, 'load') // Cleanup.

    await newPage.close()
    t.pass()
  }
)

test.serial('Target should have an opener', async t => {
  const { page, server, context } = t.context
  await page.goto(server.EMPTY_PAGE)
  const [createdTarget] = await Promise.all([
    new Promise(fulfill =>
      context.once('targetcreated', target => fulfill(target))
    ),
    page.goto(server.PREFIX + '/popup/window-open.html')
  ])
  t.is((await createdTarget.page()).url(), server.PREFIX + '/popup/popup.html')
  t.is(createdTarget.opener(), page.target())
  t.is(page.target().opener(), null)
})

test.serial('Browser.waitForTarget should wait for a target', async t => {
  const { browser, server } = t.context
  let resolved = false
  const targetPromise = browser.waitForTarget(
    target => target.url() === server.EMPTY_PAGE
  )
  targetPromise.then(() => (resolved = true))
  const page = await browser.newPage()
  t.false(resolved)
  await page.goto(server.EMPTY_PAGE)
  const target = await targetPromise
  t.is(await target.page(), page)
  await page.close()
})

test.serial(
  'Browser.waitForTarget should timeout waiting for a non-existent target',
  async t => {
    const { browser, server } = t.context
    let error = null
    await browser
      .waitForTarget(target => target.url() === server.EMPTY_PAGE, {
        timeout: 1
      })
      .catch(e => (error = e))
    t.true(error instanceof TimeoutError)
  }
)
