module.exports = {
  Animations: {
    canceled: 'Animation.animationCanceled',
    created: 'Animation.animationCreated',
    started: 'Animation.animationStarted'
  },
  Page: {
    Close: 'close',
    Console: 'console',
    LogEntry: 'Page.LogEntry',
    Dialog: 'dialog',
    DOMContentLoaded: 'domcontentloaded',
    Error: 'error',
    // Can't use just 'error' due to node.js special treatment of error events.
    // @see https://nodejs.org/api/events.html#events_error_events
    PageError: 'pageerror',
    Request: 'request',
    Response: 'response',
    RequestFailed: 'requestfailed',
    RequestFinished: 'requestfinished',
    FrameAttached: 'frameattached',
    FrameDetached: 'framedetached',
    FrameNavigated: 'framenavigated',
    Load: 'load',
    Metrics: 'metrics',
    Popup: 'popup',
    WorkerCreated: 'workercreated',
    WorkerDestroyed: 'workerdestroyed',
    Crashed: 'Page.crashed',
    AnimationCanceled: 'Page.Animation.animationCanceled',
    AnimationCreated: 'Page.Animation.animationCreated',
    AnimationStarted: 'Page.Animation.animationStarted',
    DatabaseAdded: 'Page.Database.databaseAdded',
    ServiceWorkerAdded: 'Page.ServiceWorkerManager.serviceWorkerCreated',
    CertificateError: 'Page.Security.certificateErrorReported',
    SecurityStateChanged: 'Page.Security.securityStateChangedReported',
    FileChooser: 'Page.FileChooser'
  },

  Browser: {
    TargetCreated: 'targetcreated',
    TargetDestroyed: 'targetdestroyed',
    TargetChanged: 'targetchanged',
    Disconnected: 'disconnected'
  },

  BrowserContext: {
    TargetCreated: 'targetcreated',
    TargetDestroyed: 'targetdestroyed',
    TargetChanged: 'targetchanged'
  },

  DataBase: {
    added: 'Database.databaseAdded'
  },

  NetworkManager: {
    Request: 'Events.NetworkManager.Request',
    Response: 'Events.NetworkManager.Response',
    RequestFailed: 'Events.NetworkManager.RequestFailed',
    RequestFinished: 'Events.NetworkManager.RequestFinished'
  },

  FrameManager: {
    FrameAttached: 'Events.FrameManager.FrameAttached',
    FrameNavigated: 'Events.FrameManager.FrameNavigated',
    FrameDetached: 'Events.FrameManager.FrameDetached',
    LifecycleEvent: 'Events.FrameManager.LifecycleEvent',
    FrameNavigatedWithinDocument:
      'Events.FrameManager.FrameNavigatedWithinDocument',
    ExecutionContextCreated: 'Events.FrameManager.ExecutionContextCreated',
    ExecutionContextDestroyed: 'Events.FrameManager.ExecutionContextDestroyed'
  },

  CRIClient: {
    Disconnected: 'disconnected'
  },

  CRIConnection: {
    Disconnected: 'Events.CRIConnection.Disconnected',
    Verbose: 'Events.CRIConnection.Verbose'
  },

  CDPSession: {
    Disconnected: 'Events.CDPSession.Disconnected'
  },

  NetworkIdleMonitor: {
    NetworkIdle: 'network-idle'
  },

  WorkerManager: {
    ServiceWorkerAdded: 'WorkerManager.serviceWorkerAdded',
    ServiceWorkerDeleted: 'WorkerManager.serviceWorkerDeleted',
    Console: 'WorkerManager.console',
    Error: 'WorkerManager.error',
    WorkerCreated: 'WorkerManager.workerCreated',
    WorkerDestroyed: 'WorkerManager.workerDestroyed'
  },

  ServiceWorker: {
    Error: 'ServiceWorker.workerErrorReported',
    RegistrationUpdated: 'ServiceWorker.workerRegistrationUpdated',
    VersionUpdated: 'ServiceWorker.workerVersionUpdated',
    Deleted: 'ServiceWorker.deleted',
    Closed: 'ServiceWorker.closed'
  },

  Security: {
    CertificateError: 'Security.certificateErrorReported',
    StateChanged: 'Security.securityStateChangedReported'
  },

  Fetch: {
    requestPaused: 'Fetch.requestPaused',
    authRequired: 'Fetch.authRequired'
  },

  StorageManager: {
    CacheStorageContentUpdated: 'StorageManager.cacheStorageContentUpdated',
    CacheStorageListUpdated: 'StorageManager.cacheStorageListUpdated',
    IndexedDBContentUpdated: 'StorageManager.indexedDBContentUpdated',
    IndexedDBListUpdated: 'StorageManager.indexedDBListUpdated',
    DomStorageItemAdded: 'StorageManager.domStorageItemAdded',
    DomStorageItemRemoved: 'StorageManager.domStorageItemRemoved',
    DomStorageItemUpdated: 'StorageManager.domStorageItemUpdated',
    DomStorageItemsCleared: 'StorageManager.domStorageItemsCleared'
  }
}
