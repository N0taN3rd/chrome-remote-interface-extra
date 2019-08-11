const EventEmitter = require('eventemitter3')
const StorageEvents = require('./Events').StorageManager

/**
 * @see https://chromedevtools.github.io/devtools-protocol/tot/Storage
 * @see https://chromedevtools.github.io/devtools-protocol/tot/DOMStorage
 * @see https://chromedevtools.github.io/devtools-protocol/tot/CacheStorage
 */
class StorageManager extends EventEmitter {
  /**
   * @param {Chrome|CRIConnection|CDPSession|Object} client
   */
  constructor (client) {
    super()
    /**
     * @type {Chrome|CRIConnection|CDPSession|Object}
     * @private
     */
    this._client = client

    this._client.on('Storage.cacheStorageContentUpdated', event =>
      this.emit(StorageEvents.CacheStorageContentUpdated, event)
    )
    this._client.on('Storage.cacheStorageListUpdated', event =>
      this.emit(StorageEvents.CacheStorageListUpdated, event.origin)
    )
    this._client.on('Storage.indexedDBContentUpdated', event =>
      this.emit(StorageEvents.IndexedDBContentUpdated, event)
    )
    this._client.on('Storage.indexedDBListUpdated', event =>
      this.emit(StorageEvents.IndexedDBListUpdated, event.origin)
    )
    this._client.on('DOMStorage.domStorageItemAdded', event =>
      this.emit(StorageEvents.DomStorageItemAdded, event)
    )
    this._client.on('DOMStorage.domStorageItemRemoved', event =>
      this.emit(StorageEvents.DomStorageItemRemoved, event)
    )
    this._client.on('DOMStorage.domStorageItemUpdated', event =>
      this.emit(StorageEvents.DomStorageItemUpdated, event)
    )
    this._client.on('DOMStorage.domStorageItemsCleared', event =>
      this.emit(StorageEvents.DomStorageItemsCleared, event)
    )
  }

  /**
   * Enables storage tracking, storage events will now be delivered to the client
   * @return {Promise<void>}
   */
  async enableTrackingDOMStorage () {
    await this._client.send('DOMStorage.enable')
  }

  /**
   * Disables storage tracking, prevents storage events from being sent to the client
   * @return {Promise<void>}
   */
  async disableTrackingDOMStorage () {
    await this._client.send('DOMStorage.disable')
  }

  /**
   * @param {StorageId} storageId
   * @return {Promise<void>}
   */
  async clearDOMStorage (storageId) {
    await this._client.send('DOMStorage.clear', { storageId })
  }

  /**
   * @param {{storageId: StorageId, key: string}} removeOpts
   * @return {Promise<void>}
   */
  async removeDOMStorageItem (removeOpts) {
    await this._client.send('DOMStorage.removeDOMStorageItem', removeOpts)
  }

  /**
   * @param {{storageId: StorageId, key: string}} setOpts
   * @return {Promise<void>}
   */
  async setDOMStorageItem (setOpts) {
    await this._client.send('DOMStorage.setDOMStorageItem', setOpts)
  }

  /**
   * @param {StorageId} storageId
   * @return {Promise<Array<DOMStorageItem>>}
   */
  async getDOMStorageItems (storageId) {
    const { entries } = await this._client.send(
      'DOMStorage.getDOMStorageItems',
      { storageId }
    )
    return entries
  }

  /**
   * Returns usage and quota in bytes
   * @param {string} origin
   * @return {Promise<UsageAndQuota>}
   */
  getUsageAndQuota (origin) {
    return this._client.send('Storage.getUsageAndQuota', { origin })
  }

  /**
   * Clears storage for origin
   * @param {ClearStorageOpts} clearOpts
   * @return {Promise<void>}
   */
  async clearDataForOrigin (clearOpts) {
    await this._client.send('Storage.clearDataForOrigin', clearOpts)
  }

  /**
   * Registers origin to be notified when an update occurs to its cache storage list
   * @param {string} origin - Security origin
   * @return {Promise<void>}
   */
  async trackCacheStorageForOrigin (origin) {
    await this._client.send('Storage.trackCacheStorageForOrigin', {
      origin
    })
  }

  /**
   * Unregisters origin from receiving notifications for cache storage
   * @param {string} origin - Security origin
   * @return {Promise<void>}
   */
  async untrackCacheStorageForOrigin (origin) {
    await this._client.send('Storage.untrackCacheStorageForOrigin', {
      origin
    })
  }

  /**
   * Registers origin to be notified when an update occurs to its IndexedDB
   * @param {string} origin - Security origin
   * @return {Promise<void>}
   */
  async trackIndexedDBForOrigin (origin) {
    await this._client.send('Storage.trackIndexedDBForOrigin', {
      origin
    })
  }

  /**
   * Unregisters origin from receiving notifications for IndexedDB
   * @param {string} origin - Security origin
   * @return {Promise<void>}
   */
  async untrackIndexedDBForOrigin (origin) {
    await this._client.send('Storage.untrackIndexedDBForOrigin', {
      origin
    })
  }

  /**
   * Deletes a cache
   * @param {CacheId} cacheId - Id of cache for deletion
   * @return {Promise<void>}
   */
  async deleteCacheStorage (cacheId) {
    await this._client.send('CacheStorage.deleteCache', { cacheId })
  }

  /**
   * Deletes a cache entry
   * @param {CacheId} cacheId - Id of cache for deletion
   * @param {string} request - URL spec of the request
   * @return {Promise<void>}
   */
  async deleteCacheStorageEntry (cacheId, request) {
    await this._client.send('CacheStorage.deleteEntry', { cacheId, request })
  }

  /**
   * Requests cache names
   * @param {string} securityOrigin - Security origin
   * @return {Promise<Array<Cache>>} - Caches for the security origin
   */
  async requestCacheStorageNames (securityOrigin) {
    const { caches } = await this._client.send(
      'CacheStorage.requestCacheNames',
      { securityOrigin }
    )
    return caches
  }

  /**
   * Fetches cache entry
   * @param {RequestCachedResponseOpts} opts
   * @return {Promise<CachedResponse>} - Response read from the cache
   */
  async requestCacheStorageResponse (opts) {
    const { response } = await this._client.send(
      'CacheStorage.requestCachedResponse',
      opts
    )
    return response
  }

  /**
   * Fetches cache entry
   * @param {RequestCachedResponseOpts} opts
   * @return {Promise<CacheStorageEntry>} - Response read from the cache
   */
  requestCacheStorageEntries (opts) {
    return this._client.send('CacheStorage.requestCachedResponse', opts)
  }
}

module.exports = StorageManager

/**
 * @typedef {Object} ClearStorageOpts
 * @property {string} origin - Security origin
 * @property {string} storageTypes - Comma separated list of StorageType to clear
 */

/**
 * @typedef {Object} RequestCachedResponseOpts
 * @property {CacheId} cacheId - Id of cache that contains the entry
 * @property {string} requestURL - URL spec of the request
 * @property {Array<Header>} requestHeaders - headers of the request
 */

/**
 * @typedef {Object} RequestCachedEntriesOpts
 * @property {CacheId} cacheId - Id of cache that contains the entry
 * @property {number} skipCount - Number of records to skip
 * @property {number} pageSize - Number of records to fetch
 * @property {string} [pathFilter] - If present, only return the entries containing this substring in the path
 */
