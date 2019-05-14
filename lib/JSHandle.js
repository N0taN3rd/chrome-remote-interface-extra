/* eslint-env node, browser */
const Path = require('path')
const util = require('util')
const { helper, assert, debugError } = require('./helper')

/**
 *
 * @param {ExecutionContext} context
 * @param {Object} remoteObject
 * @return {JSHandle|ElementHandle}
 */
function createJSHandle (context, remoteObject) {
  const frame = context.frame()
  if (remoteObject.subtype === 'node' && frame) {
    const frameManager = frame.frameManager()
    return new ElementHandle(
      context,
      context._client,
      remoteObject,
      frameManager.page(),
      frameManager
    )
  }
  return new JSHandle(context, context._client, remoteObject)
}

exports.createJSHandle = createJSHandle

class JSHandle {
  /**
   * @param {!ExecutionContext} context
   * @param {Chrome|CRIConnection|CDPSession|Object} client
   * @param {!Object} remoteObject
   */
  constructor (context, client, remoteObject) {
    this._context = context
    this._client = client
    this._remoteObject = remoteObject
    this._disposed = false
  }

  isElementHandle () {
    return this instanceof ElementHandle
  }

  /**
   * @return {!ExecutionContext}
   */
  executionContext () {
    return this._context
  }

  /**
   * @return {?ElementHandle}
   */
  asElement () {
    return null
  }

  /**
   * Calls the function this JSHandle to for with the supplied args.
   * If the JSHandle is not to a function an error is thrown, in this
   * case {@link callFn} should be used
   * @param {...*} [args] - Optional arguments supplied to the function
   * @return {Promise<JSHandle>} - A Promise that resolves with a JSHandle
   * to the return value, if any, of the function call
   */
  call (...args) {
    assert(
      this._remoteObject.type === 'function',
      `This JSHandle is not a function it is a ${
        this._remoteObject.type
      } - you may want to use callFn`
    )
    return this._context.evaluateHandle(
      (jsHandle, ...fnArgs) => jsHandle(...fnArgs),
      this,
      ...args
    )
  }

  /**
   * Calls the function that is a property of the Object this JSHandle
   * is for with the supplied arguments.
   * @param {string} fnName - The name of the function to be called
   * @param {...*} [args] - Optional arguments supplied to the function
   * @return {Promise<JSHandle>} - A Promise that resolves with a JSHandle
   * to the return value, if any, of the function call
   */
  callFn (fnName, ...args) {
    return this._context.evaluateHandle(
      (jsHandle, fn, ...fnArgs) => jsHandle[fn](...fnArgs),
      this,
      fnName,
      ...args
    )
  }

  /**
   * @param {string} propertyName
   * @return {Promise<JSHandle>}
   */
  async getProperty (propertyName) {
    const objectHandle = await this._context.evaluateHandle(
      (object, propertyName) => {
        const result = { __proto__: null }
        result[propertyName] = object[propertyName]
        return result
      },
      this,
      propertyName
    )
    const properties = await objectHandle.getProperties()
    const result = properties.get(propertyName) || null
    await objectHandle.dispose()
    return result
  }

  /**
   * @return {Promise<Map<string, !JSHandle>>}
   */
  async getProperties () {
    const response = await this._client.send('Runtime.getProperties', {
      objectId: this._remoteObject.objectId,
      ownProperties: true
    })
    const properties = new Map()
    const result = response.result
    for (let i = 0; i < result.length; i++) {
      const property = result[i]
      if (!property.enumerable) continue
      properties.set(
        property.name,
        createJSHandle(this._context, property.value)
      )
    }
    return properties
  }

  /**
   * @return {Promise<Array<JSHandle>>}
   */
  async asArray () {
    const response = await this._client.send('Runtime.getProperties', {
      objectId: this._remoteObject.objectId,
      ownProperties: true
    })
    const result = response.result
    const array = []
    for (let i = 0; i < result.length; i++) {
      const property = result[i]
      if (!property.enumerable) continue
      array.push(createJSHandle(this._context, property.value))
    }
    return array
  }

