/* eslint indent: "off" */
const path = require('path')
const cp = require('child_process')
const util = require('util')
const fs = require('fs-extra')
const { CRIExtra } = require('../index')

const betterProtocolFile = path.join(__dirname, 'fullProto.json')
const betterProtocolDumpExists = () => fs.pathExists(betterProtocolFile)

async function dumpBetterProtocol () {
  const client = await CRIExtra()
  const betterProtocol = {}
  for (const key of Object.keys(client)) {
    if (key[0] !== '_' && key[0].toUpperCase() === key[0]) {
      betterProtocol[key] = client[key]
    }
  }
  await fs.writeJson(betterProtocolFile, betterProtocol)
  await client.close()
}

const maybeOptional = (propName, propDef) =>
  propDef.optional ? `[${propName}]` : propName

const descriptionOrNothing = propDef =>
  propDef.description
    ? ` - ${propDef.description.replace('\n', ' ')}${
        propDef.experimental ? ' EXPERIMENTAL' : ''
      }`
    : propDef.experimental
    ? ' - EXPERIMENTAL'
    : ''

const jsType = type => {
  switch (type) {
    case 'any':
      return '*'
    case 'integer':
    case 'float':
    case 'double':
    case 'number':
      return 'number'
    default:
      return type
  }
}

const arrayOf = (propDef, typeMapping) =>
  propDef.items.$ref
    ? `Array<${propDef.items.$ref}>`
    : `Array<${jsType(propDef.items.type)}>`

function cdpTypeMapping2 (betterProtocol) {
  const types = new Map()
  for (let Domain in betterProtocol) {
    const dinfo = betterProtocol[Domain]
    const numTypes = dinfo.types.length
    const dts = new Map()
    for (let i = 0; i < numTypes; ++i) {
      const dt = dinfo.types[i]
      dts.set(dt.id, dt)
    }
    types.set(Domain, dts)
  }

  return types
}

function descOrNothing (descript) {
  if (!descript) return ''
  return `\n  * ${descript}`
}

function generateReturnsTypeDef (returns, commandName) {
  const props = []
  for (let i = 0; i < returns.length; i++) {
    const rv = returns[i]
    let type
    if (rv.type) {
      if (rv.type !== 'array') {
        type = jsType(rv.type)
      } else {
        type = arrayOf(rv)
      }
    } else if (rv.$ref) {
      type = `CDP${rv.$ref}`
    }
    let rvn = maybeOptional(rv.name, rv)
    let d = descriptionOrNothing(rv)
    props.push(`* @property {${type}} ${rvn}${d}`)
  }
  const rvtdn = `${commandName}ReturnV`
  const td = `/**
* @typedef {Object} ${rvtdn}
${props.join('\n')}
*/`
  return {
    name: rvtdn,
    typedef: td
  }
}

function see (domain, name, which) {
  return ` * @see https://chromedevtools.github.io/devtools-protocol/tot/${domain}#${which}-${name}`
}

function handleTypeRefArray (what) {
  if (what.type) {
    if (what.type !== 'array') {
      return jsType(what.type)
    } else {
      return arrayOf(what)
    }
  } else if (what.$ref) {
    return `${what.$ref}`
  }
}

function handleReturns ({
  domain,
  fnName,
  commandName,
  argsStr,
  msgStr,
  returns,
  fnDef,
  generatedFN
}) {
  const clientSend = `this._client._interopSend('${domain}.${fnName}', ${msgStr})`
  if (returns) {
    if (returns.length > 1) {
      const fnBody = `${fnName}(${argsStr}) {\n  return ${clientSend}\n}`
      const result = generateReturnsTypeDef(returns, commandName)
      generatedFN.returnTypedef = result.typedef
      fnDef.push(
        `  * @return {Promise<${result.name}>}\n${see(
          domain,
          fnName,
          'method'
        )}\n  */\n`,
        fnBody
      )
    } else {
      const rv = returns[0]
      const fnBody = `async ${fnName}(${argsStr}) {
  const result = await ${clientSend}
  return result.${rv.name}
}`
      fnDef.push(
        `  * @return {Promise<${handleTypeRefArray(rv)}>} - ${rv.description ||
          'Results'}\n${see(domain, fnName, 'method')}\n  */\n`,
        fnBody
      )
    }
  } else {
    const fnBody = `async ${fnName}(${argsStr}) {
  await ${clientSend}
}`
    fnDef.push(` ${see(domain, fnName, 'method')}\n  */\n`, fnBody)
  }

  generatedFN.fn = fnDef.join('')
}

