const cp = require('child_process')
const Path = require('path')
const fs = require('fs-extra')
const parser = require('@babel/parser')
const generator = require('@babel/generator').default
const btypes = require('@babel/types')
const traverse = require('@babel/traverse')

const genOpts = {
  jsescOption: {
    quotes: 'single',
    wrap: true
  },
  sourceMaps: false,
  retainLines: true
}
const parseOptions = {
  plugins: [
    'bigInt',
    'objectRestSpread',
    'asyncGenerators',
    'throwExpressions'
  ],
  strictMode: false,
  sourceType: 'script'
}
const postProcessingParseOpts = Object.assign({}, parseOptions, {
  sourceType: 'module'
})
const pTestPath = Path.join(__dirname, '..', 'puppeteer-master', 'test')
const tempTestPath = Path.join(__dirname, '..', 'tempTests')

const cleanUpString = `test.serial.afterEach.always(async t => {
  await helper.cleanup()
})

test.after.always(async t => {
  await helper.end()
})`

const contextStrings = {
  page: `  t.context.page = await helper.newPage()`,
  server: '  t.context.server = helper.server()',
  httpsServer: '  t.context.httpsServer = helper.httpsServer()',
  browser: `  t.context.browser = helper.browser()`,
  context: '  t.context.context = await helper.context()',
  toBeGolden: `  t.context.toBeGolden = (t, what, filePath) => {
const results = helper.toBeGolden(what, filePath)
t.true(results.pass, results.message)
}`
}

const FFID = { name: 'FFOX' }
const ChromeID = { name: 'CHROME' }
const isIdExpectOpts = { name: 'expect' }
const describeID = { name: 'describe' }
const avaTId = { name: 't' }
const describes = new Set(['describe', 'describe_fails_ffox'])
const its = new Set(['it', 'fit', 'xit', 'it_fails_ffox'])

// skipped because the chrome-remote-interface does not implement this functionality
// if you want that use puppeteer :)
const skipped = new Set([
  'launcher.spec.js',
  'puppeteer.spec.js',
  'chromiumonly.spec.js',
  'firefoxonly.spec.js',
  'headful.spec.js',
  'fixtures.spec.js'
])

function printNode (node) {
  console.log(generator(node, genOpts).code)
}

const expectToAva = {
  toBeGolden: (actual, filePath) =>
    btypes.callExpression(
      btypes.memberExpression(
        btypes.memberExpression(
          btypes.identifier('t'),
          btypes.identifier('context')
        ),
        btypes.identifier('toBeGolden')
      ),
      [btypes.identifier('t'), actual, filePath]
    ),
  toBeLessThan: (actual, expected) =>
    btypes.callExpression(
      btypes.memberExpression(
        btypes.identifier('t'),
        btypes.identifier('true')
      ),
      [btypes.binaryExpression('<', actual, expected)]
    ),
  toBeGreaterThan: (actual, expected) =>
    btypes.callExpression(
      btypes.memberExpression(
        btypes.identifier('t'),
        btypes.identifier('true')
      ),
      [btypes.binaryExpression('>', actual, expected)]
    ),
  toBeGreaterThanOrEqual: (actual, expected) =>
    btypes.callExpression(
      btypes.memberExpression(
        btypes.identifier('t'),
        btypes.identifier('true')
      ),
      [btypes.binaryExpression('>=', actual, expected)]
    ),
  toBe (actual, expected) {
    if (btypes.isBooleanLiteral(expected)) {
      if (expected.value) {
        return btypes.callExpression(
          btypes.memberExpression(
            btypes.identifier('t'),
            btypes.identifier('true')
          ),
          [actual]
        )
      }
      return btypes.callExpression(
        btypes.memberExpression(
          btypes.identifier('t'),
          btypes.identifier('false')
        ),
        [actual]
      )
    } else if (
      btypes.isNullLiteral(expected) ||
      btypes.isIdentifier(expected, { name: 'undefined' })
    ) {
      return btypes.callExpression(
        btypes.memberExpression(
          btypes.identifier('t'),
          btypes.identifier('falsy')
        ),
        [actual]
      )
    }
    return btypes.callExpression(
      btypes.memberExpression(btypes.identifier('t'), btypes.identifier('is')),
      [actual, expected]
    )
  },
  toBeInstanceOf: (actual, expected) =>
    btypes.callExpression(
      btypes.memberExpression(
        btypes.identifier('t'),
        btypes.identifier('true')
      ),
      [btypes.binaryExpression('instanceof', actual, expected)]
    ),
  toBeNull: (actual, expected) =>
    btypes.callExpression(
      btypes.memberExpression(
        btypes.identifier('t'),
        btypes.identifier('falsy')
      ),
      [actual]
    ),
  toBeTruthy: (actual, expected) =>
    btypes.callExpression(
      btypes.memberExpression(
        btypes.identifier('t'),
        btypes.identifier('truthy')
      ),
      [actual]
    ),
  toBeFalsy: (actual, expected) =>
    btypes.callExpression(
      btypes.memberExpression(
        btypes.identifier('t'),
        btypes.identifier('falsy')
      ),
      [actual]
    ),
  toEqual: (actual, expected) =>
    btypes.callExpression(
      btypes.memberExpression(
        btypes.identifier('t'),
        btypes.identifier('deepEqual')
      ),
      [actual, expected]
    ),
  toContain: (actual, expected) =>
    btypes.callExpression(
      btypes.memberExpression(
        btypes.identifier('t'),
        btypes.identifier('true')
      ),
      [
        btypes.callExpression(
          btypes.memberExpression(actual, btypes.identifier('includes')),
          [expected]
        )
      ]
    )
}

