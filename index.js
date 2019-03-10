const TimeoutError = require('./lib/Errors')
const Events = require('./lib/Events')
const Audits = require('./lib/Audits')
const ConsoleMessage = require('./lib/ConsoleMessage')
const DOMWorld = require('./lib/DOMWorld')
const DeviceDescriptors = require('./lib/DeviceDescriptors')
const Dialog = require('./lib/Dialog')
const EmulationManager = require('./lib/EmulationManager')
const { createJSHandle, ElementHandle, JSHandle } = require('./lib/JSHandle')
const LifecycleWatcher = require('./lib/LifecycleWatcher')
const Multimap = require('./lib/Multimap')
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
  NetIdleWatcher,
  NetworkManager,
  Request,
  Response,
  SecurityDetails
} = require('./lib/network')
const { LogEntry, Page } = require('./lib/page')
const { ServiceWorker, Worker, WorkerManager } = require('./lib/workers')

/**
 * @type {Accessibility}
 */
exports.Accessibility = Accessibility

exports.adaptChromeRemoteInterfaceClient = adaptChromeRemoteInterfaceClient

/**
 * @type {Animation}
 */
exports.Animation = Animation

/**
 * @type {AnimationManager}
 */
exports.AnimationManager = AnimationManager

/**
 * @type {Audits}
 */
exports.Audits = Audits

/**
 * @type {AXNode}
 */
exports.AXNode = AXNode

/**
 * @type {Browser}
 */
exports.Browser = Browser

/**
 * @type {BrowserContext}
 */
exports.BrowserContext = BrowserContext

/**
 * @type {CDPSession}
 */
exports.CDPSession = CDPSession

/**
 * @type {ConsoleMessage}
 */
exports.ConsoleMessage = ConsoleMessage

/**
 * @type {Cookie}
 */
exports.Cookie = Cookie

/**
 * @type {Coverage}
 */
exports.Coverage = Coverage

exports.createJSHandle = createJSHandle

/**
 * @type {symbol}
 */
exports.CRIClientPatched = CRIClientPatched

/**
 * @type {CRIConnection}
 */
exports.CRIConnection = CRIConnection

exports.CRIExtra = CRIExtra

/**
 * @type {CSSCoverage}
 */
exports.CSSCoverage = CSSCoverage

/**
 * @type {Database}
 */
exports.Database = Database

/**
 * @type {DatabaseManager}
 */
exports.DatabaseManager = DatabaseManager

/**
 * @type {Object}
 */
exports.DeviceDescriptors = DeviceDescriptors

/**
 * @type {Dialog}
 */
exports.Dialog = Dialog

/**
 * @type {DOMWorld}
 */
exports.DOMWorld = DOMWorld

/**
 * @type {ElementHandle}
 */
exports.ElementHandle = ElementHandle

/**
 * @type {EmulationManager}
 */
exports.EmulationManager = EmulationManager

/**
 * @type {string}
 */
exports.EVALUATION_SCRIPT_URL = EVALUATION_SCRIPT_URL

/**
 * @type {Events}
 */
exports.Events = Events

/**
 * @type {ExecutionContext}
 */
exports.ExecutionContext = ExecutionContext

/**
 * @type {Frame}
 */
exports.Frame = Frame

/**
 * @type {FrameManager}
 */
exports.FrameManager = FrameManager

/**
 * @type {FrameResource}
 */
exports.FrameResource = FrameResource

/**
 * @type {FrameResourceTree}
 */
exports.FrameResourceTree = FrameResourceTree

/**
 * @type {JSCoverage}
 */
exports.JSCoverage = JSCoverage

/**
 * @type {JSHandle}
 */
exports.JSHandle = JSHandle

/**
 * @type {Keyboard}
 */
exports.Keyboard = Keyboard

/**
 * @type {LifecycleWatcher}
 */
exports.LifecycleWatcher = LifecycleWatcher

/**
 * @type {LogEntry}
 */
exports.LogEntry = LogEntry

/**
 * @type {Mouse}
 */
exports.Mouse = Mouse

/**
 * @type {Multimap}
 */
exports.Multimap = Multimap

/**
 * @type {NetIdleWatcher}
 */
exports.NetIdleWatcher = NetIdleWatcher

/**
 * @type {NetworkManager}
 */
exports.NetworkManager = NetworkManager

/**
 * @type {Page}
 */
exports.Page = Page

/**
 * @type {Request}
 */
exports.Request = Request

/**
 * @type {Response}
 */
exports.Response = Response

/**
 * @type {SecurityDetails}
 */
exports.SecurityDetails = SecurityDetails

/**
 * @type {ServiceWorker}
 */
exports.ServiceWorker = ServiceWorker

/**
 * @type {Target}
 */
exports.Target = Target

/**
 * @type {TaskQueue}
 */
exports.TaskQueue = TaskQueue

/**
 * @type {TimeoutError}
 */
exports.TimeoutError = TimeoutError

/**
 * @type {TimeoutSettings}
 */
exports.TimeoutSettings = TimeoutSettings

/**
 * @type {Touchscreen}
 */
exports.Touchscreen = Touchscreen

/**
 * @type {Tracing}
 */
exports.Tracing = Tracing

/**
 * @type {Object}
 */
exports.USKeyboardLayout = USKeyboardLayout

/**
 * @type {WaitTask}
 */
exports.WaitTask = WaitTask

/**
 * @type {Worker}
 */
exports.Worker = Worker

/**
 * @type {WorkerManager}
 */
exports.WorkerManager = WorkerManager
