const util = require('util')

/**
 * Utility class around querying browser databases
 * @see https://chromedevtools.github.io/devtools-protocol/tot/Database
 * @since chrome-remote-interface-extra
 */
class Database {
  /**
   * @param {DatabaseManager} manager
   * @param {CDPDatabase} database
   */
  constructor (manager, database) {
    /**
     * @type {DatabaseManager}
     * @private
     */
    this._manager = manager

    /**
     * @type {CDPDatabase}
     * @private
     */
    this._database = database
  }

  /**
   * @return {string}
   */
  id () {
    return this._database.id
  }

  /**
   * @return {string}
   */
  name () {
    return this._database.name
  }

  /**
   * @return {string}
   */
  version () {
    return this._database.version
  }

  /**
   * @return {Promise<Array<string>>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Database#method-disable
   */
  async getDatabaseTableNames () {
    return this._manager.getDatabaseTableNames(this.id())
  }

  /**
   * @param {string} query - The SQL query
   * @return {Promise<SQLQueryResults>}
   * @see https://chromedevtools.github.io/devtools-protocol/tot/Database#method-executeSQL
   */
  executeSQL (query) {
    return this._manager.executeSQL(this.id(), query)
  }

  /**
   * @return {string}
   */
  toString () {
    return util.inspect(this, { depth: null })
  }

  /**
   * @return {CDPDatabase}
   */
  toJSON () {
    return this._database
  }

  /** @ignore */
  // eslint-disable-next-line space-before-function-paren
  [util.inspect.custom](depth, options) {
    if (depth < 0) {
      return options.stylize('[Database]', 'special')
    }
    const newOptions = Object.assign({}, options, {
      depth: options.depth == null ? null : options.depth - 1
    })
    const inner = util.inspect(this._database, newOptions)
    return `${options.stylize('Database', 'special')} ${inner}`
  }
}

/**
 * @type {Database}
 */
module.exports = Database