const inverseExpectToAva = {
  toBeLessThan: (actual, expected) =>
    btypes.callExpression(
      btypes.memberExpression(
        btypes.identifier('t'),
        btypes.identifier('true')
      ),
      [btypes.binaryExpression('>=', actual, expected)]
    ),
  toBeNull: (actual, expected) =>
    btypes.callExpression(
      btypes.memberExpression(
        btypes.identifier('t'),
        btypes.identifier('truthy')
      ),
      [actual]
    ),
  toBe: (actual, expected) => {
    if (btypes.isBooleanLiteral(expected)) {
      if (expected.value) {
        return btypes.callExpression(
          btypes.memberExpression(
            btypes.identifier('t'),
            btypes.identifier('false')
          ),
          [actual]
        )
      }
      return btypes.callExpression(
        btypes.memberExpression(
          btypes.identifier('t'),
          btypes.identifier('true')
        ),
        [actual]
      )
    } else if (
      btypes.isNullLiteral(expected) ||
      btypes.isIdentifier(expected, { name: 'undefined' })
    ) {
      return btypes.callExpression(
        btypes.memberExpression(
          btypes.identifier('t'),
          btypes.identifier('truthy')
        ),
        [actual]
      )
    }
    return btypes.callExpression(
      btypes.memberExpression(
        btypes.identifier('t'),
        btypes.identifier('true')
      ),
      [btypes.binaryExpression('!=', actual, expected)]
    )
  },
  toContain: (actual, expected) =>
    btypes.callExpression(
      btypes.memberExpression(
        btypes.identifier('t'),
        btypes.identifier('false')
      ),
      [
        btypes.callExpression(
          btypes.memberExpression(actual, btypes.identifier('includes')),
          [expected]
        )
      ]
    )
}

const describingWhat = path => path.node.arguments[0].value
const isDescribe = path => describes.has(path.node.callee.name)
const isIt = path => its.has(path.node.callee.name)
const isBeforeEach = path => path.node.callee.name === 'beforeEach'
const isAfterEach = path => path.node.callee.name === 'afterEach'

const isExpect = path =>
  btypes.isMemberExpression(path.node.callee) &&
  btypes.isIdentifier(path.node.callee.object.callee, isIdExpectOpts)

const isRequire = declaration =>
  btypes.isCallExpression(declaration.init) &&
  declaration.init.callee.name === 'require'

const argZeroEquals = (args, shouldEq) =>
  args ? args[0].value === shouldEq : false

const isRequireUtils = declaration =>
  isRequire(declaration) &&
  (declaration.id.name === 'utils' ||
    argZeroEquals(declaration.init.arguments, './utils'))

const node6Stuff = declaration =>
  declaration.id.name === 'asyncawait' &&
  btypes.isBooleanLiteral(declaration.init)

const isNode6InterOpIt = path =>
  btypes.isConditionalExpression(path.node.callee) &&
  btypes.isIdentifier(path.node.callee.test, { name: 'asyncawait' })

const isInverseExpect = path =>
  btypes.isMemberExpression(path.node.callee) &&
  btypes.isMemberExpression(path.node.callee.object) &&
  btypes.isCallExpression(path.node.callee.object.object) &&
  btypes.isIdentifier(path.node.callee.object.object.callee, isIdExpectOpts)

