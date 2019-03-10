/* eslint-env node, browser */
const fs = require('fs-extra')
const { helper, assert } = require('./helper')
const LifecycleWatcher = require('./LifecycleWatcher')
const WaitTask = require('./WaitTask')

/**
 * @unrestricted
 */
class DOMWorld {
  /**
   * @param {!FrameManager} frameManager
   * @param {!Frame} frame
   * @param {!TimeoutSettings} timeoutSettings
   */
  constructor (frameManager, frame, timeoutSettings) {
    this._frameManager = frameManager
    this._frame = frame
    this._timeoutSettings = timeoutSettings

    /** @type {?Promise<ElementHandle>} */
    this._documentPromise = null
    /** @type {?Promise<ExecutionContext>} */
    this._contextPromise = null
    this._contextResolveCallback = null
    this._setContext(null)

    /** @type {!Set<WaitTask>} */
    this._waitTasks = new Set()
    this._detached = false
  }

  /**
   * @return {!Frame}
   */
  frame () {
    return this._frame
  }

  /**
   * @param {?ExecutionContext} context
   */
  _setContext (context) {
    if (context) {
      this._contextResolveCallback.call(null, context)
      this._contextResolveCallback = null
      for (const waitTask of this._waitTasks) waitTask.rerun()
    } else {
      this._documentPromise = null
      this._contextPromise = new Promise(resolve => {
        this._contextResolveCallback = resolve
      })
    }
  }

  _detach () {
    this._detached = true
    for (const waitTask of this._waitTasks) {
      waitTask.terminate(
        new Error('waitForFunction failed: frame got detached.')
      )
    }
  }

  /**
   * @return {?Promise<ExecutionContext>}
   */
  executionContext () {
    if (this._detached) {
      throw new Error(
        `Execution Context is not available in detached frame "${this._frame.url()}" (are you trying to evaluate?)`
      )
    }
    return this._contextPromise
  }

  /**
   * @param {string} selector
   * @return {Promise<ElementHandle>}
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
   * @return {Promise<Object>}
   */
  querySelectorEval (selector, pageFunction, ...args) {
    return this.$eval(selector, pageFunction, ...args)
  }

  /**
   * @param {string} selector
   * @param {Function|String} pageFunction
   * @param {...*} args
   * @return {Promise<Object>}
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

  /**
   * @param {Function|string} pageFunction
   * @param {...*} args
   * @return {Promise<JSHandle>}
   */
  async evaluateHandle (pageFunction, ...args) {
    const context = await this.executionContext()
    return context.evaluateHandle(pageFunction, ...args)
  }

  /**
   * @param {Function|string} pageFunction
   * @param {...*} args
   * @return {Promise<*>}
   */
  async evaluate (pageFunction, ...args) {
    const context = await this.executionContext()
    return context.evaluate(pageFunction, ...args)
  }

  /**
   * @param {string} selector
   * @return {Promise<ElementHandle>}
   */
  async $ (selector) {
    const document = await this._document()
    return document.$(selector)
  }

  /**
   * @return {Promise<ElementHandle>}
   */
  async _document () {
    if (this._documentPromise) return this._documentPromise
    this._documentPromise = this.executionContext().then(async context => {
      const document = await context.evaluateHandle('document')
      return document.asElement()
    })
    return this._documentPromise
  }

  /**
   * @param {string} expression
   * @return {Promise<Array<ElementHandle>>}
   */
  async $x (expression) {
    const document = await this._document()
    return document.$x(expression)
  }

  /**
   * @param {string} selector
   * @param {Function|string} pageFunction
   * @param {...*} args
   * @return {Promise<Object>}
   */
  async $eval (selector, pageFunction, ...args) {
    const document = await this._document()
    return document.$eval(selector, pageFunction, ...args)
  }

  /**
   * @param {string} selector
   * @param {Function|string} pageFunction
   * @param {...*} args
   * @return {Promise<Object>}
   */
  async $$eval (selector, pageFunction, ...args) {
    const document = await this._document()
    return document.$$eval(selector, pageFunction, ...args)
  }

  /**
   * @param {string} selector
   * @return {Promise<Array<ElementHandle>>}
   */
  async $$ (selector) {
    const document = await this._document()
    return document.$$(selector)
  }

  /**
   * @return {Promise<String>}
   */
  content () {
    return this.evaluate(() => {
      let retVal = ''
      if (document.doctype) {
        retVal = new XMLSerializer().serializeToString(document.doctype)
      }
      if (document.documentElement) {
        return retVal + document.documentElement.outerHTML
      }
      return retVal
    })
  }

