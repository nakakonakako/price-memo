import type { MemoReorderGesturePhase } from './MemoMobileReorderContext'

declare const __MEMO_REORDER_DIAG_GIT_SHA__: string

/** Important gesture / lifecycle events (not high-frequency moves). */
export const MEMO_REORDER_DIAG_RING_MAX = 48
/** Short-lived raw / handler samples for correlation. */
export const MEMO_REORDER_DIAG_RAW_SAMPLE_MAX = 10

export type MemoReorderDiagTimerState = 'idle' | 'pending'

export type MemoReorderDiagRuntimeSnapshot = {
  gesturePhase: MemoReorderGesturePhase
  dragging: boolean
  activeId: string | null
  timerState: MemoReorderDiagTimerState
  trackedTouchId: number | null
  documentTouchListening: boolean
  windowCaptureMounted: boolean
  cardTouchListeners: number
  scrollBaseX: number | null
  scrollBaseY: number | null
  scrollX: number
  scrollY: number
}

export type MemoReorderDiagRawCounters = {
  windowTouchstart: number
  windowTouchmove: number
  windowTouchend: number
  windowTouchcancel: number
  windowPointermove: number
  windowPointerup: number
  windowPointercancel: number
  docTouchmove: number
  docTouchend: number
  docTouchcancel: number
}

export type MemoReorderDiagRingEntry = {
  seq: number
  tMs: number
  kind: string
  reason: string
  dx: number
  dy: number
  dist: number
  cancelable: boolean | null
  defaultPrevented: boolean | null
  gesturePhase: MemoReorderGesturePhase
  dragging: boolean
  activeId: string | null
  detail: string | null
}

export type MemoReorderDiagRawSample = {
  seq: number
  tMs: number
  source: 'window' | 'docEntry'
  kind: string
  detail: string
}

function changedTouchIdList(
  e: Pick<TouchEvent, 'changedTouches'>,
): string {
  const ids = Array.from(e.changedTouches).map((t) => t.identifier)
  return ids.length > 0 ? ids.join(',') : '-'
}

type DiagListener = () => void

let queryResolved = false
let queryEnabled = false

export function resetMemoReorderDiagQueryCacheForTests(): void {
  queryResolved = false
  queryEnabled = false
  resetMemoReorderDiagStateForTests()
}

function resetMemoReorderDiagStateForTests(): void {
  ring.length = 0
  rawSamples.length = 0
  ringSeq = 0
  rawSampleSeq = 0
  sessionOriginMs = 0
  runtimeSnapshot = defaultRuntimeSnapshot()
  Object.assign(rawCounters, emptyRawCounters())
  listeners.clear()
}

export function isMemoReorderDiagEnabled(): boolean {
  if (!import.meta.env.DEV) return false
  if (typeof window === 'undefined') return false
  if (!queryResolved) {
    queryResolved = true
    queryEnabled =
      new URLSearchParams(window.location.search).get('memoReorderDiag') === '1'
  }
  return queryEnabled
}

export function getMemoReorderDiagGitSha(): string {
  if (typeof __MEMO_REORDER_DIAG_GIT_SHA__ === 'string') {
    return __MEMO_REORDER_DIAG_GIT_SHA__
  }
  return 'unknown'
}

function defaultRuntimeSnapshot(): MemoReorderDiagRuntimeSnapshot {
  return {
    gesturePhase: 'idle',
    dragging: false,
    activeId: null,
    timerState: 'idle',
    trackedTouchId: null,
    documentTouchListening: false,
    windowCaptureMounted: false,
    cardTouchListeners: 0,
    scrollBaseX: null,
    scrollBaseY: null,
    scrollX: 0,
    scrollY: 0,
  }
}

function emptyRawCounters(): MemoReorderDiagRawCounters {
  return {
    windowTouchstart: 0,
    windowTouchmove: 0,
    windowTouchend: 0,
    windowTouchcancel: 0,
    windowPointermove: 0,
    windowPointerup: 0,
    windowPointercancel: 0,
    docTouchmove: 0,
    docTouchend: 0,
    docTouchcancel: 0,
  }
}

