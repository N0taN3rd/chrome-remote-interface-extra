const path = require('path')
const fs = require('fs-extra')
const Diff = require('text-diff')
const mime = require('mime')
const { PNG } = require('pngjs')
const jpeg = require('jpeg-js')
const pixelmatch = require('pixelmatch')

const GoldernDir = path.join(__dirname, '..', 'fixtures', 'golden')

const GoldenComparators = {
  'image/png': compareImages,
  'image/jpeg': compareImages,
  'text/plain': compareText
}

/**
 * @param {string} filePath
 * @param {string} suffix
 * @param {string=} customExtension
 * @return {string}
 */
function addSuffix (filePath, suffix, customExtension) {
  const dirname = path.dirname(filePath)
  const ext = path.extname(filePath)
  const name = path.basename(filePath, ext)
  return path.join(dirname, name + suffix + (customExtension || ext))
}

/**
 * @param {?Object} actualBuffer
 * @param {!Buffer} expectedBuffer
 * @param {!string} mimeType
 * @return {?{diff: (!Object:undefined), errorMessage: (string|undefined)}}
 */
function compareImages (actualBuffer, expectedBuffer, mimeType) {
  if (!actualBuffer || !(actualBuffer instanceof Buffer)) {
    return { errorMessage: 'Actual result should be Buffer.' }
  }

  const actual =
    mimeType === 'image/png'
      ? PNG.sync.read(actualBuffer)
      : jpeg.decode(actualBuffer)
  const expected =
    mimeType === 'image/png'
      ? PNG.sync.read(expectedBuffer)
      : jpeg.decode(expectedBuffer)
  if (expected.width !== actual.width || expected.height !== actual.height) {
    return {
      errorMessage: `Sizes differ: expected image ${expected.width}px X ${
        expected.height
      }px, but got ${actual.width}px X ${actual.height}px. `
    }
  }
  const diff = new PNG({ width: expected.width, height: expected.height })
  const count = pixelmatch(
    expected.data,
    actual.data,
    diff.data,
    expected.width,
    expected.height,
    { threshold: 0.1 }
  )
  return count > 0 ? { diff: PNG.sync.write(diff) } : null
}

/**
 * @param {?Object} actual
 * @param {!Buffer} expectedBuffer
 * @return {?{diff: (!Object:undefined), errorMessage: (string|undefined)}}
 */
function compareText (actual, expectedBuffer) {
  if (typeof actual !== 'string') {
    return { errorMessage: 'Actual result should be string' }
  }
  const expected = expectedBuffer.toString('utf-8')
  if (expected === actual) return null
  const diff = new Diff()
  const result = diff.main(expected, actual)
  diff.cleanupSemantic(result)
  let html = diff.prettyHtml(result)
  const diffStylePath = path.join(GoldernDir, 'diffstyle.css')
  html = `<link rel="stylesheet" href="file://${diffStylePath}">` + html
  return {
    diff: html,
    diffExtension: '.html'
  }
}

module.exports = function compare (goldenPath, outputPath, actual, goldenName) {
  goldenPath = path.normalize(goldenPath)
  outputPath = path.normalize(outputPath)
  const expectedPath = path.join(goldenPath, goldenName)
  const actualPath = path.join(outputPath, goldenName)

  const messageSuffix =
    `Output is saved in "${outputPath}" directory`

  if (!fs.existsSync(expectedPath)) {
    fs.ensureDirSync(outputPath)
    fs.writeFileSync(actualPath, actual)
    return {
      pass: false,
      message: goldenName + ' is missing in golden results. ' + messageSuffix
    }
  }
  const expected = fs.readFileSync(expectedPath)
  const mimeType = mime.getType(goldenName)
  const comparator = GoldenComparators[mimeType]
  if (!comparator) {
    return {
      pass: false,
      message:
        'Failed to find comparator with type ' + mimeType + ': ' + goldenName
    }
  }
  const result = comparator(actual, expected, mimeType)
  if (!result) return { pass: true }
  fs.ensureDirSync(outputPath)
  if (goldenPath === outputPath) {
    fs.writeFileSync(addSuffix(actualPath, '-actual'), actual)
  } else {
    fs.writeFileSync(actualPath, actual)
    // Copy expected to the output/ folder for convenience.
    fs.writeFileSync(addSuffix(actualPath, '-expected'), expected)
  }
  if (result.diff) {
    const diffPath = addSuffix(actualPath, '-diff', result.diffExtension)
    fs.writeFileSync(diffPath, result.diff)
  }

  let message = goldenName + ' mismatch!'
  if (result.errorMessage) message += ' ' + result.errorMessage
  return {
    pass: false,
    message: message + ' ' + messageSuffix
  }
}