const isVariableDeclarInnerChildOfDescribe = vdPath =>
  vdPath.parentPath &&
  vdPath.parentPath.parentPath &&
  vdPath.parentPath.parentPath.parentPath &&
  btypes.isCallExpression(vdPath.parentPath.parentPath.parentPath.node) &&
  btypes.isIdentifier(
    vdPath.parentPath.parentPath.parentPath.node.callee,
    describeID
  )

const isImportantTopLevelThingy = init =>
  btypes.isMemberExpression(init) &&
  btypes.isIdentifier(init.object.object, {
    name: 'DeviceDescriptors'
  })

const createTContext = context =>
  btypes.variableDeclaration('const', [
    btypes.variableDeclarator(
      btypes.objectPattern(context.properties),
      btypes.memberExpression(
        btypes.identifier('t'),
        btypes.identifier('context')
      )
    )
  ])

const makeAsyncT = body =>
  btypes.arrowFunctionExpression([btypes.identifier('t')], body, true)

const makeTPass = () =>
  btypes.callExpression(
    btypes.memberExpression(btypes.identifier('t'), btypes.identifier('pass')),
    []
  )

function makeImportTestUtils (declaration) {
  if (btypes.isObjectPattern(declaration.id)) {
    return btypes.importDeclaration(
      declaration.id.properties.map(prop =>
        btypes.importSpecifier(
          btypes.identifier(prop.key.name),
          btypes.identifier(prop.key.name)
        )
      ),
      btypes.stringLiteral('./helpers/utils')
    )
  }
  return btypes.importDeclaration(
    [btypes.importNamespaceSpecifier(btypes.identifier('utils'))],
    btypes.stringLiteral('./helpers/utils')
  )
}

function remapModuleSpecifier (id) {
  switch (id.value) {
    case 'fs':
      id.value = 'fs-extra'
      break
  }
  return id
}

function makeImport (declaration) {
  if (btypes.isObjectPattern(declaration.id)) {
    return btypes.importDeclaration(
      declaration.id.properties.map(prop =>
        btypes.importSpecifier(
          btypes.identifier(prop.key.name),
          btypes.identifier(prop.key.name)
        )
      ),
      remapModuleSpecifier(declaration.init.arguments[0])
    )
  }
  return btypes.importDeclaration(
    [btypes.importNamespaceSpecifier(declaration.id)],
    remapModuleSpecifier(declaration.init.arguments[0])
  )
}

function extractIt ({ fnPath, itPath, collector, parentDescribe, describing }) {
  let hasExpect = false
  fnPath.traverse({
    VariableDeclaration (varDecPath) {
      // because mainline puppeteer is now compiling FF for use with the lib
      // they must use two different expected value (Chrome vs FF)
      // we only the one for Chrome and it is the alternate (FFOX ? FFV : ChromeV)
      if (
        varDecPath.node.declarations.length === 1 &&
        btypes.isConditionalExpression(varDecPath.node.declarations[0].init) &&
        btypes.isIdentifier(varDecPath.node.declarations[0].init.test, FFID)
      ) {
        // in place modification is enough here as the init
        // semantics are changed correctly by swapping from
        // conditional assignment to direct assignment
        varDecPath.node.declarations[0].init =
          varDecPath.node.declarations[0].init.alternate
      }
    },
    CallExpression (expectPath) {
      // find and convert all expects to ava <3
      if (isExpect(expectPath)) {
        const transform = expectToAva[expectPath.node.callee.property.name]
        if (!transform) {
          console.log('boooo', expectPath.node.callee.property.name)
        } else if (expectPath.node.callee.property.name === 'toBeGolden') {
          collector.requiredContexts.add('toBeGolden')
        }
        expectPath.parentPath.replaceWith(
          transform(
            expectPath.node.callee.object.arguments[0],
            expectPath.node.arguments[0]
          )
        )
        hasExpect = true
      } else if (isInverseExpect(expectPath)) {
        const transform =
          inverseExpectToAva[expectPath.node.callee.property.name]
        if (!transform) {
          console.log('boooo inverse', expectPath.node.callee.property.name)
        } else if (expectPath.node.callee.property.name === 'toBeGolden') {
          collector.requiredContexts.add('toBeGolden')
        }
        hasExpect = true
        // printNode(expectPath.node)
        expectPath.parentPath.replaceWith(
          transform(
            expectPath.node.callee.object.object.arguments[0],
            expectPath.node.arguments[0]
          )
        )
      }
    }
  })
  if (!hasExpect) {
    // there was no expect for this it variant and puppeteer uses timeouts
    // to indicate failure if no assertions are used, ava not so much (good on ya)
    // so we need explicitly pass this test if we did not timeout :)
    fnPath.node.body.body.push(makeTPass())
  }
  // replace the original context with the correct ava one
  fnPath.node.body.body.unshift(createTContext(fnPath.node.params[0]))
  // extract the context used by this test for our beforeAll
  const props = fnPath.node.params[0].properties
  for (let i = 0; i < props.length; i++) {
    collector.requiredContexts.add(props[i].key.name)
  }
  // update names and description
  itPath.node.callee.name = 'test.serial'
  const descript = parentDescribe
    ? `${parentDescribe} - ${describing}:`
    : describing

  itPath.node.arguments[0].value = `${descript} ${
    itPath.node.arguments[0].value
  }`
  // replace the implementation with the correct ava one
  itPath.node.arguments[1] = makeAsyncT(fnPath.node.body)
  collector.tests.push(itPath.node)
  // we dont need to continue further traversing this it variant
  fnPath.stop()
}

