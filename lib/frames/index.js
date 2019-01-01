const { FrameManager, FrameManagerEvents } = require('./manager')
const Frame = require('./frame')
const LifecycleWatcher = require('./lifecycleWatcher')
const WaitTask = require('./waitTask')

/**
 * @type {{Frame: Frame, WaitTask: WaitTask, FrameManagerEvents: ({ExecutionContextDestroyed: symbol, FrameAttached: symbol, FrameDetached: symbol, ExecutionContextCreated: symbol, FrameNavigatedWithinDocument: symbol, LifecycleEvent: symbol, FrameNavigated: symbol}|{ExecutionContextDestroyed, FrameAttached, FrameDetached, ExecutionContextCreated, FrameNavigatedWithinDocument, LifecycleEvent, FrameNavigated}), FrameManager: FrameManager, LifecycleWatcher: LifecycleWatcher}}
 */
module.exports = {
  FrameManager,
  FrameManagerEvents,
  Frame,
  LifecycleWatcher,
  WaitTask
}
