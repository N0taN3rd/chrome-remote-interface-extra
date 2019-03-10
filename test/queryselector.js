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

test.serial.afterEach.always(async t => {
  await helper.cleanup()
})

test.after.always(async t => {
  await helper.end()
})

test.serial('Page.$eval should work', async t => {
  const { page, server } = t.context
  await page.setContent('<section id="testAttribute">43543</section>')
  const idAttribute = await page.$eval('section', e => e.id)
  t.is(idAttribute, 'testAttribute')
})

test.serial('Page.$eval should accept arguments', async t => {
  const { page, server } = t.context
  await page.setContent('<section>hello</section>')
  const text = await page.$eval(
    'section',
    (e, suffix) => e.textContent + suffix,
    ' world!'
  )
  t.is(text, 'hello world!')
})

test.serial('Page.$eval should accept ElementHandles as arguments', async t => {
  const { page, server } = t.context
  await page.setContent('<section>hello</section><div> world</div>')
  const divHandle = await page.$('div')
  const text = await page.$eval(
    'section',
    (e, div) => e.textContent + div.textContent,
    divHandle
  )
  t.is(text, 'hello world')
})

test.serial('Page.$eval should throw error if no element is found', async t => {
  const { page, server } = t.context
  let error = null
  await page.$eval('section', e => e.id).catch(e => (error = e))
  t.true(
    error.message.includes('failed to find element matching selector "section"')
  )
})

test.serial('Page.$$eval should work', async t => {
  const { page, server } = t.context
  await page.setContent('<div>hello</div><div>beautiful</div><div>world!</div>')
  const divsCount = await page.$$eval('div', divs => divs.length)
  t.is(divsCount, 3)
})

test.serial('Page.$ should query existing element', async t => {
  const { page, server } = t.context
  await page.setContent('<section>test</section>')
  const element = await page.$('section')
  t.truthy(element)
})

test.serial('Page.$ should return null for non-existing element', async t => {
  const { page, server } = t.context
  const element = await page.$('non-existing-element')
  t.falsy(element)
})

test.serial('Page.$$ should query existing elements', async t => {
  const { page, server } = t.context
  await page.setContent('<div>A</div><br/><div>B</div>')
  const elements = await page.$$('div')
  t.is(elements.length, 2)
  const promises = elements.map(element =>
    page.evaluate(e => e.textContent, element)
  )
  t.deepEqual(await Promise.all(promises), ['A', 'B'])
})

test.serial(
  'Page.$$ should return empty array if nothing is found',
  async t => {
    const { page, server } = t.context
    await page.goto(server.EMPTY_PAGE)
    const elements = await page.$$('div')
    t.is(elements.length, 0)
  }
)

test.serial('Path.$x should query existing element', async t => {
  const { page, server } = t.context
  await page.setContent('<section>test</section>')
  const elements = await page.$x('/html/body/section')
  t.truthy(elements[0])
  t.is(elements.length, 1)
})

test.serial(
  'Path.$x should return empty array for non-existing element',
  async t => {
    const { page, server } = t.context
    const element = await page.$x('/html/body/non-existing-element')
    t.deepEqual(element, [])
  }
)

test.serial('Path.$x should return multiple elements', async t => {
  const { page, sever } = t.context
  await page.setContent('<div></div><div></div>')
  const elements = await page.$x('/html/body/div')
  t.is(elements.length, 2)
})

test.serial('ElementHandle.$ should query existing element', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/playground.html')
  await page.setContent(
    '<html><body><div class="second"><div class="inner">A</div></div></body></html>'
  )
  const html = await page.$('html')
  const second = await html.$('.second')
  const inner = await second.$('.inner')
  const content = await page.evaluate(e => e.textContent, inner)
  t.is(content, 'A')
})

test.serial(
  'ElementHandle.$ should return null for non-existing element',
  async t => {
    const { page, server } = t.context
    await page.setContent(
      '<html><body><div class="second"><div class="inner">B</div></div></body></html>'
    )
    const html = await page.$('html')
    const second = await html.$('.third')
    t.falsy(second)
  }
)

