/* eslint indent: "off" */
const path = require('path')
const util = require('util')
const fs = require('fs-extra')
const { CRIExtra } = require('../index')
const handleTypes = require('./handleCDPTypes')

const betterProtocolFile = path.join(__dirname, 'betterProtocol.json')
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

async function loadProtocol () {
  if (!(await betterProtocolDumpExists())) {
    await dumpBetterProtocol()
  }
  const betterProtocol = await fs.readJson(
    '/home/john/WebstormProjects/chrome-remote-interface-extra/scripts/fullProto.json'
  )
  return betterProtocol.domains
}

async function doIt () {
  const domains = await loadProtocol()
  let typeDefs = []
  for (let i = 0; i < domains.length; i++) {
    const domainObj = domains[i]
    const domain = domainObj.domain
    typeDefs = typeDefs.concat(handleTypes(domain, domainObj.types))
  }
  typeDefs.push('\n\n')
  await fs.writeFile('typedefs.js', typeDefs.join('\n'), 'utf-8')
}

doIt().catch(error => {
  console.error(error)
})
