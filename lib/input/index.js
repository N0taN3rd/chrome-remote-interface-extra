const Keyboard = require('./keyboard')
const Mouse = require('./mouse')
const Touchscreen = require('./touchscreen')
const USKeyboardLayout = require('./usKeyboardLayout')

/**
 * @type {{Touchscreen: Touchscreen, Mouse: Mouse, Keyboard: Keyboard, USKeyboardLayout: Object<string, KeyDefinition>}}
 */
module.exports = { Keyboard, Mouse, Touchscreen, USKeyboardLayout }