test.serial('ElementHandle.$eval should work', async t => {
  const { page, server } = t.context
  await page.setContent(
    '<html><body><div class="tweet"><div class="like">100</div><div class="retweets">10</div></div></body></html>'
  )
  const tweet = await page.$('.tweet')
  const content = await tweet.$eval('.like', node => node.innerText)
  t.is(content, '100')
})

test.serial(
  'ElementHandle.$eval should retrieve content from subtree',
  async t => {
    const { page, server } = t.context
    const htmlContent =
      '<div class="a">not-a-child-div</div><div id="myId"><div class="a">a-child-div</div></div>'
    await page.setContent(htmlContent)
    const elementHandle = await page.$('#myId')
    const content = await elementHandle.$eval('.a', node => node.innerText)
    t.is(content, 'a-child-div')
  }
)

test.serial(
  'ElementHandle.$eval should throw in case of missing selector',
  async t => {
    const { page, server } = t.context
    const htmlContent =
      '<div class="a">not-a-child-div</div><div id="myId"></div>'
    await page.setContent(htmlContent)
    const elementHandle = await page.$('#myId')
    const errorMessage = await elementHandle
      .$eval('.a', node => node.innerText)
      .catch(error => error.message)
    t.is(errorMessage, `Error: failed to find element matching selector ".a"`)
  }
)

test.serial('ElementHandle.$$eval should work', async t => {
  const { page, server } = t.context
  await page.setContent(
    '<html><body><div class="tweet"><div class="like">100</div><div class="like">10</div></div></body></html>'
  )
  const tweet = await page.$('.tweet')
  const content = await tweet.$$eval('.like', nodes =>
    nodes.map(n => n.innerText)
  )
  t.deepEqual(content, ['100', '10'])
})

test.serial(
  'ElementHandle.$$eval should retrieve content from subtree',
  async t => {
    const { page, server } = t.context
    const htmlContent =
      '<div class="a">not-a-child-div</div><div id="myId"><div class="a">a1-child-div</div><div class="a">a2-child-div</div></div>'
    await page.setContent(htmlContent)
    const elementHandle = await page.$('#myId')
    const content = await elementHandle.$$eval('.a', nodes =>
      nodes.map(n => n.innerText)
    )
    t.deepEqual(content, ['a1-child-div', 'a2-child-div'])
  }
)

test.serial(
  'ElementHandle.$$eval should not throw in case of missing selector',
  async t => {
    const { page, server } = t.context
    const htmlContent =
      '<div class="a">not-a-child-div</div><div id="myId"></div>'
    await page.setContent(htmlContent)
    const elementHandle = await page.$('#myId')
    const nodesLength = await elementHandle.$$eval('.a', nodes => nodes.length)
    t.is(nodesLength, 0)
  }
)

test.serial('ElementHandle.$$ should query existing elements', async t => {
  const { page, server } = t.context
  await page.setContent(
    '<html><body><div>A</div><br/><div>B</div></body></html>'
  )
  const html = await page.$('html')
  const elements = await html.$$('div')
  t.is(elements.length, 2)
  const promises = elements.map(element =>
    page.evaluate(e => e.textContent, element)
  )
  t.deepEqual(await Promise.all(promises), ['A', 'B'])
})

test.serial(
  'ElementHandle.$$ should return empty array for non-existing elements',
  async t => {
    const { page, server } = t.context
    await page.setContent(
      '<html><body><span>A</span><br/><span>B</span></body></html>'
    )
    const html = await page.$('html')
    const elements = await html.$$('div')
    t.is(elements.length, 0)
  }
)

test.serial('ElementHandle.$x should query existing element', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/playground.html')
  await page.setContent(
    '<html><body><div class="second"><div class="inner">A</div></div></body></html>'
  )
  const html = await page.$('html')
  const second = await html.$x(`./body/div[contains(@class, 'second')]`)
  const inner = await second[0].$x(`./div[contains(@class, 'inner')]`)
  const content = await page.evaluate(e => e.textContent, inner[0])
  t.is(content, 'A')
})

test.serial(
  'ElementHandle.$x should return null for non-existing element',
  async t => {
    const { page, server } = t.context
    await page.setContent(
      '<html><body><div class="second"><div class="inner">B</div></div></body></html>'
    )
    const html = await page.$('html')
    const second = await html.$x(`/div[contains(@class, 'third')]`)
    t.deepEqual(second, [])
  }
)