const ring: MemoReorderDiagRingEntry[] = []
const rawSamples: MemoReorderDiagRawSample[] = []
const rawCounters: MemoReorderDiagRawCounters = emptyRawCounters()
let ringSeq = 0
let rawSampleSeq = 0
let sessionOriginMs = 0
let runtimeSnapshot: MemoReorderDiagRuntimeSnapshot = defaultRuntimeSnapshot()

function setDiagTimerState(timerState: MemoReorderDiagTimerState): void {
  if (!isMemoReorderDiagEnabled()) return
  runtimeSnapshot = { ...runtimeSnapshot, timerState }
  notifyListeners()
}

const listeners = new Set<DiagListener>()

export function subscribeMemoReorderDiag(listener: DiagListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getMemoReorderDiagRuntimeSnapshot(): MemoReorderDiagRuntimeSnapshot {
  return runtimeSnapshot
}

export function getMemoReorderDiagRing(): readonly MemoReorderDiagRingEntry[] {
  return ring
}

export function getMemoReorderDiagRawSamples(): readonly MemoReorderDiagRawSample[] {
  return rawSamples
}

export function getMemoReorderDiagRawCounters(): MemoReorderDiagRawCounters {
  return { ...rawCounters }
}

function notifyListeners(): void {
  for (const listener of listeners) {
    listener()
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function relMs(): number {
  return sessionOriginMs > 0 ? Date.now() - sessionOriginMs : 0
}

function pushImportantEntry(
  kind: string,
  reason: string,
  fields: {
    dx?: number
    dy?: number
    cancelable?: boolean | null
    defaultPrevented?: boolean | null
    gesturePhase?: MemoReorderGesturePhase
    dragging?: boolean
    activeId?: string | null
    detail?: string | null
  },
): void {
  if (!isMemoReorderDiagEnabled()) return
  const dx = fields.dx ?? 0
  const dy = fields.dy ?? 0
  const entry: MemoReorderDiagRingEntry = {
    seq: ++ringSeq,
    tMs: relMs(),
    kind,
    reason,
    dx: round1(dx),
    dy: round1(dy),
    dist: round1(Math.hypot(dx, dy)),
    cancelable: fields.cancelable ?? null,
    defaultPrevented: fields.defaultPrevented ?? null,
    gesturePhase: fields.gesturePhase ?? runtimeSnapshot.gesturePhase,
    dragging: fields.dragging ?? runtimeSnapshot.dragging,
    activeId:
      fields.activeId !== undefined ? fields.activeId : runtimeSnapshot.activeId,
    detail: fields.detail ?? null,
  }
  ring.push(entry)
  while (ring.length > MEMO_REORDER_DIAG_RING_MAX) ring.shift()
  notifyListeners()
}

function pushSilentRingEntry(
  kind: string,
  reason: string,
  fields: {
    dx?: number
    dy?: number
    cancelable?: boolean | null
    defaultPrevented?: boolean | null
    detail?: string | null
  },
): void {
  if (!isMemoReorderDiagEnabled()) return
  const dx = fields.dx ?? 0
  const dy = fields.dy ?? 0
  const entry: MemoReorderDiagRingEntry = {
    seq: ++ringSeq,
    tMs: relMs(),
    kind,
    reason,
    dx: round1(dx),
    dy: round1(dy),
    dist: round1(Math.hypot(dx, dy)),
    cancelable: fields.cancelable ?? null,
    defaultPrevented: fields.defaultPrevented ?? null,
    gesturePhase: runtimeSnapshot.gesturePhase,
    dragging: runtimeSnapshot.dragging,
    activeId: runtimeSnapshot.activeId,
    detail: fields.detail ?? null,
  }
  ring.push(entry)
  while (ring.length > MEMO_REORDER_DIAG_RING_MAX) ring.shift()
}

export function touchTagName(target: EventTarget | null): string {
  if (!(target instanceof Element)) return '-'
  return target.tagName
}

export function touchIdList(e: Pick<TouchEvent, 'touches' | 'changedTouches'>): string {
  const fromTouches = Array.from(e.touches).map((t) => t.identifier)
  const fromChanged = Array.from(e.changedTouches).map((t) => t.identifier)
  const merged = fromTouches.length > 0 ? fromTouches : fromChanged
  return merged.length > 0 ? merged.join(',') : '-'
}

export function bumpMemoReorderDiagRawCounter(
  scope: 'window',
  kind:
    | 'touchstart'
    | 'touchmove'
    | 'touchend'
    | 'touchcancel'
    | 'pointermove'
    | 'pointerup'
    | 'pointercancel',
): void
export function bumpMemoReorderDiagRawCounter(
  scope: 'doc',
  kind: 'touchmove' | 'touchend' | 'touchcancel',
): void
export function bumpMemoReorderDiagRawCounter(
  scope: 'window' | 'doc',
  kind: string,
): void {
  if (!isMemoReorderDiagEnabled()) return
  if (scope === 'window') {
    switch (kind) {
      case 'touchstart':
        rawCounters.windowTouchstart += 1
        break
      case 'touchmove':
        rawCounters.windowTouchmove += 1
        break
      case 'touchend':
        rawCounters.windowTouchend += 1
        break
      case 'touchcancel':
        rawCounters.windowTouchcancel += 1
        break
      case 'pointermove':
        rawCounters.windowPointermove += 1
        break
      case 'pointerup':
        rawCounters.windowPointerup += 1
        break
      case 'pointercancel':
        rawCounters.windowPointercancel += 1
        break
      default:
        break
    }
  } else {
    switch (kind) {
      case 'touchmove':
        rawCounters.docTouchmove += 1
        break
      case 'touchend':
        rawCounters.docTouchend += 1
        break
      case 'touchcancel':
        rawCounters.docTouchcancel += 1
        break
      default:
        break
    }
  }
}

export function memoReorderDiagPushRawWindowSample(fields: {
  source: 'window' | 'docEntry'
  kind: string
  eventPhase: number
  cancelable: boolean
  defaultPrevented: boolean
  touchIds?: string
  pointerId?: number
  pointerType?: string
  tag: string
  scrollX: number
  scrollY: number
}): void {
  if (!isMemoReorderDiagEnabled()) return
  const parts = [
    `ph=${fields.eventPhase}`,
    `c=${fields.cancelable ? 1 : 0}`,
    `dp=${fields.defaultPrevented ? 1 : 0}`,
    fields.touchIds != null ? `ids=${fields.touchIds}` : null,
    fields.pointerId != null ? `pid=${fields.pointerId}` : null,
    fields.pointerType != null ? `pt=${fields.pointerType}` : null,
    `tag=${fields.tag}`,
    `scr=${round1(fields.scrollX)},${round1(fields.scrollY)}`,
  ].filter((p): p is string => p != null)
  const sample: MemoReorderDiagRawSample = {
    seq: ++rawSampleSeq,
    tMs: relMs(),
    source: fields.source,
    kind: fields.kind,
    detail: parts.join(' '),
  }
  rawSamples.push(sample)
  while (rawSamples.length > MEMO_REORDER_DIAG_RAW_SAMPLE_MAX) rawSamples.shift()
}

export function memoReorderDiagSyncRuntime(
  next: Pick<
    MemoReorderDiagRuntimeSnapshot,
    'gesturePhase' | 'dragging' | 'activeId' | 'timerState'
  >,
): void {
  if (!isMemoReorderDiagEnabled()) return
  runtimeSnapshot = { ...runtimeSnapshot, ...next }
  notifyListeners()
}

export function memoReorderDiagSetTrackedTouchId(touchId: number | null): void {
  if (!isMemoReorderDiagEnabled()) return
  runtimeSnapshot = { ...runtimeSnapshot, trackedTouchId: touchId }
}

export function memoReorderDiagSetDocumentTouchListening(listening: boolean): void {
  if (!isMemoReorderDiagEnabled()) return
  runtimeSnapshot = { ...runtimeSnapshot, documentTouchListening: listening }
}

export function memoReorderDiagSetWindowCaptureMounted(mounted: boolean): void {
  if (!isMemoReorderDiagEnabled()) return
  runtimeSnapshot = { ...runtimeSnapshot, windowCaptureMounted: mounted }
}

export function memoReorderDiagSetCardTouchListenerCount(count: number): void {
  if (!isMemoReorderDiagEnabled()) return
  runtimeSnapshot = { ...runtimeSnapshot, cardTouchListeners: count }
}

export function memoReorderDiagNoteScrollFromWindow(): void {
  if (!isMemoReorderDiagEnabled()) return
  if (typeof window === 'undefined') return
  runtimeSnapshot = {
    ...runtimeSnapshot,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
  }
}

export function memoReorderDiagNoteGesture(
  gesturePhase: MemoReorderGesturePhase,
  dragging: boolean,
  activeId: string | null,
): void {
  if (!isMemoReorderDiagEnabled()) return
  runtimeSnapshot = {
    ...runtimeSnapshot,
    gesturePhase,
    dragging,
    activeId,
  }
  notifyListeners()
}

export function memoReorderDiagTouchSessionBegin(folderId: string): void {
  if (!isMemoReorderDiagEnabled()) return
  sessionOriginMs = Date.now()
  const scrollBaseX = typeof window !== 'undefined' ? window.scrollX : 0
  const scrollBaseY = typeof window !== 'undefined' ? window.scrollY : 0
  runtimeSnapshot = {
    ...runtimeSnapshot,
    scrollBaseX,
    scrollBaseY,
    scrollX: scrollBaseX,
    scrollY: scrollBaseY,
  }
  pushImportantEntry('touchSession', 'begin', {
    activeId: folderId,
    detail: `scr0=${round1(scrollBaseX)},${round1(scrollBaseY)}`,
  })
}

export function memoReorderDiagScrollEvent(): void {
  if (!isMemoReorderDiagEnabled()) return
  if (typeof window === 'undefined') return
  const scrollX = window.scrollX
  const scrollY = window.scrollY
  const baseX = runtimeSnapshot.scrollBaseX
  const baseY = runtimeSnapshot.scrollBaseY
  runtimeSnapshot = { ...runtimeSnapshot, scrollX, scrollY }
  if (baseX == null || baseY == null) return
  const dx = scrollX - baseX
  const dy = scrollY - baseY
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return
  pushSilentRingEntry('scroll', 'window', {
    dx,
    dy,
    detail: `scr=${round1(scrollX)},${round1(scrollY)} d=${round1(dx)},${round1(dy)}`,
  })
}

export function memoReorderDiagDocumentTouchEntry(
  kind: 'touchmove' | 'touchend' | 'touchcancel',
  e: Pick<
    TouchEvent,
    'cancelable' | 'defaultPrevented' | 'touches' | 'changedTouches' | 'eventPhase'
  >,
  ctx: {
    trackedTouchId: number
    touchIds: string
    changedTouchIds: string
    outcome:
      | 'proceed'
      | 'touchIdUnset'
      | 'touchMissing'
      | 'touchLost'
      | 'matchedEnd'
      | 'handler'
  },
): void {
  if (!isMemoReorderDiagEnabled()) return
  bumpMemoReorderDiagRawCounter('doc', kind)
  const detail = [
    `tid=${ctx.trackedTouchId}`,
    `t=${ctx.touchIds}`,
    `ch=${ctx.changedTouchIds}`,
    `out=${ctx.outcome}`,
    `ph=${e.eventPhase}`,
    `c=${e.cancelable ? 1 : 0}`,
    `dp=${e.defaultPrevented ? 1 : 0}`,
  ].join(' ')
  if (kind === 'touchmove' && ctx.outcome === 'proceed') return
  pushImportantEntry(`docEntry:${kind}`, ctx.outcome, {
    cancelable: e.cancelable,
    defaultPrevented: e.defaultPrevented,
    detail,
  })
}

export function touchChangedIdList(e: Pick<TouchEvent, 'changedTouches'>): string {
  return changedTouchIdList(e)
}

export function memoReorderDiagTouchEvent(
  kind: 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel',
  reason: string,
  e: Pick<TouchEvent, 'cancelable' | 'defaultPrevented'>,
  dx: number,
  dy: number,
): void {
  if (kind === 'touchmove') {
    pushSilentRingEntry(kind, reason, {
      dx,
      dy,
      cancelable: e.cancelable,
      defaultPrevented: e.defaultPrevented,
    })
    return
  }
  pushImportantEntry(kind, reason, {
    dx,
    dy,
    cancelable: e.cancelable,
    defaultPrevented: e.defaultPrevented,
  })
}

export function memoReorderDiagListener(
  op: 'attach' | 'detach',
  target: 'window' | 'document' | 'card' | 'provider',
  reason: string,
): void {
  const kind = op === 'attach' ? 'listenerAttach' : 'listenerDetach'
  pushImportantEntry(kind, `${target}:${reason}`, {})
  if (target === 'document') {
    memoReorderDiagSetDocumentTouchListening(op === 'attach')
  }
}

export function memoReorderDiagTimer(
  phase: 'start' | 'fire' | 'cancel',
  reason: string,
): void {
  const kind =
    phase === 'start'
      ? 'timerStart'
      : phase === 'fire'
        ? 'timerFire'
        : 'timerCancel'
  if (phase === 'start') setDiagTimerState('pending')
  else setDiagTimerState('idle')
  pushImportantEntry(kind, reason, {})
}

export function memoReorderDiagDrag(
  phase: 'start' | 'finish' | 'cancel',
  reason: string,
  activeId: string | null,
): void {
  const kind =
    phase === 'start'
      ? 'dragStart'
      : phase === 'finish'
        ? 'dragFinish'
        : 'dragCancel'
  pushImportantEntry(kind, reason, { activeId })
}

export function memoReorderDiagSessionReset(reason: string): void {
  setDiagTimerState('idle')
  pushImportantEntry('sessionReset', reason, {})
  sessionOriginMs = 0
  runtimeSnapshot = {
    ...runtimeSnapshot,
    trackedTouchId: null,
    scrollBaseX: null,
    scrollBaseY: null,
  }
}

export function memoReorderDiagStateReset(reason: string): void {
  pushImportantEntry('stateReset', reason, {})
}

export function formatMemoReorderDiagRingLine(
  entry: MemoReorderDiagRingEntry,
): string {
  const flags =
    entry.cancelable == null
      ? 'c:? dp:?'
      : `c:${entry.cancelable ? 1 : 0} dp:${entry.defaultPrevented ? 1 : 0}`
  const detail = entry.detail ? ` ${entry.detail}` : ''
  return (
    `${entry.tMs}ms ${entry.kind}/${entry.reason} ` +
    `d(${entry.dx},${entry.dy})=${entry.dist} ${flags} ` +
    `gp=${entry.gesturePhase} drag=${entry.dragging ? 1 : 0} ` +
    `id=${entry.activeId ?? '-'}${detail}`
  )
}

export function formatMemoReorderDiagRawSampleLine(
  sample: MemoReorderDiagRawSample,
): string {
  return `${sample.tMs}ms raw/${sample.source}:${sample.kind} ${sample.detail}`
}

export function formatMemoReorderDiagCounterLine(
  counters: MemoReorderDiagRawCounters,
): string {
  return (
    `win ts=${counters.windowTouchstart} tm=${counters.windowTouchmove} ` +
    `te=${counters.windowTouchend} tc=${counters.windowTouchcancel} ` +
    `pm=${counters.windowPointermove} pu=${counters.windowPointerup} ` +
    `pc=${counters.windowPointercancel} ` +
    `doc tm=${counters.docTouchmove} te=${counters.docTouchend} tc=${counters.docTouchcancel}`
  )
}
