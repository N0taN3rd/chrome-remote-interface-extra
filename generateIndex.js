const CP = require('child_process')
const Path = require('path')
const fs = require('fs-extra')

const libPath = Path.join(__dirname, 'lib')
const stringSort = (s1, s2) => s1.trim().localeCompare(s2.trim())

/**
 * @param {string} filePath
 * @return {string}
 */
const joinPathWithLibRoot = filePath => Path.join(libPath, filePath)

/**
 * @param {string} filePath
 * @return {string}
 */
const filesBaseName = filePath => Path.basename(filePath, '.js')

/**
 * @param {string} filePath
 * @return {string}
 */
const fileRequirePath = filePath => `./${filesBaseName(filePath)}`

/**
 * @param {string} filePath
 * @return {Array<string>}
 */
function getFileExports (filePath) {
  const moduleExports = []
  let exportedKey
  for (exportedKey in require(filePath)) {
    moduleExports.push(exportedKey)
  }
  moduleExports.sort(stringSort)
  return moduleExports
}

/**
 * @param {string} folderPath
 * @return {Array<string>}
 */
const getFolderExports = folderPath =>
  getFileExports(Path.join(folderPath, 'index.js'))

/**
 * @param {string} filePath
 * @return {Promise<boolean>}
 */
async function isPathToFile (filePath) {
  const stat = await fs.stat(filePath)
  return stat.isFile()
}

function formatGeneratedIndex () {
  return new Promise((resolve, reject) => {
    CP.exec(
      `yarn run prettier-standard ${joinPathWithLibRoot('index.js')}`,
      error => {
        if (error) {
          return reject(error)
        }
        resolve()
      }
    )
  })
}

async function gen () {
  const libFiles = await fs.readdir(libPath)
  const numFiles = libFiles.length
  const indexContents = []
  let indexExports = []
  let i = 0
  let file
  let fileFullPath
  let fileExports
  for (; i < numFiles; i++) {
    if (libFiles[i] !== 'index.js') {
      file = libFiles[i]
      switch (file) {
        case 'USKeyboardLayout.js':
          indexContents.push(
            `const USKeyboardLayout = require('${fileRequirePath(file)}')`
          )
          indexExports.push('  USKeyboardLayout')
          break
        case 'chromeRemoteInterfaceExtra.js':
          indexContents.push(
            `const CRIExtra = require('${fileRequirePath(file)}')`
          )
          indexExports.push('  CRIExtra')
          break
        default:
          fileFullPath = joinPathWithLibRoot(file)
          if (await isPathToFile(fileFullPath)) {
            fileExports = getFileExports(joinPathWithLibRoot(file))
          } else {
            fileExports = getFolderExports(joinPathWithLibRoot(file))
          }
          indexExports.push(...fileExports)
          indexContents.push(
            `const { ${
              fileExports.join(', ')
            } } = require('${fileRequirePath(file)}')`
          )
          break
      }
    }
  }
  indexExports.sort(stringSort)
  indexContents.push(`\nmodule.exports = {\n${indexExports.join(',\n')}\n}\n`)
  await fs.writeFile(
    Path.join(libPath, 'index.js'),
    indexContents.join('\n'),
    'utf8'
  )
  await formatGeneratedIndex()
}

gen().catch(error => {
  console.error(error)
})
