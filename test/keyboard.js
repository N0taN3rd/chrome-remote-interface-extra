import test from 'ava'
import * as utils from './helpers/utils'
import * as os from 'os'
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

test.serial('Keyboard should type into a textarea', async t => {
  const { page, server } = t.context
  await page.evaluate(() => {
    const textarea = document.createElement('textarea')
    document.body.appendChild(textarea)
    textarea.focus()
  })
  const text = 'Hello world. I am the text that was typed!'
  await page.keyboard.type(text)
  t.is(
    await page.evaluate(() => document.querySelector('textarea').value),
    text
  )
})

test.serial('Keyboard should press the metaKey', async t => {
  const { page } = t.context
  await page.evaluate(() => {
    window.keyPromise = new Promise(resolve =>
      document.addEventListener('keydown', event => resolve(event.key))
    )
  })
  await page.keyboard.press('Meta')
  t.is(
    await page.evaluate('keyPromise'),
    false && os.platform() !== 'darwin' ? 'OS' : 'Meta'
  )
})

test.serial('Keyboard should move with the arrow keys', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/input/textarea.html')
  await page.type('textarea', 'Hello World!')
  t.is(
    await page.evaluate(() => document.querySelector('textarea').value),
    'Hello World!'
  )

  for (let i = 0; i < 'World!'.length; i++) page.keyboard.press('ArrowLeft')

  await page.keyboard.type('inserted ')
  t.is(
    await page.evaluate(() => document.querySelector('textarea').value),
    'Hello inserted World!'
  )
  page.keyboard.down('Shift')

  for (let i = 0; i < 'inserted '.length; i++) page.keyboard.press('ArrowLeft')

  page.keyboard.up('Shift')
  await page.keyboard.press('Backspace')
  t.is(
    await page.evaluate(() => document.querySelector('textarea').value),
    'Hello World!'
  )
})

test.serial(
  'Keyboard should send a character with ElementHandle.press',
  async t => {
    const { page, server } = t.context
    await page.goto(server.PREFIX + '/input/textarea.html')
    const textarea = await page.$('textarea')
    await textarea.press('a')
    t.is(
      await page.evaluate(() => document.querySelector('textarea').value),
      'a'
    )
    await page.evaluate(() =>
      window.addEventListener('keydown', e => e.preventDefault(), true)
    )
    await textarea.press('b')
    t.is(
      await page.evaluate(() => document.querySelector('textarea').value),
      'a'
    )
  }
)

test.serial(
  'Keyboard ElementHandle.press should support |text| option',
  async t => {
    const { page, server } = t.context
    await page.goto(server.PREFIX + '/input/textarea.html')
    const textarea = await page.$('textarea')
    await textarea.press('a', {
      text: 'ё'
    })
    t.is(
      await page.evaluate(() => document.querySelector('textarea').value),
      'ё'
    )
  }
)

test.serial('Keyboard should send a character with sendCharacter', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/input/textarea.html')
  await page.focus('textarea')
  await page.keyboard.sendCharacter('嗨')
  t.is(
    await page.evaluate(() => document.querySelector('textarea').value),
    '嗨'
  )
  await page.evaluate(() =>
    window.addEventListener('keydown', e => e.preventDefault(), true)
  )
  await page.keyboard.sendCharacter('a')
  t.is(
    await page.evaluate(() => document.querySelector('textarea').value),
    '嗨a'
  )
})

test.serial('Keyboard should report shiftKey', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/input/keyboard.html')
  const keyboard = page.keyboard
  const codeForKey = {
    Shift: 16,
    Alt: 18,
    Control: 17
  }

  for (const modifierKey in codeForKey) {
    await keyboard.down(modifierKey)
    t.is(
      await page.evaluate(() => getResult()),
      'Keydown: ' +
      modifierKey +
      ' ' +
      modifierKey +
      'Left ' +
      codeForKey[modifierKey] +
      ' [' +
      modifierKey +
      ']'
    )
    await keyboard.down('!') // Shift+! will generate a keypress

    if (modifierKey === 'Shift')
      t.is(
        await page.evaluate(() => getResult()),
        'Keydown: ! Digit1 49 [' +
        modifierKey +
        ']\nKeypress: ! Digit1 33 33 [' +
        modifierKey +
        ']'
      )
    else
      t.is(
        await page.evaluate(() => getResult()),
        'Keydown: ! Digit1 49 [' + modifierKey + ']'
      )
    await keyboard.up('!')
    t.is(
      await page.evaluate(() => getResult()),
      'Keyup: ! Digit1 49 [' + modifierKey + ']'
    )
    await keyboard.up(modifierKey)
    t.is(
      await page.evaluate(() => getResult()),
      'Keyup: ' +
      modifierKey +
      ' ' +
      modifierKey +
      'Left ' +
      codeForKey[modifierKey] +
      ' []'
    )
  }
})

test.serial('Keyboard should report multiple modifiers', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/input/keyboard.html')
  const keyboard = page.keyboard
  await keyboard.down('Control')
  t.is(
    await page.evaluate(() => getResult()),
    'Keydown: Control ControlLeft 17 [Control]'
  )
  await keyboard.down('Alt')
  t.is(
    await page.evaluate(() => getResult()),
    'Keydown: Alt AltLeft 18 [Alt Control]'
  )
  await keyboard.down(';')
  t.is(
    await page.evaluate(() => getResult()),
    'Keydown: ; Semicolon 186 [Alt Control]'
  )
  await keyboard.up(';')
  t.is(
    await page.evaluate(() => getResult()),
    'Keyup: ; Semicolon 186 [Alt Control]'
  )
  await keyboard.up('Control')
  t.is(
    await page.evaluate(() => getResult()),
    'Keyup: Control ControlLeft 17 [Alt]'
  )
  await keyboard.up('Alt')
  t.is(await page.evaluate(() => getResult()), 'Keyup: Alt AltLeft 18 []')
})

