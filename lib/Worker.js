const util = require('util')
const EventEmitter = require('eventemitter3')
const { debugError } = require('./helper')
const { ExecutionContext } = require('./ExecutionContext')
const { JSHandle } = require('./JSHandle')

class Worker extends EventEmitter {
  /**
   * @param {Chrome|CRIConnection|CDPSession|Object} client
   * @param {string} url
   * @param {function(string, !Array<!JSHandle>, Object=):void} consoleAPICalled
   * @param {function(!Object):void} exceptionThrown
   */
  constructor (client, url, consoleAPICalled, exceptionThrown) {
    super()
    this._client = client
    this._url = url
    this._executionContextPromise = new Promise(
      resolve => (this._executionContextCallback = resolve)
    )
    /** @type {function(!Object):!JSHandle} */
    let jsHandleFactory
    this._client.once('Runtime.executionContextCreated', async event => {
      jsHandleFactory = remoteObject =>
        new JSHandle(executionContext, client, remoteObject)
      const executionContext = new ExecutionContext(client, event.context, null)
      this._executionContextCallback(executionContext)
    })
    // This might fail if the target is closed before we recieve all execution contexts.
    this._client.send('Runtime.enable', {}).catch(debugError)

    this._client.on('Runtime.consoleAPICalled', event =>
      consoleAPICalled(
        event.type,
        event.args.map(jsHandleFactory),
        event.stackTrace
      )
    )
    this._client.on('Runtime.exceptionThrown', exception =>
      exceptionThrown(exception.exceptionDetails)
    )
  }

  /**
   * @return {string}
   */
  url () {
    return this._url
  }

  /**
   * @return {!Promise<ExecutionContext>}
   */
  async executionContext () {
    return this._executionContextPromise
  }

  /**
   * @param {Function|string} pageFunction
   * @param {!Array<*>} args
   * @return {!Promise<*>}
   */
  async evaluate (pageFunction, ...args) {
    return (await this._executionContextPromise).evaluate(pageFunction, ...args)
  }

  /**
   * @param {Function|string} pageFunction
   * @param {!Array<*>} args
   * @return {!Promise<!JSHandle>}
   */
  async evaluateHandle (pageFunction, ...args) {
    return (await this._executionContextPromise).evaluateHandle(
      pageFunction,
      ...args
    )
  }

  toJSON () {
    return { url: this._url }
  }

  [util.inspect.custom](depth, options) {
    if (depth < 0) {
      return options.stylize('[Worker]', 'special')
    }

    const newOptions = Object.assign({}, options, {
      depth: options.depth === null ? null : options.depth - 1
    })
    const inner = util.inspect({ url: this._url }, newOptions)
    return `${options.stylize('Worker', 'special')} ${inner}`
  }
}

module.exports = { Worker }
