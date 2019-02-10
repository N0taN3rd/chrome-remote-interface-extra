const Events = {
  Page: {
    Close: 'close',
    Console: 'console',
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
    WorkerDestroyed: 'workerdestroyed'
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

  NetworkManager: {
    Request: Symbol('Events.NetworkManager.Request'),
    Response: Symbol('Events.NetworkManager.Response'),
    RequestFailed: Symbol('Events.NetworkManager.RequestFailed'),
    RequestFinished: Symbol('Events.NetworkManager.RequestFinished')
  },

  FrameManager: {
    FrameAttached: Symbol('Events.FrameManager.FrameAttached'),
    FrameNavigated: Symbol('Events.FrameManager.FrameNavigated'),
    FrameDetached: Symbol('Events.FrameManager.FrameDetached'),
    LifecycleEvent: Symbol('Events.FrameManager.LifecycleEvent'),
    FrameNavigatedWithinDocument: Symbol(
      'Events.FrameManager.FrameNavigatedWithinDocument'
    ),
    ExecutionContextCreated: Symbol(
      'Events.FrameManager.ExecutionContextCreated'
    ),
    ExecutionContextDestroyed: Symbol(
      'Events.FrameManager.ExecutionContextDestroyed'
    )
  },

  Connection: {
    Disconnected: 'disconnected'
  }
}

module.exports = { Events }
