const util = require('util')

class AXNode {
  /**
   * @param {Array<Object>} payloads
   * @return {!AXNode}
   */
  static createTree (payloads) {
    /** @type {!Map<string, !AXNode>} */
    const nodeById = new Map()
    for (const payload of payloads) {
      nodeById.set(payload.nodeId, new AXNode(payload))
    }
    for (const node of nodeById.values()) {
      for (const childId of node._payload.childIds || []) {
        node._children.push(nodeById.get(childId))
      }
    }
    return nodeById.values().next().value
  }

  /**
   * @param {!Object} payload
   */
  constructor (payload) {
    this._payload = payload

    /** @type {Array<AXNode>} */
    this._children = []

    this._richlyEditable = false
    this._editable = false
    this._focusable = false
    this._expanded = false
    this._name = this._payload.name ? this._payload.name.value : ''
    this._role = this._payload.role ? this._payload.role.value : 'Unknown'

    for (const property of this._payload.properties || []) {
      if (property.name === 'editable') {
        this._richlyEditable = property.value.value === 'richtext'
        this._editable = true
      }
      if (property.name === 'focusable') this._focusable = property.value.value
      if (property.name === 'expanded') this._expanded = property.value.value
    }
  }

  /**
   * @return {boolean}
   */
  isLeafNode () {
    if (!this._children.length) return true

    // These types of objects may have children that we use as internal
    // implementation details, but we want to expose them as leaves to platform
    // accessibility APIs because screen readers might be confused if they find
    // any children.
    if (this._isPlainTextField() || this._isTextOnlyObject()) return true

    // Roles whose children are only presentational according to the ARIA and
    // HTML5 Specs should be hidden from screen readers.
    // (Note that whilst ARIA buttons can have only presentational children, HTML5
    // buttons are allowed to have content.)
    switch (this._role) {
      case 'doc-cover':
      case 'graphics-symbol':
      case 'img':
      case 'Meter':
      case 'scrollbar':
      case 'slider':
      case 'separator':
      case 'progressbar':
        return true
      default:
        break
    }

    // Here and below: Android heuristics
    if (this._hasFocusableChild()) {
      return false
    }
    if (this._focusable && this._name) {
      return true
    }
    if (this._role === 'heading' && this._name) {
      return true
    }
    return false
  }

  /**
   * @return {boolean}
   */
  isControl () {
    switch (this._role) {
      case 'button':
      case 'checkbox':
      case 'ColorWell':
      case 'combobox':
      case 'DisclosureTriangle':
      case 'listbox':
      case 'menu':
      case 'menubar':
      case 'menuitem':
      case 'menuitemcheckbox':
      case 'menuitemradio':
      case 'radio':
      case 'scrollbar':
      case 'searchbox':
      case 'slider':
      case 'spinbutton':
      case 'switch':
      case 'tab':
      case 'textbox':
      case 'tree':
        return true
      default:
        return false
    }
  }

  /**
   * @param {boolean} insideControl
   * @return {boolean}
   */
  isInteresting (insideControl) {
    const role = this._role
    if (role === 'Ignored') return false

    if (this._focusable || this._richlyEditable) return true

    // If it's not focusable but has a control role, then it's interesting.
    if (this.isControl()) return true

    // A non focusable child of a control is not interesting
    if (insideControl) return false

    return this.isLeafNode() && !!this._name
  }

  /**
   * @return {!SerializedAXNode}
   */
  serialize () {
    /** @type {!Map<string, number|string|boolean>} */
    const properties = new Map()
    for (const property of this._payload.properties || []) {
      properties.set(property.name.toLowerCase(), property.value.value)
    }
    if (this._payload.name) properties.set('name', this._payload.name.value)
    if (this._payload.value) properties.set('value', this._payload.value.value)
    if (this._payload.description) {
      properties.set('description', this._payload.description.value)
    }

    /** @type {SerializedAXNode} */
    const node = { role: this._role }

    /** @type {Array<string>} */
    const userStringProperties = [
      'name',
      'value',
      'description',
      'keyshortcuts',
      'roledescription',
      'valuetext'
    ]

    for (const userStringProperty of userStringProperties) {
      if (!properties.has(userStringProperty)) continue
      node[userStringProperty] = properties.get(userStringProperty)
    }

    /** @type {Array<string>} */
    const booleanProperties = [
      'disabled',
      'expanded',
      'focused',
      'modal',
      'multiline',
      'multiselectable',
      'readonly',
      'required',
      'selected'
    ]

    for (const booleanProperty of booleanProperties) {
      // WebArea's treat focus differently than other nodes. They report whether their frame  has focus,
      // not whether focus is specifically on the root node.
      if (booleanProperty === 'focused' && this._role === 'WebArea') continue
      const value = properties.get(booleanProperty)
      if (!value) continue
      node[booleanProperty] = value
    }

    /** @type {Array<string>} */
    const tristateProperties = ['checked', 'pressed']
    for (const tristateProperty of tristateProperties) {
      if (!properties.has(tristateProperty)) continue
      const value = properties.get(tristateProperty)
      node[tristateProperty] = value === 'mixed' ? 'mixed' : value === 'true'
    }

    /** @type {Array<string>} */
    const numericalProperties = ['level', 'valuemax', 'valuemin']
    for (const numericalProperty of numericalProperties) {
      if (!properties.has(numericalProperty)) continue
      node[numericalProperty] = properties.get(numericalProperty)
    }

    /** @type {Array<string>} */
    const tokenProperties = [
      'autocomplete',
      'haspopup',
      'invalid',
      'orientation'
    ]
    for (const tokenProperty of tokenProperties) {
      const value = properties.get(tokenProperty)
      if (!value || value === 'false') continue
      node[tokenProperty] = value
    }
    return node
  }

  /**
   * @return {boolean}
   */
  _isPlainTextField () {
    if (this._richlyEditable) return false
    if (this._editable) return true
    return (
      this._role === 'textbox' ||
      this._role === 'ComboBox' ||
      this._role === 'searchbox'
    )
  }

  /**
   * @return {boolean}
   */
  _isTextOnlyObject () {
    const role = this._role
    return role === 'LineBreak' || role === 'text' || role === 'InlineTextBox'
  }

  /**
   * @return {boolean}
   */
  _hasFocusableChild () {
    if (this._cachedHasFocusableChild === undefined) {
      this._cachedHasFocusableChild = false
      for (const child of this._children) {
        if (child._focusable || child._hasFocusableChild()) {
          this._cachedHasFocusableChild = true
          break
        }
      }
    }
    return this._cachedHasFocusableChild
  }

  toJSON () {
    return this._payload
  }

  /** @ignore */
  // eslint-disable-next-line space-before-function-paren
  [util.inspect.custom](depth, options) {
    if (depth < 0) {
      return options.stylize('[AXNode]', 'special')
    }

    const newOptions = Object.assign({}, options, {
      depth: options.depth === null ? null : options.depth - 1
    })
    const inner = util.inspect(
      {
        richlyEditable: this._richlyEditable,
        editable: this._editable,
        focusable: this._focusable,
        expanded: this._expanded,
        name: this._name,
        role: this._role,
        cachedHasFocusableChild: this._cachedHasFocusableChild,
        children: this._children
      },
      newOptions
    )
    return `${options.stylize('AXNode', 'special')} ${inner}`
  }
}

/**
 * @type {AXNode}
 */
module.exports = AXNode
