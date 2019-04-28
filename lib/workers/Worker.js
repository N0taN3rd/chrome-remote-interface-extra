const util = require('util')
const EventEmitter = require('eventemitter3')
const { debugError } = require('../helper')
const { ExecutionContext } = require('../executionContext')
const { JSHandle } = require('../JSHandle')

class Worker extends EventEmitter {
  /**
   * @param {Chrome|CRIConnection|CDPSession|Object} client
   * @param {string} url
   * @param {*} consoleAPICalled
   * @param {function(arg: Object): void} exceptionThrown
   */
  constructor (client, url, consoleAPICalled, exceptionThrown) {
    super()
    /**
     * @type {Chrome|CRIConnection|CDPSession|Object}
     * @private
     */
    this._client = client
    /**
     * @type {string}
     * @private
     */
    this._url = url
    /**
     * @type {Promise<ExecutionContext>}
     * @private
     */
    this._executionContextPromise = new Promise(
      resolve => (this._executionContextCallback = resolve)
    )
    /** @type {function(arg: Object):JSHandle} */
    let jsHandleFactory
    this._client.once('Runtime.executionContextCreated', async event => {
      jsHandleFactory = remoteObject =>
        new JSHandle(executionContext, client, remoteObject)
      const executionContext = new ExecutionContext(client, event.context, null)
      this._executionContextCallback(executionContext)
    })
    // This might fail if the target is closed before we receive all execution contexts.
    this._client.send('Runtime.enable', {}).catch(debugError)

    this._client.on('Runtime.consoleAPICalled', event =>
      consoleAPICalled(event, jsHandleFactory)
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
   * @return {Promise<ExecutionContext>}
   */
  executionContext () {
    return this._executionContextPromise
  }

  /**
   * @param {Function|string} pageFunction
   * @param {...*} args
   * @return {Promise<*>}
   */
  async evaluate (pageFunction, ...args) {
    const executionContext = await this._executionContextPromise
    return executionContext.evaluate(pageFunction, ...args)
  }

  /**
   * @param {Function|string} pageFunction
   * @param {...*} args
   * @return {Promise<JSHandle>}
   */
  async evaluateHandle (pageFunction, ...args) {
    const executionContext = await this._executionContextPromise
    return executionContext.evaluateHandle(pageFunction, ...args)
  }

  /**
   * @return {{url: string}}
   */
  toJSON () {
    return { url: this._url }
  }

  /** @ignore */
  // eslint-disable-next-line space-before-function-paren
  [util.inspect.custom](depth, options) {
    if (depth < 0) {
      return options.stylize('[Worker]', 'special')
    }

    const newOptions = Object.assign({}, options, {
      depth: options.depth == null ? null : options.depth - 1
    })
    const inner = util.inspect({ url: this._url }, newOptions)
    return `${options.stylize('Worker', 'special')} ${inner}`
  }
}

module.exports = Worker
