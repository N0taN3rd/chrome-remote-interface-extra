const util = require('util')

/**
 * @template K
 * @template V
 */
class Multimap {
  constructor () {
    /**
     * @type {Map<K, V>}
     * @private
     */
    this._map = new Map()
  }

  /**
   * @param {K} key
   * @param {V} value
   */
  set (key, value) {
    let set = this._map.get(key)
    if (!set) {
      set = new Set()
      this._map.set(key, set)
    }
    set.add(value)
  }

  /**
   * @param {K} key
   * @return {!Set<V>}
   */
  get (key) {
    let result = this._map.get(key)
    if (!result) result = new Set()
    return result
  }

  /**
   * @param {K} key
   * @return {boolean}
   */
  has (key) {
    return this._map.has(key)
  }

  /**
   * @param {K} key
   * @param {V} value
   * @return {boolean}
   */
  hasValue (key, value) {
    const set = this._map.get(key)
    if (!set) return false
    return set.has(value)
  }

  /**
   * @return {number}
   */
  get size () {
    return this._map.size
  }

  /**
   * @param {K} key
   * @param {V} value
   * @return {boolean}
   */
  delete (key, value) {
    const values = this.get(key)
    const result = values.delete(value)
    if (!values.size) this._map.delete(key)
    return result
  }

  /**
   * @param {K} key
   */
  deleteAll (key) {
    this._map.delete(key)
  }

  /**
   * @param {K} key
   * @return {V}
   */
  firstValue (key) {
    const set = this._map.get(key)
    if (!set) return null
    return set.values().next().value
  }

  /**
   * @return {K}
   */
  firstKey () {
    return this._map.keys().next().value
  }

  /**
   * @return {!Array<V>}
   */
  values () {
    const result = []
    for (const key of this._map.keys()) {
      result.push(...Array.from(this._map.get(key).values()))
    }
    return result
  }

  /**
   * @return {!Array<K>}
   */
  keys () {
    return Array.from(this._map.keys())
  }

  clear () {
    this._map.clear()
  }

  // eslint-disable-next-line space-before-function-paren
  [util.inspect.custom](depth, options) {
    if (depth < 0) {
      return options.stylize('[Multimap]', 'special')
    }

    const newOptions = Object.assign({}, options, {
      depth: options.depth === null ? null : options.depth - 1
    })
    const inner = util.inspect(this._map, newOptions)
    return `${options.stylize('Multimap', 'special')} ${inner}`
  }
}

module.exports = { Multimap }
