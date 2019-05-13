import test from 'ava'
import * as fs from 'fs-extra'
import * as path from 'path'
import { TestHelper } from './helpers/testHelper'

/** @type {TestHelper} */
let helper

test.serial.before(async t => {
  helper = await TestHelper.withHTTP(t)
})

test.serial.beforeEach(async t => {
  t.context.page = await helper.newPage()
  t.context.server = helper.server()

  t.context.browser = helper.browser()
  t.context.outputFile = path.join(
    __dirname,
    'fixtures',
    'assets',
    `trace-0.json`
  )
})

test.serial.afterEach.always(async t => {
  await helper.cleanup()
  await fs.remove(t.context.outputFile)
})

test.after.always(async t => {
  await helper.end()
})

test.serial('Tracing should output a trace', async t => {
  const { page, server, outputFile } = t.context
  await page.tracing.start({
    screenshots: true,
    path: outputFile
  })
  await page.goto(server.PREFIX + '/grid.html')
  await page.tracing.stop()
  t.true(fs.existsSync(outputFile))
})

test.serial(
  'Tracing should run with custom categories if provided',
  async t => {
    const { page, outputFile } = t.context
    await page.tracing.start({
      path: outputFile,
      categories: ['disabled-by-default-v8.cpu_profiler.hires']
    })
    await page.tracing.stop()
    const traceJson = await fs.readJson(outputFile)
    t.true(
      traceJson.metadata['trace-config'].includes(
        'disabled-by-default-v8.cpu_profiler.hires'
      )
    )
  }
)

test.serial('Tracing should throw if tracing on two pages', async t => {
  const { page, server, browser, outputFile } = t.context
  await page.tracing.start({
    path: outputFile
  })
  const newPage = await browser.newPage()
  let error = null
  await newPage.tracing
    .start({
      path: outputFile
    })
    .catch(e => (error = e))
  await newPage.close()
  t.truthy(error)
  await page.tracing.stop()
})

test.serial('Tracing should return a buffer', async t => {
  const { page, server, outputFile } = t.context
  await page.tracing.start({
    screenshots: true,
    path: outputFile
  })
  await page.goto(server.PREFIX + '/grid.html')
  const trace = await page.tracing.stop()
  const buf = fs.readFileSync(outputFile)
  t.deepEqual(trace.toString(), buf.toString())
})

test.serial('Tracing should work without options', async t => {
  const { page, server, outputFile } = t.context
  await page.tracing.start()
  await page.goto(server.PREFIX + '/grid.html')
  const trace = await page.tracing.stop()
  t.truthy(trace)
})

test.serial('Tracing should return null in case of Buffer error', async t => {
  const { page, server } = t.context
  await page.tracing.start({ screenshots: true })
  await page.goto(server.PREFIX + '/grid.html')
  const oldBufferConcat = Buffer.concat

  Buffer.concat = bufs => {
    throw 'error'
  }

  const trace = await page.tracing.stop()
  t.deepEqual(trace, null)
  Buffer.concat = oldBufferConcat
})

test.serial('Tracing should support a buffer without a path', async t => {
  const { page, server } = t.context
  await page.tracing.start({ screenshots: true })
  await page.goto(server.PREFIX + '/grid.html')
  const trace = await page.tracing.stop()
  t.true(trace.toString().includes('screenshot'))
})
