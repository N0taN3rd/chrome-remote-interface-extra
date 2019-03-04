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
})

test.serial.afterEach(async t => {
  await helper.cleanup()
})

test.after.always(async t => {
  await helper.end()
})

function findFocusedNode (node) {
  if (node.focused) return node

  for (const child of node.children || []) {
    const focusedChild = findFocusedNode(child)
    if (focusedChild) return focusedChild
  }

  return null
}

test.serial('Accessibility should work', async t => {
  const { page } = t.context
  await page.setContent(`
      <head>
        <title>Accessibility Test</title>
      </head>
      <body>
        <div>Hello World</div>
        <h1>Inputs</h1>
        <input placeholder="Empty input" autofocus />
        <input placeholder="readonly input" readonly />
        <input placeholder="disabled input" disabled />
        <input aria-label="Input with whitespace" value="  " />
        <input value="value only" />
        <input aria-placeholder="placeholder" value="and a value" />
        <div aria-hidden="true" id="desc">This is a description!</div>
        <input aria-placeholder="placeholder" value="and a value" aria-describedby="desc" />
        <select>
          <option>First Option</option>
          <option>Second Option</option>
        </select>
      </body>`)
  const golden = {
    role: 'WebArea',
    name: 'Accessibility Test',
    children: [
      {
        role: 'text',
        name: 'Hello World'
      },
      {
        role: 'heading',
        name: 'Inputs',
        level: 1
      },
      {
        role: 'textbox',
        name: 'Empty input',
        focused: true
      },
      {
        role: 'textbox',
        name: 'readonly input',
        readonly: true
      },
      {
        role: 'textbox',
        name: 'disabled input',
        disabled: true
      },
      {
        role: 'textbox',
        name: 'Input with whitespace',
        value: '  '
      },
      {
        role: 'textbox',
        name: '',
        value: 'value only'
      },
      {
        role: 'textbox',
        name: 'placeholder',
        value: 'and a value'
      },
      {
        role: 'textbox',
        name: 'placeholder',
        value: 'and a value',
        description: 'This is a description!'
      },
      {
        role: 'combobox',
        name: '',
        value: 'First Option',
        children: [
          {
            role: 'menuitem',
            name: 'First Option',
            selected: true
          },
          {
            role: 'menuitem',
            name: 'Second Option'
          }
        ]
      }
    ]
  }
  t.deepEqual(await page.accessibility.snapshot(), golden)
})

test.serial('Accessibility should report uninteresting nodes', async t => {
  const { page } = t.context
  await page.setContent(`<textarea autofocus>hi</textarea>`)
  const golden = {
    role: 'textbox',
    name: '',
    value: 'hi',
    focused: true,
    multiline: true,
    children: [
      {
        role: 'GenericContainer',
        name: '',
        children: [
          {
            role: 'text',
            name: 'hi'
          }
        ]
      }
    ]
  }
  t.deepEqual(
    findFocusedNode(
      await page.accessibility.snapshot({
        interestingOnly: false
      })
    ),
    golden
  )
})

test.serial('Accessibility roledescription', async t => {
  const { page } = t.context
  await page.setContent('<div tabIndex=-1 aria-roledescription="foo">Hi</div>')
  const snapshot = await page.accessibility.snapshot()
  t.deepEqual(snapshot.children[0].roledescription, 'foo')
})

test.serial('Accessibility orientation', async t => {
  const { page } = t.context
  await page.setContent(
    '<a href="" role="slider" aria-orientation="vertical">11</a>'
  )
  const snapshot = await page.accessibility.snapshot()
  t.deepEqual(snapshot.children[0].orientation, 'vertical')
})

test.serial('Accessibility autocomplete', async t => {
  const { page } = t.context
  await page.setContent('<input type="number" aria-autocomplete="list" />')
  const snapshot = await page.accessibility.snapshot()
  t.deepEqual(snapshot.children[0].autocomplete, 'list')
})

test.serial('Accessibility multiselectable', async t => {
  const { page } = t.context
  await page.setContent(
    '<div role="grid" tabIndex=-1 aria-multiselectable=true>hey</div>'
  )
  const snapshot = await page.accessibility.snapshot()
  t.deepEqual(snapshot.children[0].multiselectable, true)
})

test.serial('Accessibility keyshortcuts', async t => {
  const { page } = t.context
  await page.setContent(
    '<div role="grid" tabIndex=-1 aria-keyshortcuts="foo">hey</div>'
  )
  const snapshot = await page.accessibility.snapshot()
  t.deepEqual(snapshot.children[0].keyshortcuts, 'foo')
})

