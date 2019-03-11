/**
 * @typedef {Object} CDPNavigationEntry - Navigation history entry.
 * @property {number} id - Unique id of the navigation history entry.
 * @property {string} url - URL of the navigation history entry.
 * @property {string} userTypedURL - URL that the user typed in the url bar.
 * @property {string} title - Title of the navigation history entry.
 * @property {string} transitionType - Transition type - values: ink, typed, address_bar, auto_bookmark, auto_subframe, manual_subframe, generated, auto_toplevel, form_submit, reload, keyword, keyword_generated, other
 */

/**
 * @typedef {Object} PDFOptions
 * @property {number} scale
 * @property {boolean} displayHeaderFooter
 * @property {string} headerTemplate
 * @property {string} footerTemplate
 * @property {boolean} printBackground
 * @property {boolean} landscape
 * @property {string} pageRanges
 * @property {string} format
 * @property {string|number} width
 * @property {string|number} height
 * @property {boolean} [preferCSSPageSize]
 * @property {!{top?: string|number, bottom?: string|number, left?: string|number, right?: string|number}} [margin]
 * @property {string} [path]
 */

/**
 * @typedef {Object} Metrics
 * @property {number} Timestamp
 * @property {number} Documents
 * @property {number} Frames
 * @property {number} JSEventListeners
 * @property {number} Nodes
 * @property {number} LayoutCount
 * @property {number} RecalcStyleCount
 * @property {number} LayoutDuration
 * @property {number} RecalcStyleDuration
 * @property {number} ScriptDuration
 * @property {number} TaskDuration
 * @property {number} JSHeapUsedSize
 * @property {number} JSHeapTotalSize
 */

/**
 * @typedef {Object} ScreenshotOptions
 * @property {string} type
 * @property {string} path
 * @property {boolean} fullPage
 * @property {{x: number, y: number, width: number, height: number}} clip
 * @property {number} quality
 * @property {boolean} omitBackground
 * @property {string} encoding
 */

/**
 * @typedef {Object} SerializedAXNode
 * @property {string} role
 *
 * @property {string} name
 * @property {string|number} value
 * @property {string} description
 *
 * @property {string} keyshortcuts
 * @property {string} roledescription
 * @property {string} valuetext
 *
 * @property {boolean} disabled
 * @property {boolean} expanded
 * @property {boolean} focused
 * @property {boolean} modal
 * @property {boolean} multiline
 * @property {boolean} multiselectable
 * @property {boolean} readonly
 * @property {boolean} required
 * @property {boolean} selected
 *
 * @property {boolean|"mixed"} checked
 * @property {boolean|"mixed"} pressed
 *
 * @property {number} level
 * @property {number} valuemin
 * @property {number} valuemax
 *
 * @property {string} autocomplete
 * @property {string} haspopup
 * @property {string} invalid
 * @property {string} orientation
 *
 * @property {Array<SerializedAXNode>} children
 */

/**
 * @typedef {Object} CDPAnimation - Animation instance.
 * @property {string} id - `Animation`'s id.
 * @property {string} name - `Animation`'s name.
 * @property {boolean} pausedState - `Animation`'s internal paused state.
 * @property {string} playState - `Animation`'s play state.
 * @property {number} playbackRate - `Animation`'s playback rate.
 * @property {number} startTime - `Animation`'s start time.
 * @property {number} currentTime - `Animation`'s current time.
 * @property {string} type - Animation type of `Animation`. Values: CSSTransition, CSSAnimation, WebAnimation
 * @property {CDPAnimationEffect} [source] - `Animation`'s source animation node.
 * @property {string} [cssId] - A unique ID for `Animation` representing the sources that triggered this CSS animation/transition.
 */