  /**
   * @param {string} html
   * @param {!{timeout?: number, waitUntil?: string|Array<string>}=} options
   */
  async setContent (html, options = {}) {
    const {
      waitUntil = ['load'],
      timeout = this._timeoutSettings.navigationTimeout()
    } = options
    // We rely upon the fact that document.open() will reset frame lifecycle with "init"
    // lifecycle event. @see https://crrev.com/608658
    await this.evaluate(html => {
      document.open()
      document.write(html)
      document.close()
    }, html)
    const watcher = new LifecycleWatcher(
      this._frameManager,
      this._frame,
      waitUntil,
      timeout
    )
    const error = await Promise.race([
      watcher.timeoutOrTerminationPromise(),
      watcher.lifecyclePromise()
    ])
    watcher.dispose()
    if (error) throw error
  }

  /**
   * @param {!{url: ?string, path: ?string, content: ?string, type: ?string}} options
   * @return {Promise<ElementHandle>}
   */
  async addScriptTag (options) {
    const { url = null, path = null, content = null, type = '' } = options
    if (url != null) {
      try {
        const context = await this.executionContext()
        return (await context.evaluateHandle(
          addScriptUrl,
          url,
          type
        )).asElement()
      } catch (error) {
        throw new Error(`Loading script from ${url} failed`)
      }
    }

    if (path != null) {
      let contents = await fs.readFile(path, 'utf8')
      contents += '//# sourceURL=' + path.replace(/\n/g, '')
      const context = await this.executionContext()
      return (await context.evaluateHandle(
        addScriptContent,
        contents,
        type
      )).asElement()
    }

    if (content != null) {
      const context = await this.executionContext()
      return (await context.evaluateHandle(
        addScriptContent,
        content,
        type
      )).asElement()
    }

    throw new Error(
      'Provide an object with a `url`, `path` or `content` property'
    )

    /**
     * @param {string} url
     * @param {string} type
     * @return {Promise<HTMLElement>}
     */
    async function addScriptUrl (url, type) {
      const script = document.createElement('script')
      script.src = url
      if (type) script.type = type
      const promise = new Promise((resolve, reject) => {
        script.onload = resolve
        script.onerror = reject
      })
      document.head.appendChild(script)
      await promise
      return script
    }

    /**
     * @param {string} content
     * @param {string} type
     * @return {!HTMLElement}
     */
    function addScriptContent (content, type = 'text/javascript') {
      const script = document.createElement('script')
      script.type = type
      script.text = content
      let error = null
      script.onerror = e => (error = e)
      document.head.appendChild(script)
      if (error) throw error
      return script
    }
  }

  /**
   * @param {!{url: ?string, path: ?string, content: ?string}} options
   * @return {Promise<ElementHandle>}
   */
  async addStyleTag (options) {
    const { url = null, path = null, content = null } = options
    if (url !== null) {
      try {
        const context = await this.executionContext()
        return (await context.evaluateHandle(addStyleUrl, url)).asElement()
      } catch (error) {
        throw new Error(`Loading style from ${url} failed`)
      }
    }

    if (path !== null) {
      let contents = await fs.readFile(path, 'utf8')
      contents += '/*# sourceURL=' + path.replace(/\n/g, '') + '*/'
      const context = await this.executionContext()
      return (await context.evaluateHandle(
        addStyleContent,
        contents
      )).asElement()
    }

    if (content !== null) {
      const context = await this.executionContext()
      return (await context.evaluateHandle(
        addStyleContent,
        content
      )).asElement()
    }

    throw new Error(
      'Provide an object with a `url`, `path` or `content` property'
    )

    /**
     * @param {string} url
     * @return {Promise<HTMLElement>}
     */
    async function addStyleUrl (url) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = url
      const promise = new Promise((resolve, reject) => {
        link.onload = resolve
        link.onerror = reject
      })
      document.head.appendChild(link)
      await promise
      return link
    }