function makeMsgPartStr (param) {
  if (param.optional) return `${param.name}: ${param.name} || undefined`
  return param.name
}

function generateFn (domain, command) {
  const generatedFN = {
    argsTypedef: null,
    returnTypedef: null,
    fn: null
  }
  // console.log(domain, command)
  const params = []
  if (command.parameters) {
    for (const [param, description] of Object.entries(command.parameters)) {
      let type = handleTypeRefArray(description)
      let tname = maybeOptional(param, description)
      let d = descriptionOrNothing(description)
      params.push({
        name: param,
        type,
        tname,
        description: d,
        optional: description.optional || false,
        full: `* @param {${type}} ${tname}${d}\n`
      })
    }
  }
  let fnDef = []
  const commandName = command.name[0].toUpperCase() + command.name.substring(1)
  const tdName = `${commandName}Opts`
  fnDef.push(`/**${descOrNothing(command.description)}\n`)
  if (params.length > 2) {
    generatedFN.argsTypedef = `/**
* @typedef {Object} ${tdName}
${params.map(p => p.full).join('')}
*/`
    fnDef.push(`  * @param {${tdName}} opts - The commands options\n`)
    handleReturns({
      domain,
      command: `${domain}.${commandName}`,
      fnName: command.name,
      commandName,
      argsStr: 'opts',
      msgStr: 'opts',
      fnDef,
      generatedFN,
      returns: command.returns
    })
  } else {
    const genConfig = {
      domain,
      command: `${domain}.${commandName}`,
      fnName: command.name,
      commandName,
      argsStr: '',
      msgStr: '',
      fnDef,
      generatedFN,
      returns: command.returns
    }
    switch (params.length) {
      case 2:
        genConfig.argsStr = `${params[0].name}, ${params[1].name}`
        genConfig.msgStr = `{ ${makeMsgPartStr(params[0])}, ${makeMsgPartStr(
          params[1]
        )} }`
        fnDef.push(`  ${params[0].full}\n${params[1].full}\n`)
        break
      case 1:
        genConfig.argsStr = `${params[0].name}`
        genConfig.msgStr = `{ ${makeMsgPartStr(params[0])} }`
        fnDef.push(`  ${params[0].full}`)
        break
      default:
        genConfig.msgStr = '{}'
        break
    }
    handleReturns(genConfig)
  }
  return generatedFN
}

async function doIt () {
  const dumpDir = path.join(__dirname, '..', 'generated')
  console.log(dumpDir)
  const betterProtocol = await fs.readJson(betterProtocolFile)
  for (const [domain, { types, events, commands }] of Object.entries(
    betterProtocol
  )) {
    const clzFns = []
    const typdefs = []

    for (let i = 0; i < commands.length; i++) {
      const gf = generateFn(domain, commands[i])
      if (gf.returnTypedef) {
        typdefs.push(gf.returnTypedef)
      }

      if (gf.argsTypedef) {
        typdefs.push(gf.argsTypedef)
      }

      clzFns.push(gf.fn)
    }

    const clzz = `/**
* @see https://chromedevtools.github.io/devtools-protocol/tot/${domain}
*/
    class ${domain} {
  /**
   * @param {Chrome|CRIConnection|CDPSession|Object} client
   */
  constructor (client) {
    /**
     * @type {Chrome|CRIConnection|CDPSession|Object}
     * @private
     */
    this._client = client
  }
  
  ${clzFns.join('\n\n')}
  
}

module.exports = ${domain}

${typdefs.join('\n\n')}
`
    await fs.writeFile(path.join(dumpDir, `${domain}.js`), clzz)
  }

  await new Promise((resolve, reject) => {
    cp.exec(
      `node ${path.join(
        __dirname,
        '..',
        'node_modules',
        '.bin',
        'prettier-standard'
      )} ${dumpDir}/*.js`,
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
