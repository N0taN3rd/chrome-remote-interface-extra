const util = require('util')
const EventEmitter = require('eventemitter3')
const { assert, helper } = require('../helper')
const Events = require('../Events')
const Database = require('./Database')

/**
 * @see https://chromedevtools.github.io/devtools-protocol/tot/Database
 * @since chrome-remote-interface-extra
 */
class DatabaseManager extends EventEmitter {
  /**
   * @param {Chrome|CRIConnection|CDPSession|Object} client
   */
  constructor (client) {
    super()
    /** @type {Chrome|CRIConnection|CDPSession|Object} */
    this._client = client

    /**
     * @type {boolean}
     * @private
     */
    this._enabled = false

    /**
     * @type {Array<Object>}
     * @private
     */
    this._clientListeners = null

    this._onDatabaseAdded = this._onDatabaseAdded.bind(this)
  }

  /**
   * @return {boolean}
   */
  enabled () {
    return this._enabled
  }

  /**
   * Enables database tracking, database events will now be delivered to the client.
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Database#method-enable
   */
  async enable () {
    if (this._enabled) return
    await this._client.send('Database.enable')
    this._clientListeners = [
      helper.addEventListener(
        this._client,
        'Database.addDatabase',
        this._onDatabaseAdded
      )
    ]
    this._enabled = true
  }

  /**
   * Disables database tracking, prevents database events from being sent to the client.
   * @return {Promise<void>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Database#method-disable
   */
  async disable () {
    if (!this._enabled) return
    await this._client.send('Database.disable')
    this._enabled = false
    if (this._clientListeners) {
      helper.removeEventListeners(this._clientListeners)
    }
    this._clientListeners = null
  }

  /**
   * @param {string} databaseId - Unique identifier of the Database
   * @return {Promise<Array<string>>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Database#getDatabaseTableNames
   */
  async getDatabaseTableNames (databaseId) {
    assert(
      helper.isString(databaseId),
      `The databaseId param must be of type "string", received ${typeof databaseId}`
    )
    const { tableNames } = await this._client.send(
      'Database.getDatabaseTableNames',
      { databaseId }
    )
    return tableNames
  }

  /**
   * @param {string} databaseId - Unique identifier of the Database
   * @param {string} query - The SQL query
   * @return {Promise<SQLQueryResults>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Database#method-executeSQL
   */
  executeSQL (databaseId, query) {
    assert(
      helper.isString(databaseId),
      `The databaseId param must be of type "string", received ${typeof databaseId}`
    )
    assert(
      helper.isString(query),
      `The query param must be of type "string", received ${typeof query}`
    )
    return this._client.send('Database.executeSQL', { databaseId, query })
  }

  /**
   * @param {CDPDatabase} database
   * @emits {Database.databaseAdded}
   * @private
   */
  _onDatabaseAdded (database) {
    this.emit(Events.DataBase.added, new Database(this, database))
  }

  /** @ignore */
  // eslint-disable-next-line space-before-function-paren
  [util.inspect.custom](depth, options) {
    return options.stylize(
      `DatabaseManager<enabled=${this._enabled}>`,
      'special'
    )
  }
}


/**
 * @type {DatabaseManager}
 */
module.exports = DatabaseManager