  /**
   * @return {Promise<Array<ElementHandle>>}
   */
  async asElementArray () {
    const response = await this._client.send('Runtime.getProperties', {
      objectId: this._remoteObject.objectId,
      ownProperties: true
    })
    const result = response.result
    const array = []
    for (let i = 0; i < result.length; i++) {
      const property = result[i]
      if (!property.enumerable) continue
      array.push(createJSHandle(this._context, property.value).asElement())
    }
    return array
  }

  /**
   * @return {Promise<Object>}
   */
  async jsonValue () {
    if (this._remoteObject.objectId) {
      const response = await this._client.send('Runtime.callFunctionOn', {
        functionDeclaration: 'function() { return this; }',
        objectId: this._remoteObject.objectId,
        returnByValue: true,
        awaitPromise: true
      })
      return helper.valueFromRemoteObject(response.result)
    }
    return helper.valueFromRemoteObject(this._remoteObject)
  }

  /**
   * Calls the function this JSHandle to for with the supplied args.
   * If the JSHandle is not to a function an error is thrown, in this
   * case {@link callFnEval} should be used
   * @param {...*} [args] - Optional arguments supplied to the function
   * @return {Promise<Object>} - A Promise that resolves with the JSON
   * value of the results of the function invocation
   */
  async callEval (...args) {
    const handle = await this.call(...args)
    return callValue(handle)
  }

  /**
   * Calls the function that is a property of the Object this JSHandle
   * is for with the supplied arguments.
   * @param {string} fnName - The name of the function to be called
   * @param {...*} [args] - Optional arguments supplied to the function
   * @return {Promise<Object>} - A Promise that resolves with the JSON
   * value of the results of the function invocation
   */
  async callFnEval (fnName, ...args) {
    const handle = await this.callFn(fnName, ...args)
    return callValue(handle)
  }

  async dispose () {
    if (this._disposed) return
    this._disposed = true
    await helper.releaseObject(this._client, this._remoteObject)
  }

  /**
   * @override
   * @return {string}
   */
  toString () {
    if (this._remoteObject.objectId) {
      let type
      switch (this._remoteObject.type) {
        case 'object':
          if (this._remoteObject.subtype === 'proxy') {
            type = this._remoteObject.description
          } else {
            type = this._remoteObject.className
          }
          break
        case 'symbol':
          type = 'Symbol'
          break
        default:
          type = this._remoteObject.subtype || this._remoteObject.type
          break
      }
      return `${this.constructor.name}@${type}`
    }
    return `${this.constructor.name}:${helper.valueFromRemoteObject(
      this._remoteObject
    )}`
  }

  /** @ignore */
  // eslint-disable-next-line space-before-function-paren
  [util.inspect.custom](depth, options) {
    return this.toString()
  }
}

/**
 * @param returnHandle
 * @return {Promise<Object>}
 */
async function callValue (returnHandle) {
  const result = await returnHandle.jsonValue().catch(error => {
    if (error.message.includes('Object reference chain is too long')) return
    if (error.message.includes("Object couldn't be returned by value")) return
    throw error
  })
  await returnHandle.dispose()
  return result
}

exports.JSHandle = JSHandle

class ElementHandle extends JSHandle {
  /**
   * @param {!ExecutionContext} context
   * @param {Chrome|CRIConnection|CDPSession|Object} client
   * @param {!Object} remoteObject
   * @param {?Page} page
   * @param {?FrameManager} frameManager
   */
  constructor (context, client, remoteObject, page, frameManager) {
    super(context, client, remoteObject)
    /**
     * @type {Chrome|CRIConnection|CDPSession|Object}
     * @private
     */
    this._client = client
    /**
     * @type {!Object}
     * @private
     */
    this._remoteObject = remoteObject
    /**
     * @type {?Page}
     * @private
     */
    this._page = page
    /**
     * @type {?FrameManager}
     * @private
     */
    this._frameManager = frameManager
    /**
     * @type {boolean}
     * @private
     */
    this._disposed = false
  }

  /**
   * @override
   * @return {?ElementHandle}
   */
  asElement () {
    return this
  }

