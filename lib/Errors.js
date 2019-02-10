class CustomError extends Error {
  constructor (message) {
    super(message)
    this.name = this.constructor.name
    Error.captureStackTrace(this, this.constructor)
  }
}

class TimeoutError extends CustomError {}

module.exports = {
  TimeoutError,
  CustomError
}
