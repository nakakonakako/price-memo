type ResumeListener = (generation: number) => void

let resumeGeneration = 0
const listeners = new Set<ResumeListener>()

let burstTimer: ReturnType<typeof setTimeout> | null = null
let pendingWhileDispatch = false
let dispatchInProgress = false

let wasDocumentHidden = typeof document !== 'undefined'
  ? document.visibilityState === 'hidden'
  : false
let listenersInstalled = false
let suppressInitialPageShow = false

function dispatchResume() {
  dispatchInProgress = true
  resumeGeneration += 1
  const generation = resumeGeneration
  for (const listener of listeners) {
    listener(generation)
  }
  dispatchInProgress = false
  if (pendingWhileDispatch) {
    pendingWhileDispatch = false
    scheduleResumeDispatch()
  }
}

function scheduleResumeDispatch() {
  if (dispatchInProgress) {
    pendingWhileDispatch = true
    return
  }
  if (burstTimer != null) return
  burstTimer = setTimeout(() => {
    burstTimer = null
    dispatchResume()
  }, 0)
}

function shouldAcceptFocusResume(): boolean {
  return typeof document === 'undefined' || document.visibilityState === 'visible'
}

function onVisibilityChange() {
  if (typeof document === 'undefined') return
  const visible = document.visibilityState === 'visible'
  if (visible && wasDocumentHidden) {
    scheduleResumeDispatch()
  }
  wasDocumentHidden = !visible
}

function onWindowFocus() {
  if (!shouldAcceptFocusResume()) return
  scheduleResumeDispatch()
}

function onPageShow(event: PageTransitionEvent) {
  if (event.persisted) {
    scheduleResumeDispatch()
    return
  }
  if (suppressInitialPageShow) return
  if (shouldAcceptFocusResume() && wasDocumentHidden) {
    scheduleResumeDispatch()
  }
}

/** Monotonic counter; each coalesced resume burst increments once. */
export function getResumeSyncGeneration(): number {
  return resumeGeneration
}

/** Subscribe to external resume refetch requests (not catalog revision bumps). */
export function subscribeResumeSync(listener: ResumeListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Attach window/document resume listeners for the authenticated app shell. */
export function installResumeSyncListeners(): () => void {
  if (listenersInstalled || typeof window === 'undefined') {
    return () => {}
  }
  listenersInstalled = true
  wasDocumentHidden = document.visibilityState === 'hidden'
  suppressInitialPageShow = true
  requestAnimationFrame(() => {
    suppressInitialPageShow = false
  })

  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('focus', onWindowFocus)
  window.addEventListener('pageshow', onPageShow)

  return () => {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('focus', onWindowFocus)
    window.removeEventListener('pageshow', onPageShow)
    listenersInstalled = false
    if (burstTimer != null) {
      clearTimeout(burstTimer)
      burstTimer = null
    }
    pendingWhileDispatch = false
    dispatchInProgress = false
  }
}

/** @internal test helper */
export function resetResumeSyncForTests(): void {
  resumeGeneration = 0
  pendingWhileDispatch = false
  dispatchInProgress = false
  if (burstTimer != null) {
    clearTimeout(burstTimer)
    burstTimer = null
  }
  listeners.clear()
  wasDocumentHidden = false
  listenersInstalled = false
  suppressInitialPageShow = false
}

/** @internal test helper — simulate a coalesced resume burst without DOM. */
export function triggerResumeSyncForTests(): void {
  scheduleResumeDispatch()
}