function traveseIt (somePath, collector, describing, parentDescribe) {
  // it variant definitions are either function expressions, async function (context) {impl}
  // or arrow function expressions,  async (context) => { impl }
  somePath.traverse({
    FunctionExpression (fnPath) {
      extractIt({
        fnPath,
        itPath: somePath,
        collector,
        parentDescribe,
        describing
      })
    },
    ArrowFunctionExpression (fnPath) {
      extractIt({
        fnPath,
        itPath: somePath,
        collector,
        parentDescribe,
        describing
      })
    }
  })
}

function transformAndExtractDescribe (path, { collector, parentDescribe }) {
  const describing = describingWhat(path)
  path.traverse({
    CallExpression (somePath) {
      if (isIt(somePath)) {
        // we found an [it variant](descript, impl) of some describe
        traveseIt(somePath, collector, describing, parentDescribe)
      } else if (isDescribe(somePath)) {
        // we found an describe(descript, impl) of some describe
        transformAndExtractDescribe(somePath, {
          collector,
          parentDescribe: describing
        })
      } else if (isNode6InterOpIt(somePath)) {
        somePath.node.callee = somePath.node.callee.consequent
        // node 6 (asyncawait ? it : xit)(imple) of some describe
        traveseIt(somePath, collector, describing, parentDescribe)
      }
    },
    VariableDeclaration (vdPath) {
      // printNode(vdPath.parentPath.parentPath.parentPath.node)
      if (isVariableDeclarInnerChildOfDescribe(vdPath)) {
        // we found an inner helper for some describe
        // there will be duplicates so lets help ourselves out by
        // by just renaming the inner helper to an unique name
        // and then changing all its references to the new name because we
        // are hoisting this helper to our global scope
        const name = vdPath.node.declarations[0].id.name
        const vd = btypes.cloneDeep(vdPath.node)
        const declar = vd.declarations[0]
        const id = path.scope.generateUidIdentifierBasedOnNode(declar)
        declar.id = id
        vdPath.parentPath.scope.rename(name, id.name)
        collector.tests.unshift(vd)
      }
    },
    FunctionDeclaration (fnd) {
      // for this case we will either have a sub function of some it
      // that contains some expects or an utility function so we need
      // to traverse function declaration where an call expressions maybe an expect
      // and if no expects were found in the function its a test util we need
      let hadExpect = false
      fnd.traverse({
        CallExpression (expectPath) {
          if (isExpect(expectPath)) {
            const transform = expectToAva[expectPath.node.callee.property.name]
            if (!transform) {
              console.log('boooo', expectPath.node.callee.property.name)
            }
            expectPath.parentPath.replaceWith(
              transform(
                expectPath.node.callee.object.arguments[0],
                expectPath.node.arguments[0]
              )
            )
            hadExpect = true
          } else if (isInverseExpect(expectPath)) {
            const transform =
              inverseExpectToAva[expectPath.node.callee.property.name]
            if (!transform) {
              console.log('boooo inverse', expectPath.node.callee.property.name)
            }
            // printNode(expectPath.node)
            expectPath.parentPath.replaceWith(
              transform(
                expectPath.node.callee.object.object.arguments[0],
                expectPath.node.arguments[0]
              )
            )
            hadExpect = true
          }
        }
      })
      if (!hadExpect) {
        collector.tests.unshift(fnd.node)
      }
    }
  })
}