  /**
   * @returns {Promise<boolean>}
   */
  isIntersectingViewport () {
    return this.executionContext().evaluate(async element => {
      const visibleRatio = await new Promise(resolve => {
        const observer = new IntersectionObserver(entries => {
          resolve(entries[0].intersectionRatio)
          observer.disconnect()
        })
        observer.observe(element)
      })
      return visibleRatio > 0
    }, this)
  }

  /**
   * @param {string} selector
   * @return {Promise<ElementHandle|undefined>}
   */
  querySelector (selector) {
    return this.$(selector)
  }

  /**
   * @param {string} selector
   * @return {Promise<Array<ElementHandle>>}
   */
  querySelectorAll (selector) {
    return this.$$(selector)
  }

  /**
   * @param {string} selector
   * @param {Function|String} pageFunction
   * @param {...*} args
   * @return {Promise<Object|undefined>}
   */
  querySelectorEval (selector, pageFunction, ...args) {
    return this.$eval(selector, pageFunction, ...args)
  }

  /**
   * @param {string} selector
   * @param {Function|String} pageFunction
   * @param {...*} args
   * @return {Promise<Object|undefined>}
   */
  querySelectorAllEval (selector, pageFunction, ...args) {
    return this.$$eval(selector, pageFunction, ...args)
  }

  /**
   * @param {string} expression
   * @return {Promise<Array<ElementHandle>>}
   */
  xpathQuery (expression) {
    return this.$x(expression)
  }

  innerText (newValue) {
    return this.executionContext().evaluate(
      (element, newValue) => {
        if (newValue) element.innerText = newValue
        return element.innerText
      },
      this,
      newValue
    )
  }

  innerHTML (newValue) {
    return this.executionContext().evaluate(
      (element, newValue) => {
        if (newValue) element.innerHTML = newValue
        return element.innerHTML
      },
      this,
      newValue
    )
  }

  outerHTML (newValue) {
    return this.executionContext().evaluate(
      (element, newValue) => {
        if (newValue) element.outerHTML = newValue
        return element.outerHTML
      },
      this,
      newValue
    )
  }

  hasChildNodes () {
    return this.callFnEval('hasChildNodes')
  }

  childElementCount () {
    return this.executionContext().evaluate(
      elem => elem.childElementCount,
      this
    )
  }

  getAttribute (attribute) {
    return this.callFnEval('getAttribute', attribute)
  }

  setAttribute (attribute, value) {
    return this.callFnEval('setAttribute', attribute, value)
  }

  hasAttribute (attribute) {
    return this.callFnEval('hasAttribute', attribute)
  }

  removeAttribute (attribute) {
    return this.callFnEval('removeAttribute', attribute)
  }

  /**
   *
   * @return {Promise<Array<ElementHandle>>}
   */
  async childNodes () {
    const arrayHandle = await this.executionContext().evaluateHandle(
      elem => Array.from(elem.childNodes),
      this
    )
    const array = await arrayHandle.asElementArray()
    await arrayHandle.dispose()
    return array
  }

  /**
   *
   * @return {Promise<Array<ElementHandle>>}
   */
  async children () {
    const arrayHandle = await this.executionContext().evaluateHandle(
      elem => Array.from(elem.children),
      this
    )
    const array = await arrayHandle.asElementArray()
    await arrayHandle.dispose()
    return array
  }

  /**
   * @return {Promise<?Frame>}
   */
  async contentFrame () {
    const nodeInfo = await this._client.send('DOM.describeNode', {
      objectId: this._remoteObject.objectId
    })
    if (typeof nodeInfo.node.frameId !== 'string') return null
    return this._frameManager.frame(nodeInfo.node.frameId)
  }

  async hover () {
    await this.scrollIntoViewIfNeeded()
    const { x, y } = await this._clickablePoint()
    await this._page.mouse.move(x, y)
  }

  /**
   * @param {!{delay?: number, button?: "left"|"right"|"middle", clickCount?: number}=} options
   */
  async click (options) {
    await this.scrollIntoViewIfNeeded()
    const { x, y } = await this._clickablePoint()
    await this._page.mouse.click(x, y, options)
  }

