/* eslint indent: "off" */
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

const ensureScopedRef = (ref, domain) => {
  if (ref.includes('-')) return ref
  return ref.indexOf('.') === -1 ? `${domain}-${ref}` : ref.replace('.', '-')
}

const arrayOf = (propDef, domain) =>
  propDef.items.$ref
    ? `Array<${ensureScopedRef(propDef.items.$ref, domain)}>`
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
 */
function objectTypeDef (definition) {
  const name = `* @typedef {Object} ${definition.domain}-${
    definition.id
  }${descriptionOrNothing(definition)}`
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
            ` * @property {${arrayOf(
              propDef,
              definition.domain
            )}} ${maybeOptional(propName, propDef)}${descriptionOrNothing(
              propDef
            )}`
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
 */
function stringTypeDef (definition) {
  const rest = definition.enum
    ? `${descriptionOrNothing(definition)} Values: ${definition.enum.join(
        ', '
      )}`
    : descriptionOrNothing(definition)
  return `/**
 * @typedef {string} ${definition.domain}-${definition.id}${rest}
*/`
}

/**
 *
 * @param {Object} definition
 */
const numberTypeDef = definition => `/**
 * @typedef {number} ${definition.domain}-${
  definition.id
}${descriptionOrNothing(definition)}
*/`

/**
 *
 * @param {Object} definition
 */
const arrayTypeDef = definition => `/**
 * @typedef {${arrayOf(definition, definition.domain)}} ${definition.domain}-${
  definition.id
}
*/`

function ensureRefIfExists (domain, obj) {
  if (obj.$ref) {
    if (obj.$ref.indexOf('.') === -1) {
      obj.$ref = `${domain}-${obj.$ref}`
    } else {
      obj.$ref = obj.$ref.replace('.', '-')
    }
  }
}

function removeProp (obj, prop) {
  delete obj[prop]
}

function touchUpObjType (domain, typeObj) {
  if (typeObj.properties) {
    const propDict = {}
    for (let i = 0; i < typeObj.properties.length; i++) {
      const prop = typeObj.properties[i]
      ensureRefIfExists(domain, prop)
      const name = prop.name
      removeProp(prop, 'name')
      propDict[name] = prop
    }
    return Object.assign({}, typeObj, { domain, properties: propDict })
  }
  return Object.assign({ domain }, typeObj)
}

const putDomainOnObj = (domain, obj) => Object.assign({ domain }, obj)

module.exports = function handleTypes (domain, types) {
  const typeDefs = []
  if (types) {
    for (let i = 0; i < types.length; i++) {
      const dt = types[i]
      if (dt.type === 'object') {
        const t = touchUpObjType(domain, dt)
        typeDefs.push(objectTypeDef(t))
        typeDefs.push('\n')
        continue
      }
      switch (dt.type) {
        case 'string':
          typeDefs.push(stringTypeDef(putDomainOnObj(domain, dt)))
          break
        case 'integer':
        case 'float':
        case 'double':
        case 'number':
          typeDefs.push(numberTypeDef(putDomainOnObj(domain, dt)))
          break
        case 'array':
          ensureRefIfExists(dt.domain, dt.items)
          typeDefs.push(arrayTypeDef(putDomainOnObj(domain, dt)))
          break
        default:
          break
      }
      typeDefs.push('\n')
    }
  }
  return typeDefs
}
