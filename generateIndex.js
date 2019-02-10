const Path = require('path')
const fs = require('fs-extra')

const libPath = Path.join(__dirname, 'lib')
const stringSort = (s1, s2) => s1.localeCompare(s2)

async function gen () {
  const libFiles = await fs.readdir(libPath)
  const indexContents = []
  let indexExports = []
  for (let i = 0; i < libFiles.length; i++) {
    if (libFiles[i] !== 'index.js') {
      const file = libFiles[i]
      const requirePath = `./${Path.basename(file, '.js')}`
      switch (file) {
        case 'USKeyboardLayout.js':
          indexContents.push(
            `const USKeyboardLayout = require('${requirePath}')`
          )
          indexExports.push('  USKeyboardLayout')
          break
        case 'chromeRemoteInterfaceExtra.js':
          indexContents.push(`const CRIExtra = require('${requirePath}')`)
          indexExports.push('  CRIExtra')
          break
        default:
          const exports = Object.keys(require(Path.join(libPath, file)))
          indexExports = indexExports.concat(exports.map(e => `  ${e}`))
          exports.sort(stringSort)
          indexContents.push(
            `const { ${exports.join(', ')} } = require('${requirePath}')`
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
}

gen().catch(error => {
  console.error(error)
})