  /**
   * @param {...string} filePaths
   */
  async uploadFile (...filePaths) {
    const files = filePaths.map(filePath => Path.resolve(filePath))
    const objectId = this._remoteObject.objectId
    await this._client.send('DOM.setFileInputFiles', { objectId, files })
  }

  async tap () {
    await this.scrollIntoViewIfNeeded()
    const { x, y } = await this._clickablePoint()
    await this._page.touchscreen.tap(x, y)
  }

  async focus () {
    await this.executionContext().evaluate(element => element.focus(), this)
  }

  /**
   * @param {string} text
   * @param {{delay: (number|undefined)}=} options
   */
  async type (text, options) {
    await this.focus()
    await this._page.keyboard.type(text, options)
  }

  /**
   * @param {string} key
   * @param {!{delay?: number, text?: string}=} options
   */
  async press (key, options) {
    await this.focus()
    await this._page.keyboard.press(key, options)
  }

  /**
   * @return {Promise<?{x: number, y: number, width: number, height: number}>}
   */
  async boundingBox () {
    const result = await this._getBoxModel()

    if (!result) return null

    const quad = result.model.border
    const x = Math.min(quad[0], quad[2], quad[4], quad[6])
    const y = Math.min(quad[1], quad[3], quad[5], quad[7])
    const width = Math.max(quad[0], quad[2], quad[4], quad[6]) - x
    const height = Math.max(quad[1], quad[3], quad[5], quad[7]) - y

    return { x, y, width, height }
  }

  /**
   * @return {Promise<?BoxModel>}
   */
  async boxModel () {
    const result = await this._getBoxModel()

    if (!result) return null

    const { content, padding, border, margin, width, height } = result.model
    return {
      content: fromProtocolQuad(content),
      padding: fromProtocolQuad(padding),
      border: fromProtocolQuad(border),
      margin: fromProtocolQuad(margin),
      width,
      height
    }
  }

  /**
   *
   * @param {!Object=} options
   * @returns {Promise<string|!Buffer>}
   */
  async screenshot (options = {}) {
    let needsViewportReset = false

    let boundingBox = await this.boundingBox()
    assert(boundingBox, 'Node is either not visible or not an HTMLElement')

    const viewport = this._page.viewport()

    if (
      viewport &&
      (boundingBox.width > viewport.width ||
        boundingBox.height > viewport.height)
    ) {
      const newViewport = {
        width: Math.max(viewport.width, Math.ceil(boundingBox.width)),
        height: Math.max(viewport.height, Math.ceil(boundingBox.height))
      }
      await this._page.setViewport(Object.assign({}, viewport, newViewport))

      needsViewportReset = true
    }

    await this.scrollIntoViewIfNeeded()

    boundingBox = await this.boundingBox()
    assert(boundingBox, 'Node is either not visible or not an HTMLElement')
    assert(boundingBox.width !== 0, 'Node has 0 width.')
    assert(boundingBox.height !== 0, 'Node has 0 height.')

    const {
      layoutViewport: { pageX, pageY }
    } = await this._client.send('Page.getLayoutMetrics')

    const clip = Object.assign({}, boundingBox)
    clip.x += pageX
    clip.y += pageY

    const imageData = await this._page.screenshot(
      Object.assign(
        {},
        {
          clip
        },
        options
      )
    )

    if (needsViewportReset) await this._page.setViewport(viewport)

    return imageData
  }

  /**
   * @param {string} elemId
   * @return {Promise<ElementHandle|undefined>}
   * @see https://developer.mozilla.org/en-US/docs/Web/API/Document/getElementById
   * @since chrome-remote-interface-extra
   */
  async getElementById (elemId) {
    const handle = await this.executionContext().evaluateHandle(
      id => document.getElementById(id),
      elemId
    )
    const element = handle.asElement()
    if (element) return element
    await handle.dispose()
    return null
  }

  /**
   * @param {string} selector
   * @return {Promise<ElementHandle|undefined>}
   */
  async $ (selector) {
    const handle = await this.executionContext().evaluateHandle(
      (element, selector) => element.querySelector(selector),
      this,
      selector
    )
    const element = handle.asElement()
    if (element) return element
    await handle.dispose()
    return null
  }