function buildContext (requiredContexts) {
  const strs = []
  for (const rc of requiredContexts) {
    strs.push(contextStrings[rc])
  }
  return `test.serial.beforeEach(async t => {
${strs.join('\n')}
})`
}

function buildBefore (requiredContexts) {
  const beforeStrings = []
  if (requiredContexts.has('server') && requiredContexts.has('httpsServer')) {
    beforeStrings.push('  helper = await TestHelper.withHTTPAndHTTPS(t)')
  } else if (requiredContexts.has('httpsServer')) {
    beforeStrings.push('  helper = await TestHelper.withHTTPS(t)')
  } else {
    beforeStrings.push('  helper = await TestHelper.withHTTP(t)')
  }
  return `/** @type {TestHelper} */
let helper

test.serial.before(async t => {
  ${beforeStrings.join('\n')}
})`
}

async function createTest (pTestPath, crieTestPath) {
  // console.log(pTestPath, crieTestPath)
  const contents = await fs.readFile(pTestPath, 'utf-8')
  const ast = parser.parse(contents, parseOptions)
  const setupDeclars = []
  const collector = {
    requiredContexts: new Set(),
    tests: []
  }
  const setupImports = []
  traverse.default(ast, {
    IfStatement (path) {
      // I really do not want to do this by hand so lets check
      // for chrome vs ff if statements and put the good path (chrome)
      // before the if statement then remote entire if statement
      if (btypes.isIdentifier(path.node.test, ChromeID)) {
        path.insertBefore(btypes.clone(path.node.consequent))
        path.remove()
      } else if (btypes.isIdentifier(path.node.test, FFID)) {
        path.insertBefore(btypes.clone(path.node.alternate))
        path.remove()
      } else if (btypes.isLogicalExpression(path.node.test)) {
        if (btypes.isIdentifier(path.node.test.left, FFID)) {
          path.insertBefore(btypes.clone(path.node.alternate))
          path.remove()
        } else if (btypes.isIdentifier(path.node.test.left, ChromeID)) {
          path.insertBefore(btypes.clone(path.node.consequent))
          path.remove()
        }
      }
    },
    VariableDeclaration (path) {
      if (path.parentPath.parent.type === 'File') {
        // we only want the requires and any variables
        // living at the top most scope of this file
        const declaration = path.node.declarations[0]
        if (isRequireUtils(declaration)) {
          setupImports.push(makeImportTestUtils(declaration))
        } else if (isRequire(declaration)) {
          setupImports.push(makeImport(declaration))
        } else if (!node6Stuff(declaration)) {
          setupDeclars.push(path.node)
        }
      }
    },
    FunctionDeclaration (path) {
      if (path.parentPath.parent.type === 'File') {
        // we only want any function declares living at
        // the top most scope of this file
        if (path.node.leadingComments && path.node.leadingComments.length) {
          path.node.leadingComments.length = 0
        }
        setupDeclars.push(path.node)
      }
    },
    CallExpression (dPath) {
      if (isDescribe(dPath)) {
        // found a describe scope so lets descend into it
        transformAndExtractDescribe(dPath, { collector })
      }
    }
  })

  if (pTestPath.includes('cookies')) {
    // lets be nice to ourselves and ensuring our fundamental changes to cookies
    // can be tested using original code easily. I dont want to convert by hand again
    const cookiesId = { name: 'cookies' }
    const setCookie = { name: 'setCookie' }
    traverse.default(ast, {
      AwaitExpression (aep) {
        if (
          btypes.isCallExpression(aep.node.argument) &&
          btypes.isMemberExpression(aep.node.argument.callee) &&
          btypes.isIdentifier(aep.node.argument.callee.property, cookiesId) &&
          !generator(aep.parentPath.node, genOpts).code.includes(')).map')
        ) {
          const newAwait = btypes.cloneDeep(aep.node)
          aep.replaceWith(
            btypes.callExpression(
              btypes.memberExpression(newAwait, btypes.identifier('map')),
              [
                btypes.arrowFunctionExpression(
                  [btypes.identifier('c')],
                  btypes.memberExpression(
                    btypes.identifier('c'),
                    btypes.identifier('_cookie')
                  )
                )
              ]
            )
          )
        } else if (
          btypes.isCallExpression(aep.node.argument) &&
          btypes.isMemberExpression(aep.node.argument.callee) &&
          btypes.isIdentifier(aep.node.argument.callee.property, setCookie) &&
          aep.node.argument.arguments.length > 1
        ) {
          // I change set cookie to only set a single cookie so lets fix that
          aep.node.argument.callee.property.name = 'setCookies'
        }
      }
    })
  }

  const imports = [`import test from 'ava'`]
  const codeParts = []
  for (let i = 0; i < setupImports.length; i++) {
    imports.push(generator(setupImports[i], genOpts).code)
  }
  imports.push(
    `import TestHelper from './helpers/testHelper'`,
    `import { TimeoutError } from '../lib/Errors'`
  )
  codeParts.push(imports.join('\n'))
  for (let i = 0; i < setupDeclars.length; i++) {
    codeParts.push(generator(setupDeclars[i], genOpts).code)
  }
  codeParts.push(buildBefore(collector.requiredContexts))
  codeParts.push(buildContext(collector.requiredContexts))
  codeParts.push(cleanUpString)

  for (let i = 0; i < collector.tests.length; i++) {
    codeParts.push(generator(collector.tests[i], genOpts).code)
  }

  await fs.writeFile(crieTestPath, codeParts.join('\n\n'), 'utf-8')
}