/**
 * @typedef {Object} CDPAnimationEffect - AnimationEffect instance
 * @property {number} delay - `AnimationEffect`'s delay.
 * @property {number} endDelay - `AnimationEffect`'s end delay.
 * @property {number} iterationStart - `AnimationEffect`'s iteration start.
 * @property {number} iterations - `AnimationEffect`'s iterations.
 * @property {number} duration - `AnimationEffect`'s iteration duration.
 * @property {string} direction - `AnimationEffect`'s playback direction.
 * @property {string} fill - `AnimationEffect`'s fill mode.
 * @property {string} [backendNodeId] - `AnimationEffect`'s target node.
 * @property {CDPKeyframesRule} [keyframesRule] - `AnimationEffect`'s keyframes.
 * @property {string} easing - `AnimationEffect`'s timing function.
 */

/**
 * @typedef {Object} CDPKeyframesRule - Keyframes Rule
 * @property {string} [name] - CSS keyframed animation's name.
 * @property {Array<CDPKeyframeStyle>} keyframes - List of animation keyframes.
 */

/**
 * @typedef {Object} CDPKeyframeStyle - Keyframe Style
 * @property {string} offset - Keyframe's time offset.
 * @property {string} easing - `AnimationEffect`'s timing function.
 */

/**
 * @typedef {Object} BrowserHistogramQuery
 * @property {string} [query]
 * @property {boolean} [delta]
 */

/**
 * @typedef {Object} WindowBounds - Browser window bounds information EXPERIMENTAL
 * @property {number} [left] - The offset from the left edge of the screen to the window in pixels.
 * @property {number} [top] - The offset from the top edge of the screen to the window in pixels.
 * @property {number} [width] - The window width in pixels.
 * @property {number} [height] - The window height in pixels.
 * @property {string} [windowState] - The window state. Default to normal. Values: normal, minimized, maximized, fullscreen
 */

/**
 * @typedef {Object} CoverageEntry
 * @property {string} url
 * @property {string} text
 * @property {Array<{start: number, end: number}>} ranges
 */

/**
 * @typedef {Object} CDPDatabase - Database object.
 * @property {DatabaseId} id - Database ID.
 * @property {string} domain - Database domain.
 * @property {string} name - Database name.
 * @property {string} version - Database version.
 */

/**
 * @typedef {Object} SQLQueryResults
 * @property {Array<string>} [columnNames]
 * @property {Array<string>} [values]
 * @property {{message: string, code: number}} [sqlError]
 */

/**
 * @typedef {Object} CDPFrameResource - Information about the Resource on the page. EXPERIMENTAL
 * @property {string} url - Resource URL.
 * @property {ResourceType} type - Type of this resource as it was perceived by the rendering engine. Values: Document, Stylesheet, Image, Media, Font, Script, TextTrack, XHR, Fetch, EventSource, WebSocket, Manifest, SignedExchange, Ping, CSPViolationReport, Other
 * @property {string} mimeType - Resource mimeType as determined by the browser.
 * @property {number} [lastModified] - last-modified timestamp as reported by server.
 * @property {number} [contentSize] - Resource content size.
 * @property {boolean} [failed] - True if the resource failed to load.
 * @property {boolean} [canceled] - True if the resource was canceled during loading.
 */

/**
 * @typedef {Object} CDPFrameResourceTree - Information about the Frame hierarchy along with their cached resources. EXPERIMENTAL
 * @property {Object} frame - Frame information for this tree item.
 * @property {Array<CDPFrameResourceTree>} [childFrames] - Child frames.
 * @property {Array<CDPFrameResource>} resources - Information about frame resources.
 */