  /**
   * @param {string} selector
   * @return {Promise<Array<ElementHandle>>}
   */
  async $$ (selector) {
    const arrayHandle = await this.executionContext().evaluateHandle(
      (element, selector) => element.querySelectorAll(selector),
      this,
      selector
    )
    return arrayHandle.asElementArray()
  }

  /**
   * @param {string} selector
   * @param {Function|String} pageFunction
   * @param {...*} args
   * @return {Promise<Object|undefined>}
   */
  async $eval (selector, pageFunction, ...args) {
    const elementHandle = await this.$(selector)
    if (!elementHandle) {
      throw new Error(
        `Error: failed to find element matching selector "${selector}"`
      )
    }
    const result = await this.executionContext().evaluate(
      pageFunction,
      elementHandle,
      ...args
    )
    await elementHandle.dispose()
    return result
  }

  /**
   * @param {string} selector
   * @param {Function|String} pageFunction
   * @param {...*} args
   * @return {Promise<Object|undefined>}
   */
  async $$eval (selector, pageFunction, ...args) {
    const arrayHandle = await this.executionContext().evaluateHandle(
      (element, selector) => Array.from(element.querySelectorAll(selector)),
      this,
      selector
    )

    const result = await this.executionContext().evaluate(
      pageFunction,
      arrayHandle,
      ...args
    )
    await arrayHandle.dispose()
    return result
  }

  /**
   * @param {string} expression
   * @return {Promise<Array<ElementHandle>>}
   */
  async $x (expression) {
    const arrayHandle = await this.executionContext().evaluateHandle(
      (element, expression) => {
        const document = element.ownerDocument || element
        const iterator = document.evaluate(
          expression,
          element,
          null,
          XPathResult.ORDERED_NODE_ITERATOR_TYPE
        )
        const array = []
        let item
        while ((item = iterator.iterateNext())) array.push(item)
        return array
      },
      this,
      expression
    )
    const properties = await arrayHandle.getProperties()
    await arrayHandle.dispose()
    const result = []
    for (const property of properties.values()) {
      const elementHandle = property.asElement()
      if (elementHandle) result.push(elementHandle)
    }
    return result
  }

  /**
   * Scrolls the element into view.
   * @param {boolean|Object} [scrollHow = {block: 'center', inline: 'center', behavior: 'instant'}] - How to scroll the element into view
   * @return {Promise<void>}
   * @see https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollIntoView
   * @since chrome-remote-interface-extra
   */
  async scrollIntoView (scrollHow) {
    const scrollIntoViewOptions = scrollHow || {
      block: 'center',
      inline: 'center',
      behavior: 'instant'
    }
    switch (typeof scrollIntoViewOptions) {
      case 'boolean':
      case 'object':
        break
      default:
        throw new Error(
          `The scrollHow param can only be an object or boolean but you supplied ${typeof scrollHow}. `
        )
    }
    await this.executionContext().evaluate(
      async (element, scrollIntoViewOpts) => {
        if (!element.isConnected) return 'Node is detached from document'
        if (
          !element.scrollIntoView ||
          typeof element.scrollIntoView !== 'function'
        ) {
          return 'Node is not of type Element or does not have the scrollIntoView function'
        }
        element.scrollIntoView(scrollIntoViewOpts)
        return false
      },
      this,
      scrollIntoViewOptions
    )
  }