test.serial(
  'Accessibility - filtering children of leaf nodes: should not report text nodes inside controls',
  async t => {
    const { page } = t.context
    await page.setContent(`
        <div role="tablist">
          <div role="tab" aria-selected="true"><b>Tab1</b></div>
          <div role="tab">Tab2</div>
        </div>`)
    const golden = {
      role: 'WebArea',
      name: '',
      children: [
        {
          role: 'tab',
          name: 'Tab1',
          selected: true
        },
        {
          role: 'tab',
          name: 'Tab2'
        }
      ]
    }
    t.deepEqual(await page.accessibility.snapshot(), golden)
  }
)

test.serial(
  'Accessibility - filtering children of leaf nodes: rich text editable fields should have children',
  async t => {
    const { page } = t.context
    await page.setContent(`
        <div contenteditable="true">
          Edit this image: <img src="fakeimage.png" alt="my fake image">
        </div>`)
    const golden = {
      role: 'GenericContainer',
      name: '',
      value: 'Edit this image: ',
      children: [
        {
          role: 'text',
          name: 'Edit this image:'
        },
        {
          role: 'img',
          name: 'my fake image'
        }
      ]
    }
    const snapshot = await page.accessibility.snapshot()
    t.deepEqual(snapshot.children[0], golden)
  }
)

test.serial(
  'Accessibility - filtering children of leaf nodes: rich text editable fields with role should have children',
  async t => {
    const { page } = t.context
    await page.setContent(`
        <div contenteditable="true" role='textbox'>
          Edit this image: <img src="fakeimage.png" alt="my fake image">
        </div>`)
    const golden = {
      role: 'textbox',
      name: '',
      value: 'Edit this image: ',
      children: [
        {
          role: 'text',
          name: 'Edit this image:'
        },
        {
          role: 'img',
          name: 'my fake image'
        }
      ]
    }
    const snapshot = await page.accessibility.snapshot()
    t.deepEqual(snapshot.children[0], golden)
  }
)

test.serial(
  'filtering children of leaf nodes - plaintext contenteditable: plain text field with role should not have children',
  async t => {
    const { page } = t.context
    await page.setContent(`
          <div contenteditable="plaintext-only" role='textbox'>Edit this image:<img src="fakeimage.png" alt="my fake image"></div>`)
    const snapshot = await page.accessibility.snapshot()
    t.deepEqual(snapshot.children[0], {
      role: 'textbox',
      name: '',
      value: 'Edit this image:'
    })
  }
)

test.serial(
  'filtering children of leaf nodes - plaintext contenteditable: plain text field without role should not have content',
  async t => {
    const { page } = t.context
    await page.setContent(`
          <div contenteditable="plaintext-only">Edit this image:<img src="fakeimage.png" alt="my fake image"></div>`)
    const snapshot = await page.accessibility.snapshot()
    t.deepEqual(snapshot.children[0], {
      role: 'GenericContainer',
      name: ''
    })
  }
)

test.serial(
  'filtering children of leaf nodes - plaintext contenteditable: plain text field with tabindex and without role should not have content',
  async t => {
    const { page } = t.context
    await page.setContent(`
          <div contenteditable="plaintext-only" tabIndex=0>Edit this image:<img src="fakeimage.png" alt="my fake image"></div>`)
    const snapshot = await page.accessibility.snapshot()
    t.deepEqual(snapshot.children[0], {
      role: 'GenericContainer',
      name: ''
    })
  }
)

test.serial(
  'Accessibility - filtering children of leaf nodes: non editable textbox with role and tabIndex and label should not have children',
  async t => {
    const { page } = t.context
    await page.setContent(`
        <div role="textbox" tabIndex=0 aria-checked="true" aria-label="my favorite textbox">
          this is the inner content
          <img alt="yo" src="fakeimg.png">
        </div>`)
    const golden = {
      role: 'textbox',
      name: 'my favorite textbox',
      value: 'this is the inner content '
    }
    const snapshot = await page.accessibility.snapshot()
    t.deepEqual(snapshot.children[0], golden)
  }
)

test.serial(
  'Accessibility - filtering children of leaf nodes: checkbox with and tabIndex and label should not have children',
  async t => {
    const { page } = t.context
    await page.setContent(`
        <div role="checkbox" tabIndex=0 aria-checked="true" aria-label="my favorite checkbox">
          this is the inner content
          <img alt="yo" src="fakeimg.png">
        </div>`)
    const golden = {
      role: 'checkbox',
      name: 'my favorite checkbox',
      checked: true
    }
    const snapshot = await page.accessibility.snapshot()
    t.deepEqual(snapshot.children[0], golden)
  }
)

test.serial(
  'Accessibility - filtering children of leaf nodes: checkbox without label should not have children',
  async t => {
    const { page } = t.context
    await page.setContent(`
        <div role="checkbox" aria-checked="true">
          this is the inner content
          <img alt="yo" src="fakeimg.png">
        </div>`)
    const golden = {
      role: 'checkbox',
      name: 'this is the inner content yo',
      checked: true
    }
    const snapshot = await page.accessibility.snapshot()
    t.deepEqual(snapshot.children[0], golden)
  }
)
