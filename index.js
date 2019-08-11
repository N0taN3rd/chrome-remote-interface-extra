const Audits = require('./lib/Audits')
const ConsoleMessage = require('./lib/ConsoleMessage')
const DOMWorld = require('./lib/DOMWorld')
const DeviceDescriptors = require('./lib/DeviceDescriptors')
const Dialog = require('./lib/Dialog')
const EmulationManager = require('./lib/EmulationManager')
const TimeoutError = require('./lib/Errors')
const Events = require('./lib/Events')
const { createJSHandle, ElementHandle, JSHandle } = require('./lib/JSHandle')
const LifecycleWatcher = require('./lib/LifecycleWatcher')
const Multimap = require('./lib/Multimap')
const SecurityManager = require('./lib/SecurityManager')
const StorageManager = require('./lib/StorageManager')
const Target = require('./lib/Target')
const TaskQueue = require('./lib/TaskQueue')
const TimeoutSettings = require('./lib/TimeoutSettings')
const Tracing = require('./lib/Tracing')
const WaitTask = require('./lib/WaitTask')
const { Accessibility, AXNode } = require('./lib/accessibility')
const { Animation, AnimationManager } = require('./lib/animations')
const { Browser, BrowserContext } = require('./lib/browser')
const CRIExtra = require('./lib/chromeRemoteInterfaceExtra')
const {
  adaptChromeRemoteInterfaceClient,
  CDPSession,
  CRIClientPatched,
  CRIConnection
} = require('./lib/connection')
const { Coverage, CSSCoverage, JSCoverage } = require('./lib/coverage')
const { Database, DatabaseManager } = require('./lib/database')
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
  Fetch,
  NetIdleWatcher,
  NetworkManager,
  Request,
  Response,
  SecurityDetails
} = require('./lib/network')
const { FileChooser, LogEntry, Page } = require('./lib/page')
const { ServiceWorker, Worker, WorkerManager } = require('./lib/workers')

exports.Accessibility = Accessibility
exports.adaptChromeRemoteInterfaceClient = adaptChromeRemoteInterfaceClient
exports.Animation = Animation
exports.AnimationManager = AnimationManager
exports.Audits = Audits
exports.AXNode = AXNode
exports.Browser = Browser
exports.BrowserContext = BrowserContext
exports.CDPSession = CDPSession
exports.ConsoleMessage = ConsoleMessage
exports.Cookie = Cookie
exports.Coverage = Coverage
exports.createJSHandle = createJSHandle
exports.CRIClientPatched = CRIClientPatched
exports.CRIConnection = CRIConnection
exports.CRIExtra = CRIExtra
exports.CSSCoverage = CSSCoverage
exports.Database = Database
exports.DatabaseManager = DatabaseManager
exports.DeviceDescriptors = DeviceDescriptors
exports.Dialog = Dialog
exports.DOMWorld = DOMWorld
exports.ElementHandle = ElementHandle
exports.EmulationManager = EmulationManager
exports.EVALUATION_SCRIPT_URL = EVALUATION_SCRIPT_URL
exports.Events = Events
exports.ExecutionContext = ExecutionContext
exports.Fetch = Fetch
exports.FileChooser = FileChooser
exports.Frame = Frame
exports.FrameManager = FrameManager
exports.FrameResource = FrameResource
exports.FrameResourceTree = FrameResourceTree
exports.JSCoverage = JSCoverage
exports.JSHandle = JSHandle
exports.Keyboard = Keyboard
exports.LifecycleWatcher = LifecycleWatcher
exports.LogEntry = LogEntry
exports.Mouse = Mouse
exports.Multimap = Multimap
exports.NetIdleWatcher = NetIdleWatcher
exports.NetworkManager = NetworkManager
exports.Page = Page
exports.Request = Request
exports.Response = Response
exports.SecurityDetails = SecurityDetails
exports.SecurityManager = SecurityManager
exports.ServiceWorker = ServiceWorker
exports.StorageManager = StorageManager
exports.Target = Target
exports.TaskQueue = TaskQueue
exports.TimeoutError = TimeoutError
exports.TimeoutSettings = TimeoutSettings
exports.Touchscreen = Touchscreen
exports.Tracing = Tracing
exports.USKeyboardLayout = USKeyboardLayout
exports.WaitTask = WaitTask
exports.Worker = Worker
exports.WorkerManager = WorkerManager
