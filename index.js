const DOMWorld = require('./lib/DOMWorld')
const DeviceDescriptors = require('./lib/DeviceDescriptors')
const Dialog = require('./lib/Dialog')
const EmulationManager = require('./lib/EmulationManager')
const TimeoutError = require('./lib/Errors')
const Events = require('./lib/Events')
const { createJSHandle, ElementHandle, JSHandle } = require('./lib/JSHandle')
const LifecycleWatcher = require('./lib/LifecycleWatcher')
const Multimap = require('./lib/Multimap')
const Target = require('./lib/Target')
const TaskQueue = require('./lib/TaskQueue')
const TimeoutSettings = require('./lib/TimeoutSettings')
const Tracing = require('./lib/Tracing')
const WaitTask = require('./lib/WaitTask')
const Worker = require('./lib/Worker')
const { Accessibility, AXNode } = require('./lib/accessibility')
const { Browser, BrowserContext } = require('./lib/browser')
const CRIExtra = require('./lib/chromeRemoteInterfaceExtra')
const {
  adaptChromeRemoteInterfaceClient,
  CDPSession,
  CRIClientPatched,
  CRIConnection
} = require('./lib/connection')
const { Coverage, CSSCoverage, JSCoverage } = require('./lib/coverage')
const {
  EVALUATION_SCRIPT_URL,
  ExecutionContext
} = require('./lib/executionContext')
const {
  Frame,
  FrameManager,
  FrameResource,
  FrameResourceTree
} = require('./lib/frames')
const {
  Keyboard,
  Mouse,
  Touchscreen,
  USKeyboardLayout
} = require('./lib/input')
const {
  Cookie,
  NetIdleWatcher,
  NetworkManager,
  Request,
  Response,
  SecurityDetails
} = require('./lib/network')
const { ConsoleMessage, Page } = require('./lib/page')

module.exports = {
  Accessibility,
  adaptChromeRemoteInterfaceClient,
  AXNode,
  Browser,
  BrowserContext,
  CDPSession,
  ConsoleMessage,
  Cookie,
  Coverage,
  createJSHandle,
  CRIClientPatched,
  CRIConnection,
  CRIExtra,
  CSSCoverage,
  DeviceDescriptors,
  Dialog,
  DOMWorld,
  ElementHandle,
  EmulationManager,
  EVALUATION_SCRIPT_URL,
  Events,
  ExecutionContext,
  Frame,
  FrameManager,
  FrameResource,
  FrameResourceTree,
  JSCoverage,
  JSHandle,
  Keyboard,
  LifecycleWatcher,
  Mouse,
  Multimap,
  NetIdleWatcher,
  NetworkManager,
  Page,
  Request,
  Response,
  SecurityDetails,
  Target,
  TaskQueue,
  TimeoutError,
  TimeoutSettings,
  Touchscreen,
  Tracing,
  USKeyboardLayout,
  WaitTask,
  Worker
}
