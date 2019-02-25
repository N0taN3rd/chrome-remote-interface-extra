class CustomError extends Error {
  constructor (message) {
    super(message)
    this.name = this.constructor.name
    Error.captureStackTrace(this, this.constructor)
  }
}

/**
 * @type {TimeoutError}
 */
exports.TimeoutError = class TimeoutError extends CustomError {}
