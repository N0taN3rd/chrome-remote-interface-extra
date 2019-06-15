const { launch } = require('just-launch-chrome')
const Browser = require('../../lib/browser/Browser')

const winPos = !process.env.NO_MOVE_WINDOW ? '--window-position=2000,0' : ''

const chromeArgs = [
  '--autoplay-policy=no-user-gesture-required',
  '--disable-background-networking',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-backing-store-limit',
  '--disable-breakpad',
  '--disable-client-side-phishing-detection',
  '--disable-default-apps',
  '--disable-domain-reliability',
  '--disable-extensions',
  '--disable-features=site-per-process,TranslateUI,BlinkGenPropertyTrees,LazyFrameLoading',
  '--disable-hang-monitor',
  '--disable-infobars',
  '--disable-ipc-flooding-protection',
  '--disable-popup-blocking',
  '--disable-prompt-on-repost',
  '--disable-renderer-backgrounding',
  '--disable-sync',
  '--enable-features=NetworkService,NetworkServiceInProcess,AwaitOptimization',
  '--force-color-profile=srgb',
  '--metrics-recording-only',
  '--mute-audio',
  '--no-first-run',
  '--headless',
  winPos,
  'about:blank'
]

/**
 * @return {Promise<Browser>}
 */
exports.initChrome = async function initChrome (
  ignoreHTTPSErrors,
  defaultViewport,
  additionalDomains
) {
  const { browserWSEndpoint, closeBrowser, chromeProcess } = await launch({
    args: chromeArgs
  })
  const browser = await Browser.connect(browserWSEndpoint, {
    ignoreHTTPSErrors,
    defaultViewport,
    additionalDomains,
    process: chromeProcess,
    closeCallback: closeBrowser
  })
  await browser.waitForTarget(t => t.type() === 'page')
  return browser
}
