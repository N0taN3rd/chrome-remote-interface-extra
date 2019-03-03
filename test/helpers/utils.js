import * as path from 'path'

const PROJECT_ROOT = path.join(__dirname, '..', '..', 'lib')

export const projectRoot = () => PROJECT_ROOT
export const requireRoot = name => require(path.join(PROJECT_ROOT, name))

/**
 * @param {Request} request
 * @return {boolean}
 */
export function isFavicon (request) {
  return request.url().includes('favicon.ico')
}

/**
 * @param {Page} page
 * @param {string} frameId
 * @param {string} url
 * @return {?Frame}
 */
export async function attachFrame (page, frameId, url) {
  const handle = await page.evaluateHandle(
    async (fid, furl) => {
      const frame = document.createElement('iframe')
      frame.src = furl
      frame.id = fid
      document.body.appendChild(frame)
      await new Promise(resolve => {
        frame.onload = resolve
      })
      return frame
    },
    frameId,
    url
  )
  const frameElem = handle.asElement()
  return frameElem.contentFrame()
}

/**
 * @param {Page} page
 * @param {string} frameId
 * @return {Promise<void>}
 */
export async function detachFrame (page, frameId) {
  await page.evaluate(fid => {
    const frame = document.getElementById(fid)
    frame.remove()
  }, frameId)
}

/**
 * @param {Page} page
 * @param {string} frameId
 * @param {string} url
 */
export async function navigateFrame (page, frameId, url) {
  await page.evaluate(
    (fid, furl) => {
      const frame = document.getElementById(fid)
      frame.src = furl
      return new Promise(resolve => {
        frame.onload = resolve
      })
    },
    frameId,
    url
  )
}

/**
 *
 * @param {Frame} frame
 * @param {string} [indentation = '']
 * @return {Array<string>}
 */
export function dumpFrames (frame, indentation = '') {
  let description = frame.url().replace(/:\d{4}\//, ':<PORT>/')
  if (frame.name()) description += ' (' + frame.name() + ')'
  const result = [indentation + description]
  const childFrames = frame.childFrames()
  for (let i = 0; i < childFrames.length; i++) {
    result.push(...dumpFrames(childFrames[i], '    ' + indentation))
  }
  return result
}

/**
 * @param {EventEmitter} emitter
 * @param {string} eventName
 * @param {function (event: Object): boolean} predicate
 * @return {Promise<Object>}
 */
export function waitEvent (emitter, eventName, predicate = () => true) {
  return new Promise(resolve => {
    emitter.on(eventName, function listener (event) {
      if (!predicate(event)) return
      emitter.removeListener(eventName, listener)
      resolve(event)
    })
  })
}