test.serial('Keyboard should send proper codes while typing', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/input/keyboard.html')
  await page.keyboard.type('!')
  t.is(
    await page.evaluate(() => getResult()),
    [
      'Keydown: ! Digit1 49 []',
      'Keypress: ! Digit1 33 33 []',
      'Keyup: ! Digit1 49 []'
    ].join('\n')
  )
  await page.keyboard.type('^')
  t.is(
    await page.evaluate(() => getResult()),
    [
      'Keydown: ^ Digit6 54 []',
      'Keypress: ^ Digit6 94 94 []',
      'Keyup: ^ Digit6 54 []'
    ].join('\n')
  )
})

test.serial(
  'Keyboard should send proper codes while typing with shift',
  async t => {
    const { page, server } = t.context
    await page.goto(server.PREFIX + '/input/keyboard.html')
    const keyboard = page.keyboard
    await keyboard.down('Shift')
    await page.keyboard.type('~')
    t.is(
      await page.evaluate(() => getResult()),
      [
        'Keydown: Shift ShiftLeft 16 [Shift]',
        'Keydown: ~ Backquote 192 [Shift]', // 192 is ` keyCode
        'Keypress: ~ Backquote 126 126 [Shift]', // 126 is ~ charCode
        'Keyup: ~ Backquote 192 [Shift]'
      ].join('\n')
    )
    await keyboard.up('Shift')
  }
)

test.serial('Keyboard should not type canceled events', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/input/textarea.html')
  await page.focus('textarea')
  await page.evaluate(() => {
    window.addEventListener(
      'keydown',
      event => {
        event.stopPropagation()
        event.stopImmediatePropagation()
        if (event.key === 'l') event.preventDefault()
        if (event.key === 'o') event.preventDefault()
      },
      false
    )
  })
  await page.keyboard.type('Hello World!')
  t.is(await page.evaluate(() => textarea.value), 'He Wrd!')
})

test.serial('Keyboard should specify repeat property', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/input/textarea.html')
  await page.focus('textarea')
  await page.evaluate(() =>
    document
      .querySelector('textarea')
      .addEventListener('keydown', e => (window.lastEvent = e), true)
  )
  await page.keyboard.down('a')
  t.false(await page.evaluate(() => window.lastEvent.repeat))
  await page.keyboard.press('a')
  t.true(await page.evaluate(() => window.lastEvent.repeat))
  await page.keyboard.down('b')
  t.false(await page.evaluate(() => window.lastEvent.repeat))
  await page.keyboard.down('b')
  t.true(await page.evaluate(() => window.lastEvent.repeat))
  await page.keyboard.up('a')
  await page.keyboard.down('a')
  t.false(await page.evaluate(() => window.lastEvent.repeat))
})

test.serial('Keyboard should type all kinds of characters', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/input/textarea.html')
  await page.focus('textarea')
  const text = 'This text goes onto two lines.\nThis character is 嗨.'
  await page.keyboard.type(text)
  t.is(await page.evaluate('result'), text)
})

test.serial('Keyboard should specify location', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/input/textarea.html')
  await page.evaluate(() => {
    window.addEventListener(
      'keydown',
      event => (window.keyLocation = event.location),
      true
    )
  })
  const textarea = await page.$('textarea')
  await textarea.press('Digit5')
  t.is(await page.evaluate('keyLocation'), 0)
  await textarea.press('ControlLeft')
  t.is(await page.evaluate('keyLocation'), 1)
  await textarea.press('ControlRight')
  t.is(await page.evaluate('keyLocation'), 2)
  await textarea.press('NumpadSubtract')
  t.is(await page.evaluate('keyLocation'), 3)
})

test.serial('Keyboard should throw on unknown keys', async t => {
  const { page, server } = t.context
  let error = await page.keyboard.press('NotARealKey').catch(e => e)
  t.is(error.message, 'Unknown key: "NotARealKey"')
  error = await page.keyboard.press('ё').catch(e => e)
  t.is(error && error.message, 'Unknown key: "ё"')
  error = await page.keyboard.press('😊').catch(e => e)
  t.is(error && error.message, 'Unknown key: "😊"')
})

test.serial('Keyboard should type emoji', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/input/textarea.html')
  await page.type('textarea', '👹 Tokyo street Japan 🇯🇵')
  t.is(
    await page.$eval('textarea', textarea => textarea.value),
    '👹 Tokyo street Japan 🇯🇵'
  )
})

test.serial('Keyboard should type emoji into an iframe', async t => {
  const { page, server } = t.context
  await page.goto(server.EMPTY_PAGE)
  await utils.attachFrame(
    page,
    'emoji-test',
    server.PREFIX + '/input/textarea.html'
  )
  const frame = page.frames()[1]
  const textarea = await frame.$('textarea')
  await textarea.type('👹 Tokyo street Japan 🇯🇵')
  t.is(
    await frame.$eval('textarea', textarea => textarea.value),
    '👹 Tokyo street Japan 🇯🇵'
  )
})

test.serial('Keyboard should press the meta key', async t => {
  const { page } = t.context
  await page.evaluate(() => {
    window.result = null
    document.addEventListener('keydown', event => {
      window.result = [event.key, event.code, event.metaKey]
    })
  })
  await page.keyboard.press('Meta')
  const [key, code, metaKey] = await page.evaluate('result')
  t.is(key, 'Meta')
  t.is(code, 'MetaLeft')
  t.true(metaKey)
})