    /**
     * @param {string} content
     * @return {Promise<HTMLElement>}
     */
    async function addStyleContent (content) {
      const style = document.createElement('style')
      style.type = 'text/css'
      style.appendChild(document.createTextNode(content))
      const promise = new Promise((resolve, reject) => {
        style.onload = resolve
        style.onerror = reject
      })
      document.head.appendChild(style)
      await promise
      return style
    }
  }

  /**
   * @param {string} selector
   * @param {!{delay?: number, button?: "left"|"right"|"middle", clickCount?: number}=} options
   */
  async click (selector, options) {
    const handle = await this.$(selector)
    assert(handle, 'No node found for selector: ' + selector)
    await handle.click(options)
    await handle.dispose()
  }

  /**
   * @param {string} selector
   */
  async focus (selector) {
    const handle = await this.$(selector)
    assert(handle, 'No node found for selector: ' + selector)
    await handle.focus()
    await handle.dispose()
  }

  /**
   * @param {string} selector
   */
  async hover (selector) {
    const handle = await this.$(selector)
    assert(handle, 'No node found for selector: ' + selector)
    await handle.hover()
    await handle.dispose()
  }

  /**
   * @param {string} selector
   * @param {...string} values
   * @return {Promise<Array<string>>}
   */
  select (selector, ...values) {
    for (const value of values) {
      assert(
        helper.isString(value),
        'Values must be strings. Found value "' +
          value +
          '" of type "' +
          typeof value +
          '"'
      )
    }
    return this.$eval(
      selector,
      (element, values) => {
        if (element.nodeName.toLowerCase() !== 'select') {
          throw new Error('Element is not a <select> element.')
        }
        const options = Array.from(element.options)
        element.value = undefined
        for (let i = 0; i < options.length; i++) {
          const option = options[i]
          option.selected = values.includes(option.value)
          if (option.selected && !element.multiple) break
        }
        element.dispatchEvent(new Event('input', { bubbles: true }))
        element.dispatchEvent(new Event('change', { bubbles: true }))
        return options
          .filter(option => option.selected)
          .map(option => option.value)
      },
      values
    )
  }

  /**
   * @param {string} selector
   */
  async tap (selector) {
    const handle = await this.$(selector)
    assert(handle, 'No node found for selector: ' + selector)
    await handle.tap()
    await handle.dispose()
  }

  /**
   * @param {string} selector
   * @param {string} text
   * @param {{delay: (number|undefined)}=} options
   */
  async type (selector, text, options) {
    const handle = await this.$(selector)
    assert(handle, 'No node found for selector: ' + selector)
    await handle.type(text, options)
    await handle.dispose()
  }

  /**
   * @param {string} selector
   * @param {!{visible?: boolean, hidden?: boolean, timeout?: number}=} options
   * @return {Promise<ElementHandle>}
   */
  waitForSelector (selector, options) {
    return this._waitForSelectorOrXPath(selector, false, options)
  }

  /**
   * @param {string} xpath
   * @param {!{visible?: boolean, hidden?: boolean, timeout?: number}=} options
   * @return {Promise<ElementHandle>}
   */
  waitForXPath (xpath, options) {
    return this._waitForSelectorOrXPath(xpath, true, options)
  }

  /**
   * @param {Function|string} pageFunction
   * @param {!{polling?: string|number, timeout?: number}=} options
   * @param {...*} args
   * @return {Promise<JSHandle>}
   */
  waitForFunction (pageFunction, options = {}, ...args) {
    const {
      polling = 'raf',
      timeout = this._timeoutSettings.timeout()
    } = options
    return new WaitTask(
      this,
      pageFunction,
      'function',
      polling,
      timeout,
      ...args
    ).promise
  }

  /**
   * @return {Promise<string>}
   */
  async title () {
    return this.evaluate(() => document.title)
  }

  /**
   * @param {string} selectorOrXPath
   * @param {boolean} isXPath
   * @param {!{visible?: boolean, hidden?: boolean, timeout?: number}=} options
   * @return {Promise<ElementHandle>}
   */
  async _waitForSelectorOrXPath (selectorOrXPath, isXPath, options = {}) {
    const {
      visible: waitForVisible = false,
      hidden: waitForHidden = false,
      timeout = this._timeoutSettings.timeout()
    } = options
    const polling = waitForVisible || waitForHidden ? 'raf' : 'mutation'
    const title = `${isXPath ? 'XPath' : 'selector'} "${selectorOrXPath}"${
      waitForHidden ? ' to be hidden' : ''
    }`
    const waitTask = new WaitTask(
      this,
      predicate,
      title,
      polling,
      timeout,
      selectorOrXPath,
      isXPath,
      waitForVisible,
      waitForHidden
    )
    const handle = await waitTask.promise
    if (!handle.asElement()) {
      await handle.dispose()
      return null
    }
    return handle.asElement()

    /**
     * @param {string} selectorOrXPath
     * @param {boolean} isXPath
     * @param {boolean} waitForVisible
     * @param {boolean} waitForHidden
     * @return {?Node|boolean}
     */
    function predicate (
      selectorOrXPath,
      isXPath,
      waitForVisible,
      waitForHidden
    ) {
      let node
      if (isXPath) {
        node = document.evaluate(
          selectorOrXPath,
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        ).singleNodeValue
      } else {
        node = document.querySelector(selectorOrXPath)
      }
      if (!node) return waitForHidden
      if (!waitForVisible && !waitForHidden) return node
      const element =
        /** @type {Element} */ (node.nodeType === Node.TEXT_NODE
          ? node.parentElement
          : node)

      const style = window.getComputedStyle(element)
      const isVisible =
        style && style.visibility !== 'hidden' && hasVisibleBoundingBox()
      const success =
        waitForVisible === isVisible || waitForHidden === !isVisible
      return success ? node : null

      /**
       * @return {boolean}
       */
      function hasVisibleBoundingBox () {
        const rect = element.getBoundingClientRect()
        return !!(rect.top || rect.bottom || rect.width || rect.height)
      }
    }
  }
}

/**
 * @type {DOMWorld}
 */
module.exports = DOMWorld
