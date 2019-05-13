import test from 'ava'
import * as utils from './helpers/utils'
import * as os from 'os'
import { TestHelper } from './helpers/testHelper'

/** @type {TestHelper} */
let helper

test.serial.before(async t => {
  helper = await TestHelper.withHTTP(t)
})

test.serial.beforeEach(async t => {
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
  const testResult = await page.evaluate(
    () => document.querySelector('textarea').value
  )
  t.is(testResult, text)
})

test.serial('Keyboard should press the metaKey', async t => {
  const { page } = t.context
  await page.evaluate(() => {
    window.keyPromise = new Promise(resolve =>
      document.addEventListener('keydown', event => resolve(event.key))
    )
  })
  await page.keyboard.press('Meta')
  const testResult = await page.evaluate('keyPromise')
  t.is(testResult, false && os.platform() !== 'darwin' ? 'OS' : 'Meta')
})

test.serial('Keyboard should move with the arrow keys', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/input/textarea.html')
  await page.type('textarea', 'Hello World!')
  const testResult = await page.evaluate(
    () => document.querySelector('textarea').value
  )
  t.is(testResult, 'Hello World!')

  for (let i = 0; i < 'World!'.length; i++) page.keyboard.press('ArrowLeft')

  await page.keyboard.type('inserted ')
  const testResult1 = await page.evaluate(
    () => document.querySelector('textarea').value
  )
  t.is(testResult1, 'Hello inserted World!')

  page.keyboard.down('Shift')

  for (let i = 0; i < 'inserted '.length; i++) page.keyboard.press('ArrowLeft')

  page.keyboard.up('Shift')
  await page.keyboard.press('Backspace')
  const testResult2 = await page.evaluate(
    () => document.querySelector('textarea').value
  )
  t.is(testResult2, 'Hello World!')
})

test.serial(
  'Keyboard should send a character with ElementHandle.press',
  async t => {
    const { page, server } = t.context
    await page.goto(server.PREFIX + '/input/textarea.html')
    const textarea = await page.$('textarea')
    await textarea.press('a')
    const testResult = await page.evaluate(
      () => document.querySelector('textarea').value
    )
    t.is(testResult, 'a')

    await page.evaluate(() =>
      window.addEventListener('keydown', e => e.preventDefault(), true)
    )

    await textarea.press('b')
    const testResult1 = await page.evaluate(
      () => document.querySelector('textarea').value
    )
    t.is(testResult1, 'a')
  }
)

test.serial(
  'Keyboard ElementHandle.press should support |text| option',
  async t => {
    const { page, server } = t.context
    await page.goto(server.PREFIX + '/input/textarea.html')
    const textarea = await page.$('textarea')
    await textarea.press('a', { text: 'ё' })
    const testResult = await page.evaluate(
      () => document.querySelector('textarea').value
    )
    t.is(testResult, 'ё')
  }
)

test.serial('Keyboard should send a character with sendCharacter', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/input/textarea.html')
  await page.focus('textarea')
  await page.keyboard.sendCharacter('嗨')
  const testResult = await page.evaluate(
    () => document.querySelector('textarea').value
  )
  t.is(testResult, '嗨')

  await page.evaluate(() =>
    window.addEventListener('keydown', e => e.preventDefault(), true)
  )

  await page.keyboard.sendCharacter('a')
  const testResult1 = await page.evaluate(
    () => document.querySelector('textarea').value
  )
  t.is(testResult1, '嗨a')
})

