const { Readable } = require('stream')

module.exports = class SlowStream extends Readable {
  constructor ({ contents, delay, readableOpts }) {
    super(readableOpts)
    this._delay = delay
    this._idx = 0
    this._iterable = false
    this._contents = null
    this.__init(contents)
  }

  __init (contents) {
    try {
      this._contents = contents[Symbol.iterator]()
      this._iterable = true
    } catch (e) {
      this._contents = contents
      this._iterable = false
    }
  }

  _read (size) {
    if (this._iterable) {
      setTimeout(() => {
        const next = this._contents.next()
        this.push(next.done ? null : next.value)
      }, this._delay)
      return
    }
    if (this._idx >= this._contents.length) {
      this.push(null)
    } else {
      setTimeout(() => {
        this.push(this._contents[this._idx++])
      }, this._delay)
    }
  }
}
