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
})

test.serial.afterEach(async t => {
  await helper.cleanup()
})

test.after.always(async t => {
  await helper.end()
})

test.serial('Workers Page.workers', async t => {
  const { page, server } = t.context
  await Promise.all([
    new Promise(x => page.once('workercreated', x)),
    page.goto(server.PREFIX + '/worker/worker.html')
  ])
  const worker = page.workers()[0]
  t.true(worker.url().includes('worker.js'))
  t.is(
    await worker.evaluate(() => self.workerFunction()),
    'worker function result'
  )
  await page.goto(server.EMPTY_PAGE)
  t.is(page.workers().length, 0)
})

test.serial('Workers should emit created and destroyed events', async t => {
  const { page } = t.context
  const workerCreatedPromise = new Promise(x => page.once('workercreated', x))
  const workerObj = await page.evaluateHandle(
    () => new Worker('data:text/javascript,1')
  )
  const worker = await workerCreatedPromise
  const workerThisObj = await worker.evaluateHandle(() => this)
  const workerDestroyedPromise = new Promise(x =>
    page.once('workerdestroyed', x)
  )
  await page.evaluate(workerObj => workerObj.terminate(), workerObj)
  t.is(await workerDestroyedPromise, worker)
  const error = await workerThisObj.getProperty('self').catch(error => error)
  t.true(error.message.includes('Most likely the worker has been closed.'))
})

test.serial('Workers should report console logs', async t => {
  const { page } = t.context
  const [message] = await Promise.all([
    waitEvent(page, 'console'),
    page.evaluate(() => new Worker(`data:text/javascript,console.log(1)`))
  ])
  t.is(message.text(), '1')
  t.deepEqual(message.location(), {
    url: 'data:text/javascript,console.log(1)',
    lineNumber: 0,
    columnNumber: 8
  })
})

test.serial('Workers should have JSHandles for console logs', async t => {
  const { page } = t.context
  const logPromise = new Promise(x => page.on('console', x))
  await page.evaluate(
    () => new Worker(`data:text/javascript,console.log(1,2,3,this)`)
  )
  const log = await logPromise
  t.is(log.text(), '1 2 3 JSHandle@object')
  t.is(log.args().length, 4)
  t.is(await (await log.args()[3].getProperty('origin')).jsonValue(), 'null')
})

test.serial('Workers should have an execution context', async t => {
  const { page } = t.context
  const workerCreatedPromise = new Promise(x => page.once('workercreated', x))
  await page.evaluate(() => new Worker(`data:text/javascript,console.log(1)`))
  const worker = await workerCreatedPromise
  t.is(await (await worker.executionContext()).evaluate('1+1'), 2)
})

test.serial('Workers should report errors', async t => {
  const { page } = t.context
  const errorPromise = new Promise(x => page.on('pageerror', x))
  await page.evaluate(
    () =>
      new Worker(`data:text/javascript, throw new Error('this is my error');`)
  )
  const errorLog = await errorPromise
  t.true(errorLog.message.includes('this is my error'))
})
