const Chrome = require('chrome-remote-interface/lib/chrome')
const CRIConnection = require('./CRIConnection')
const CDPSession = require('./CDPSession')
const { CRIClientPatched } = require('./adaptor')

/**
 * @ignore
 */
class AdaptorHelper {
  static createProtocolError (error, method, object) {
    const extra = 'data' in object.error ? ` ${object.error.data}` : ''
    const message = `Protocol error (${method}): ${
      object.error.message
    }${extra}`
    return AdaptorHelper.rewriteError(error, message)
  }

  static rewriteError (error, message) {
    error.message = message
    return error
  }

  static addCommandToSession (session, domainName, commandName, fullCommand) {
    session[domainName][commandName] = params => {
      return session.send(fullCommand, params)
    }
  }

  static addCommandsToSession (session, domainName, commands) {
    const numCommands = commands.length
    let commandName
    let i = 0
    for (; i < numCommands; i++) {
      commandName = commands[i].name
      AdaptorHelper.addCommandToSession(
        session,
        domainName,
        commandName,
        `${domainName}.${commandName}`
      )
    }
  }

  static addEventToSession (session, domainName, eventName, fullEventName) {
    session[domainName][eventName] = handler => {
      if (typeof handler === 'function') {
        session.on(fullEventName, handler)
        return () => session.removeListener(fullEventName, handler)
      } else {
        return new Promise((resolve, reject) => {
          session.once(fullEventName, resolve)
        })
      }
    }
  }

  static addEventsToSession (session, domainName, events) {
    const numEvents = events.length
    let eventName
    let i = 0
    for (; i < numEvents; i++) {
      eventName = events[i].name
      AdaptorHelper.addEventToSession(
        session,
        domainName,
        eventName,
        `${domainName}.${eventName}`
      )
    }
  }

  static putCRIApiOnSession (session, protocol) {
    session.protocol = protocol
    if (protocol.domains) {
      const domains = protocol.domains
      const numDomains = domains.length
      let i = 0
      let domain
      let domainName
      for (; i < numDomains; i++) {
        domain = domains[i]
        domainName = domains[i].domain
        session[domainName] = {}
        if (domain.commands) {
          AdaptorHelper.addCommandsToSession(
            session,
            domainName,
            domain.commands
          )
        }
        if (domain.events) {
          AdaptorHelper.addEventsToSession(session, domainName, domain.events)
        }
      }
    }
  }
}

/**
 * @ignore
 * @param connection
 */
function raiseErrorOnBadCDPSessionConnection (connection) {
  if (connection instanceof CRIConnection) return
  if (connection instanceof CDPSession) return
  if (connection instanceof Chrome && !connection[CRIClientPatched]) {
    throw new Error(
      'A CDPSession was created using a chrome-remote-interface client object that was not patched'
    )
  }
}

module.exports = { raiseErrorOnBadCDPSessionConnection, AdaptorHelper }
