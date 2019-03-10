/* eslint indent: "off" */
const path = require('path')
const util = require('util')
const fs = require('fs-extra')
const { CRIExtra } = require('../index')

const betterProtocolFile = path.join(__dirname, '..', 'betterProtocol.json')
const betterProtocolDumpExists = () => fs.pathExists(betterProtocolFile)

function inspect (object) {
  console.log(
    util.inspect(object, { depth: null, colors: true, compact: false })
  )
}

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

const stringOrEnum = (propName, propDef) =>
  propDef.enum
    ? ` * @property {string} ${maybeOptional(
        propName,
        propDef
      )}${descriptionOrNothing(propDef)} Values: ${propDef.enum.join(', ')}`
    : ` * @property {string} ${maybeOptional(
        propName,
        propDef
      )}${descriptionOrNothing(propDef)}`

/**
 *
 * @param {Object} definition
 * @param {Map<string, string>} typeMapping
 */
function objectTypeDef (definition, typeMapping) {
  const name = `* @typedef {Object} ${definition.id}${descriptionOrNothing(definition)}`
  if (!definition.properties) {
    return `/**
 ${name}
*/`
  }
  const properties = []
  for (const [propName, propDef] of Object.entries(definition.properties)) {
    if (propDef.$ref) {
      properties.push(
        ` * @property {${propDef.$ref}} ${maybeOptional(
          propName,
          propDef
        )}${descriptionOrNothing(propDef)}`
      )
    } else {
      switch (propDef.type) {
        case 'array':
          properties.push(
            ` * @property {${arrayOf(propDef, typeMapping)}} ${maybeOptional(
              propName,
              propDef
            )}${descriptionOrNothing(propDef)}`
          )
          break
        case 'string':
          properties.push(stringOrEnum(propName, propDef))
          break
        case 'integer':
        case 'float':
        case 'double':
        case 'number':
          properties.push(
            ` * @property {number} ${maybeOptional(
              propName,
              propDef
            )}${descriptionOrNothing(propDef)}`
          )
          break
        default:
          properties.push(
            ` * @property {${jsType(propDef.type)}} ${maybeOptional(
              propName,
              propDef
            )}${descriptionOrNothing(propDef)}`
          )
          break
      }
    }
  }

  return `/**
 ${name}
${properties.join('\n')}
 */`
}

/**
 *
 * @param {Object} definition
 * @param {Map<string, string>} typeMapping
 */
function stringTypeDef (definition, typeMapping) {
  const rest = definition.enum
    ? `${descriptionOrNothing(definition)} Values: ${definition.enum.join(
        ', '
      )}`
    : descriptionOrNothing(definition)
  return `/**
 * @typedef {string} ${definition.id}${rest}
*/`
}

/**
 *
 * @param {Object} definition
 * @param {Map<string, string>} typeMapping
 */
const numberTypeDef = (definition, typeMapping) => `/**
 * @typedef {number} ${definition.id}${descriptionOrNothing(
  definition
)}
*/`

/**
 *
 * @param {Object} definition
 * @param {Map<string, string>} typeMapping
 */
const arrayTypeDef = (definition, typeMapping) => `/**
 * @typedef {${arrayOf(definition, typeMapping)}} ${definition.id}
*/`

/**
 *
 * @param {Object} betterProtocol
 * @return {Map<string, string>}
 */
function cdpTypeMapping (betterProtocol) {
  const types = new Map()
  for (const [domain, domainTypes] of Object.entries(betterProtocol)) {
    for (const definition of Object.values(domainTypes)) {
      const cdpType = `CDPType.${domain}.${definition.id}`
      if (types.has(definition.id)) {
        console.log('duplicate id', domain, definition.id)
        console.log(types.get(definition.id))
      }
      types.set(definition.id, cdpType)
      types.set(`${domain}.${definition.id}`, cdpType)
    }
  }
  return types
}

async function doIt () {
  if (!(await betterProtocolDumpExists())) {
    await dumpBetterProtocol()
  }
  const betterProtocol = await fs.readJson(betterProtocolFile)
  const typeMapping = cdpTypeMapping(betterProtocol)
  const typeDefs = []
  for (const domainTypes of Object.values(betterProtocol)) {
    for (const definition of Object.values(domainTypes)) {
      switch (definition.type) {
        case 'object':
          typeDefs.push(objectTypeDef(definition, typeMapping))
          break
        case 'string':
          typeDefs.push(stringTypeDef(definition, typeMapping))
          break
        case 'integer':
        case 'float':
        case 'double':
        case 'number':
          typeDefs.push(numberTypeDef(definition, typeMapping))
          break
        case 'array':
          typeDefs.push(arrayTypeDef(definition, typeMapping))
          break
        default:
          inspect(definition)
          break
      }
    }
  }
  typeDefs.push('\n')
  await fs.writeFile('typedefs.js', typeDefs.join('\n\n'), 'utf-8')
}

doIt().catch(error => {
  console.error(error)
})