const isTTestAwaitSomething = path =>
  btypes.isIdentifier(path.node.callee.object, avaTId) &&
  path.node.arguments.length > 0 &&
  (btypes.isAwaitExpression(path.node.arguments[0]) ||
    (btypes.isMemberExpression(path.node.arguments[0]) &&
      btypes.isAwaitExpression(path.node.arguments[0].object)))
async function postProcessing () {
  const tempTestFiles = await fs.readdir(tempTestPath)
  // const tempTestFiles = await fs.readdir('/home/john/WebstormProjects/chrome-remote-interface-extra/test')
  for (let i = 0; i < tempTestFiles.length; i++) {
    const testFile = tempTestFiles[i]
    if (!testFile.endsWith('.js')) continue
    const ttp = Path.join(tempTestPath, testFile)
    // const ttp = Path.join('/home/john/WebstormProjects/chrome-remote-interface-extra/test', testFile)
    console.log(testFile, ttp)
    const contents = await fs.readFile(ttp, 'utf-8')
    const ast = parser.parse(contents, postProcessingParseOpts)
    let wasChange = false
    let resultCount = 0
    let lastParentFn
    traverse.default(ast, {
      CallExpression (path) {
        if (isTTestAwaitSomething(path)) {
          const clonedPath = btypes.clone(path.node)
          const awaitexpr = btypes.clone(path.node.arguments[0])
          const curParentFn = path.getFunctionParent()
          let result
          if (lastParentFn == null) {
            lastParentFn = curParentFn
            resultCount = 0
          } else if (lastParentFn !== curParentFn) {
            lastParentFn = curParentFn
            resultCount = 0
          } else {
            resultCount += 1
          }
          if (resultCount > 0) {
            result = btypes.identifier(`testResult${resultCount}`)
          } else {
            result = btypes.identifier(`testResult`)
          }
          clonedPath.arguments[0] = result
          path.insertBefore(
            btypes.variableDeclaration('const', [
              btypes.variableDeclarator(result, awaitexpr)
            ])
          )
          path.replaceWith(clonedPath)
          wasChange = true
          // printNode(path.node)
        }
      }
    })
    if (wasChange) {
      await fs.writeFile(ttp, generator(ast, genOpts).code, 'utf-8')
    }
  }
  await new Promise((resolve, reject) => {
    cp.exec(
      `node ${Path.join(
        __dirname,
        '..',
        'node_modules',
        '.bin',
        'prettier-standard'
      )} ${tempTestPath}/*.js`,
      error => {
        if (error) {
          return reject(error)
        }
        resolve()
      }
    )
  })
}

async function doIt () {
  const testFiles = await fs.readdir(pTestPath)
  for (let i = 0; i < testFiles.length; i++) {
    const testFile = testFiles[i]
    if (!testFile.endsWith('spec.js') || skipped.has(testFile)) continue
    const ptp = Path.join(pTestPath, testFile)
    console.log(testFile, ptp)
    await createTest(
      ptp,
      Path.join(tempTestPath, testFile.replace('.spec', ''))
    )
  }
  await new Promise((resolve, reject) => {
    cp.exec(
      `node ${Path.join(
        __dirname,
        '..',
        'node_modules',
        '.bin',
        'prettier-standard'
      )} ${tempTestPath}/*.js`,
      error => {
        if (error) {
          return reject(error)
        }
        resolve()
      }
    )
  })
}

doIt().catch(error => {
  console.error(error)
})