/**
 * @typedef {Object} CDPSecurityDetails - Security details about a request.
 * @property {string} protocol - Protocol name (e.g. "TLS 1.2" or "QUIC").
 * @property {string} keyExchange - Key Exchange used by the connection, or the empty string if not applicable.
 * @property {string} [keyExchangeGroup] - (EC)DH group used by the connection, if applicable.
 * @property {string} cipher - Cipher name.
 * @property {string} [mac] - TLS MAC. Note that AEAD ciphers do not have separate MACs.
 * @property {string} certificateId - Certificate ID value.
 * @property {string} subjectName - Certificate subject name.
 * @property {Array<string>} sanList - Subject Alternative Name (SAN) DNS names and IP addresses.
 * @property {string} issuer - Name of the issuing CA.
 * @property {number} validFrom - Certificate valid from date.
 * @property {number} validTo - Certificate valid to (expiration) date
 * @property {Array<CDPSignedCertificateTimestamp>} signedCertificateTimestampList - List of signed certificate timestamps (SCTs).
 * @property {string} certificateTransparencyCompliance - Whether the request complied with Certificate Transparency policy. Values: unknown, not-compliant, compliant
 */

/**
 * @typedef {Object} CDPSignedCertificateTimestamp - Details of a signed certificate timestamp (SCT).
 * @property {string} status - Validation status.
 * @property {string} origin - Origin.
 * @property {string} logDescription - Log name / description.
 * @property {string} logId - Log ID.
 * @property {string} timestamp - Issuance date.
 * @property {string} hashAlgorithm - Hash algorithm.
 * @property {string} signatureAlgorithm - Signature algorithm.
 * @property {string} signatureData - Signature data.
 */

/**
 * @typedef {Object} CDPServiceWorkerRegistration - ServiceWorker registration.
 * @property {string} registrationId
 * @property {string} scopeURL
 * @property {boolean} isDeleted
 */

/**
 * @typedef {Object} CDPServiceWorkerVersion - ServiceWorker version.
 * @property {string} versionId
 * @property {string} registrationId
 * @property {string} scriptURL
 * @property {string} runningStatus - values: stopped, starting, running, stopping
 * @property {string} status - values: new, installing, installed, activating, activated, redundant
 * @property {number} [scriptLastModified] - The Last-Modified header value of the main script.
 * @property {number} [scriptResponseTime] - The time at which the response headers of the main script were received from the server. For cached script it is the last time the cache entry was validated.
 * @property {Array<string>} [controlledClients]
 * @property {string} [targetId]
 */

/**
 * @typedef {Object} CDPServiceWorkerErrorMessage - ServiceWorker error message.
 * @property {string} errorMessage
 * @property {string} registrationId
 * @property {string} versionId
 * @property {string} sourceURL
 * @property {number} lineNumber
 * @property {number} columnNumber
 */

/**
 * @typedef {Object} ServiceWorkerInfo
 * @property {string} versionId
 * @property {string} registrationId
 * @property {string} scopeURL
 * @property {boolean} isDeleted
 * @property {string} runningStatus - stopped, starting, running, stopping
 * @property {string} status - new, installing, installed, activating, activated, redundant
 * @property {number} [scriptLastModified] - The Last-Modified header value of the main script.
 * @property {number} [scriptResponseTime] - The time at which the response headers of the main script were received from the server. For cached script it is the last time the cache entry was validated.
 * @property {Array<string>} [controlledClients]
 * @property {string} [targetId]
 */

/**
 * @typedef {Object} CDPTargetInfo
 * @property {string} targetId
 * @property {string} type
 * @property {string} title
 * @property {string} url
 * @property {boolean} attached - Whether the target has an attached client.
 * @property {string} [openerId] - Opener target Id
 * @property {string} [browserContextId] - EXPERIMENTAL
 */

/**
 * @typedef {Object} CDPBucket - Chrome histogram bucket. EXPERIMENTAL
 * @property {number} low - Minimum value (inclusive).
 * @property {number} high - Maximum value (exclusive).
 * @property {number} count - Number of samples.
 */

/**
 * @typedef {Object} CDPHistogram - Chrome histogram. EXPERIMENTAL
 * @property {string} name - Name.
 * @property {number} sum - Sum of sample values.
 * @property {number} count - Total number of samples.
 * @property {Array<CDPBucket>} buckets - Buckets.
 */