  /**
   * Conditionally scrolls the element into view.
   * @param {boolean|Object} [scrollHow = {block: 'center', inline: 'center', behavior: 'instant'}] - How to scroll the element into view
   * @return {Promise<void>}
   * @see https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollIntoView
   * @since chrome-remote-interface-extra
   * @public
   */
  async scrollIntoViewIfNeeded (scrollHow) {
    let scrollIntoViewOptions
    if (typeof scrollHow === 'boolean') {
      scrollIntoViewOptions = scrollHow
    } else {
      scrollIntoViewOptions = scrollHow || {
        block: 'center',
        inline: 'center',
        behavior: 'instant'
      }
    }
    const error = await this.executionContext().evaluate(
      async (element, pageJavascriptEnabled, scrollOpts) => {
        if (!element.isConnected) return 'Node is detached from document'
        if (
          !element.scrollIntoView ||
          typeof element.scrollIntoView !== 'function'
        ) {
          return 'Node is not of type Element or does not have the scrollIntoView function'
        }
        // force-scroll if page's javascript is disabled.
        if (!pageJavascriptEnabled) {
          element.scrollIntoView(scrollOpts)
          return false
        }
        const visibleRatio = await new Promise(resolve => {
          const observer = new IntersectionObserver(entries => {
            resolve(entries[0].intersectionRatio)
            observer.disconnect()
          })
          observer.observe(element)
        })
        if (visibleRatio !== 1.0) {
          element.scrollIntoView(scrollOpts)
        }
        return false
      },
      this,
      this._page.javascriptEnabled,
      scrollIntoViewOptions
    )
    if (error) throw new Error(error)
  }

  /**
   * @return {Promise<{x: number, y: number}>}
   */
  async _clickablePoint () {
    const [result, layoutMetrics] = await Promise.all([
      this._client
        .send('DOM.getContentQuads', {
          objectId: this._remoteObject.objectId
        })
        .catch(debugError),
      this._client.send('Page.getLayoutMetrics')
    ])

    if (!result || !result.quads.length) {
      throw new Error('Node is either not visible or not an HTMLElement')
    }
    // Filter out quads that have too small area to click into.
    const { clientWidth, clientHeight } = layoutMetrics.layoutViewport
    const quads = []
    const resultQuads = result.quads
    for (let i = 0; i < resultQuads.length; i++) {
      const _quads = intersectQuadWithViewport(
        fromProtocolQuad(resultQuads[i]),
        clientWidth,
        clientHeight
      )
      if (computeQuadArea(_quads) > 1) {
        quads.push(_quads)
      }
    }
    if (!quads.length) {
      throw new Error('Node is either not visible or not an HTMLElement')
    }
    // Return the middle point of the first quad.
    const quad = quads[0]
    let x = 0
    let y = 0
    for (let i = 0; i < quad.length; i++) {
      const point = quad[i]
      x += point.x
      y += point.y
    }
    return {
      x: x / 4,
      y: y / 4
    }
  }

  /**
   * @return {Promise<void|Object>}
   */
  _getBoxModel () {
    return this._client
      .send('DOM.getBoxModel', {
        objectId: this._remoteObject.objectId
      })
      .catch(error => debugError(error))
  }
}

exports.ElementHandle = ElementHandle

function computeQuadArea (quad) {
  // Compute sum of all directed areas of adjacent triangles
  // https://en.wikipedia.org/wiki/Polygon#Simple_polygons
  let area = 0
  for (let i = 0; i < quad.length; ++i) {
    const p1 = quad[i]
    const p2 = quad[(i + 1) % quad.length]
    area += (p1.x * p2.y - p2.x * p1.y) / 2
  }
  return Math.abs(area)
}

/**
 * @param {Array<number>} quad
 * @return {Array<{x: number, y: number}>}
 */
function fromProtocolQuad (quad) {
  return [
    { x: quad[0], y: quad[1] },
    { x: quad[2], y: quad[3] },
    { x: quad[4], y: quad[5] },
    { x: quad[6], y: quad[7] }
  ]
}

/**
 * @param {Array<{x: number, y: number}>} quad
 * @param {number} width
 * @param {number} height
 * @return {Array<{x: number, y: number}>}
 */
function intersectQuadWithViewport (quad, width, height) {
  const intersection = []
  for (let i = 0; i < quad.length; i++) {
    const point = quad[i]
    intersection.push({
      x: Math.min(Math.max(point.x, 0), width),
      y: Math.min(Math.max(point.y, 0), height)
    })
  }
  return intersection
}

/**
 * @typedef {Object} BoxModel
 * @property {Array<{x: number, y: number}>} content
 * @property {Array<{x: number, y: number}>} padding
 * @property {Array<{x: number, y: number}>} border
 * @property {Array<{x: number, y: number}>} margin
 * @property {number} width
 * @property {number} height
 */
