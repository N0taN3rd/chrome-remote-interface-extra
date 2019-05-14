const path = require('path')

const PROJECT_ROOT = path.join(__dirname, '..', '..', 'lib')
const assetRootPath = path.join(__dirname, '..', 'fixtures', 'assets')
const rootDir = path.join(__dirname, '..', '..')

exports.projectRoot = () => PROJECT_ROOT
exports.requireRoot = name => require(path.join(PROJECT_ROOT, name))
exports.assetPath = (...args) => path.join(assetRootPath, ...args)
exports.relativeAssetPath = (...args) =>
  path.relative(rootDir, path.join(assetRootPath, ...args))

/**
 * @param {Request} request
 * @return {boolean}
 */
exports.isFavicon = function isFavicon (request) {
  return request.url().includes('favicon.ico')
}

/**
 * @param {Page} page
 * @param {string} frameId
 * @param {string} url
 * @return {Promise<?Frame>}
 */
exports.attachFrame = async function attachFrame (page, frameId, url) {
  const handle = await page.evaluateHandle(doAttach, frameId, url)
  return handle.asElement().contentFrame()
  async function doAttach (frameId, url) {
    const frame = document.createElement('iframe')
    frame.src = url
    frame.id = frameId
    document.body.appendChild(frame)
    await new Promise(resolve => (frame.onload = resolve))
    return frame
  }
}

/**
 * @param {Page} page
 * @param {string} frameId
 * @return {Promise<void>}
 */
exports.detachFrame = async function detachFrame (page, frameId) {
  await page.evaluate(doDetachFrame, frameId)
  function doDetachFrame (frameId) {
    const frame = document.getElementById(frameId)
    frame.remove()
  }
}

/**
 * @param {Page} page
 * @param {string} frameId
 * @param {string} url
 */
exports.navigateFrame = async function navigateFrame (page, frameId, url) {
  await page.evaluate(doNavigateFrame, frameId, url)
  function doNavigateFrame (frameId, url) {
    const frame = document.getElementById(frameId)
    frame.src = url
    return new Promise(resolve => (frame.onload = resolve))
  }
}

/**
 *
 * @param {Frame} frame
 * @param {string} [indentation = '']
 * @return {Array<string>}
 */
function dumpFrames (frame, indentation = '') {
  let description = frame.url().replace(/:\d{4}\//, ':<PORT>/')
  if (frame.name()) description += ' (' + frame.name() + ')'
  const result = [indentation + description]
  const childFrames = frame.childFrames()
  for (let i = 0; i < childFrames.length; i++) {
    result.push(...dumpFrames(childFrames[i], '    ' + indentation))
  }
  return result
}

exports.dumpFrames = dumpFrames

/**
 * @param {EventEmitter} emitter
 * @param {string} eventName
 * @param {function (event: Object): boolean} predicate
 * @return {Promise<Object>}
 */
exports.waitEvent = function waitEvent (
  emitter,
  eventName,
  predicate = () => true
) {
  return new Promise(resolve => {
    emitter.on(eventName, function listener (event) {
      if (!predicate(event)) return
      emitter.removeListener(eventName, listener)
      resolve(event)
    })
  })
}

exports.delay = howMuch => new Promise(resolve => setTimeout(resolve, howMuch))

exports.promiseResolveReject = function promiseResolveReject () {
  const prr = { promise: null, resolve: null, reject: null }
  prr.promise = new Promise((resolve, reject) => {
    prr.resolve = resolve
    prr.reject = reject
  })
  return prr
}
