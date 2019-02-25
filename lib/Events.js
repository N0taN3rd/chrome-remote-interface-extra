module.exports = {
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
    WorkerDestroyed: 'workerdestroyed',
    Crashed: 'Page.crashed'
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
    Disconnected: 'Events.CRIConnection.Disconnected'
  },

  CDPSession: {
    Disconnected: 'Events.CDPSession.Disconnected'
  },

  NetworkIdleMonitor: {
    NetworkIdle: 'network-idle'
  }
}
