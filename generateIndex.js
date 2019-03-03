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
const fileRequirePath = filePath => `./lib/${filesBaseName(filePath)}`

/**
 * @param {string} filePath
 * @return {Array<string>}
 */
function getFileExports (filePath) {
  const moduleExports = []
  let exportedKey
  const exported = require(filePath)
  if (typeof exported === 'object') {
    for (exportedKey in exported) {
      moduleExports.push(exportedKey)
    }
  } else {
    moduleExports.push(exported.name)
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
    CP.exec(`yarn run prettier-standard 'index.js'`, error => {
      if (error) {
        return reject(error)
      }
      resolve()
    })
  })
}

const skipped = new Set(['index.js', '__shared.js', 'helper.js'])

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
    file = libFiles[i]
    if (!skipped.has(file)) {
      switch (file) {
        case 'DeviceDescriptors.js':
        case 'USKeyboardLayout.js':
        case 'Events.js':
          indexContents.push(
            `const ${Path.basename(file, '.js')} = require('${fileRequirePath(file)}')`
          )
          indexExports.push(`  ${Path.basename(file, '.js')}`)
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
          if (fileExports.length === 1) {
            indexContents.push(
              `const ${fileExports.join('')} = require('${fileRequirePath(
                file
              )}')`
            )
          } else {
            indexContents.push(
              `const { ${fileExports.join(', ')} } = require('${fileRequirePath(
                file
              )}')`
            )
          }
          break
      }
    }
  }
  indexExports.sort(stringSort)
  indexContents.push(`\nmodule.exports = {\n${indexExports.join(',\n')}\n}\n`)
  await fs.writeFile('./index.js', indexContents.join('\n'), 'utf8')
  await formatGeneratedIndex()
}

gen().catch(error => {
  console.error(error)
})