test.serial('Keyboard should report shiftKey', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/input/keyboard.html')
  const keyboard = page.keyboard
  const codeForKey = { Shift: 16, Alt: 18, Control: 17 }
  for (const modifierKey in codeForKey) {
    await keyboard.down(modifierKey)
    const testResult = await page.evaluate(() => getResult())
    t.is(
      testResult,
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

    await keyboard.down('!')
    // Shift+! will generate a keypress
    if (modifierKey === 'Shift') {
      const testResult1 = await page.evaluate(() => getResult())
      t.is(
        testResult1,
        'Keydown: ! Digit1 49 [' +
          modifierKey +
          ']\nKeypress: ! Digit1 33 33 [' +
          modifierKey +
          ']'
      )
    } else {
      const testResult2 = await page.evaluate(() => getResult())
      t.is(testResult2, 'Keydown: ! Digit1 49 [' + modifierKey + ']')
    }

    await keyboard.up('!')
    const testResult3 = await page.evaluate(() => getResult())
    t.is(testResult3, 'Keyup: ! Digit1 49 [' + modifierKey + ']')

    await keyboard.up(modifierKey)
    const testResult4 = await page.evaluate(() => getResult())
    t.is(
      testResult4,
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
  const testResult = await page.evaluate(() => getResult())
  t.is(testResult, 'Keydown: Control ControlLeft 17 [Control]')

  await keyboard.down('Alt')
  const testResult1 = await page.evaluate(() => getResult())
  t.is(testResult1, 'Keydown: Alt AltLeft 18 [Alt Control]')

  await keyboard.down(';')
  const testResult2 = await page.evaluate(() => getResult())
  t.is(testResult2, 'Keydown: ; Semicolon 186 [Alt Control]')

  await keyboard.up(';')
  const testResult3 = await page.evaluate(() => getResult())
  t.is(testResult3, 'Keyup: ; Semicolon 186 [Alt Control]')

  await keyboard.up('Control')
  const testResult4 = await page.evaluate(() => getResult())
  t.is(testResult4, 'Keyup: Control ControlLeft 17 [Alt]')

  await keyboard.up('Alt')
  const testResult5 = await page.evaluate(() => getResult())
  t.is(testResult5, 'Keyup: Alt AltLeft 18 []')
})

test.serial('Keyboard should send proper codes while typing', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/input/keyboard.html')
  await page.keyboard.type('!')
  const testResult = await page.evaluate(() => getResult())
  t.is(
    testResult,
    [
      'Keydown: ! Digit1 49 []',
      'Keypress: ! Digit1 33 33 []',
      'Keyup: ! Digit1 49 []'
    ].join('\n')
  )

  await page.keyboard.type('^')
  const testResult1 = await page.evaluate(() => getResult())
  t.is(
    testResult1,
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
    const testResult = await page.evaluate(() => getResult())
    t.is(
      testResult,
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
  const testResult = await page.evaluate(() => textarea.value)
  t.is(testResult, 'He Wrd!')
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
  const testResult = await page.evaluate(() => window.lastEvent.repeat)
  t.false(testResult)
  await page.keyboard.press('a')
  const testResult1 = await page.evaluate(() => window.lastEvent.repeat)
  t.true(testResult1)

  await page.keyboard.down('b')
  const testResult2 = await page.evaluate(() => window.lastEvent.repeat)
  t.false(testResult2)
  await page.keyboard.down('b')
  const testResult3 = await page.evaluate(() => window.lastEvent.repeat)
  t.true(testResult3)

  await page.keyboard.up('a')
  await page.keyboard.down('a')
  const testResult4 = await page.evaluate(() => window.lastEvent.repeat)
  t.false(testResult4)
})

test.serial('Keyboard should type all kinds of characters', async t => {
  const { page, server } = t.context
  await page.goto(server.PREFIX + '/input/textarea.html')
  await page.focus('textarea')
  const text = 'This text goes onto two lines.\nThis character is 嗨.'
  await page.keyboard.type(text)
  const testResult = await page.evaluate('result')
  t.is(testResult, text)
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
  const testResult = await page.evaluate('keyLocation')
  t.is(testResult, 0)

  await textarea.press('ControlLeft')
  const testResult1 = await page.evaluate('keyLocation')
  t.is(testResult1, 1)

  await textarea.press('ControlRight')
  const testResult2 = await page.evaluate('keyLocation')
  t.is(testResult2, 2)

  await textarea.press('NumpadSubtract')
  const testResult3 = await page.evaluate('keyLocation')
  t.is(testResult3, 3)
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
  const emojis = '☣⌨️️'
  await page.type('textarea', emojis)
  t.is(
    await page.$eval('textarea', textarea => textarea.value),
    emojis
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
  const emojis = '☣⌨️️'
  await textarea.type(emojis)
  t.is(
    await frame.$eval('textarea', textarea => textarea.value),
    emojis
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
