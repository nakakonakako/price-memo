import type { MemoReorderGesturePhase } from './MemoMobileReorderContext'

declare const __MEMO_REORDER_DIAG_GIT_SHA__: string

export const MEMO_REORDER_DIAG_RING_MAX = 20

export type MemoReorderDiagTimerState = 'idle' | 'pending'

export type MemoReorderDiagRuntimeSnapshot = {
  gesturePhase: MemoReorderGesturePhase
  dragging: boolean
  activeId: string | null
  timerState: MemoReorderDiagTimerState
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
}

type DiagListener = () => void

let queryResolved = false
let queryEnabled = false

export function resetMemoReorderDiagQueryCacheForTests(): void {
  queryResolved = false
  queryEnabled = false
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

const ring: MemoReorderDiagRingEntry[] = []
let ringSeq = 0
let sessionOriginMs = 0
let runtimeSnapshot: MemoReorderDiagRuntimeSnapshot = {
  gesturePhase: 'idle',
  dragging: false,
  activeId: null,
  timerState: 'idle',
}

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

function notifyListeners(): void {
  for (const listener of listeners) {
    listener()
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function pushEntry(
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
  },
): void {
  if (!isMemoReorderDiagEnabled()) return
  const dx = fields.dx ?? 0
  const dy = fields.dy ?? 0
  const entry: MemoReorderDiagRingEntry = {
    seq: ++ringSeq,
    tMs: sessionOriginMs > 0 ? Date.now() - sessionOriginMs : 0,
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
  }
  ring.push(entry)
  while (ring.length > MEMO_REORDER_DIAG_RING_MAX) ring.shift()
  notifyListeners()
}

export function memoReorderDiagSyncRuntime(
  next: MemoReorderDiagRuntimeSnapshot,
): void {
  if (!isMemoReorderDiagEnabled()) return
  runtimeSnapshot = next
  notifyListeners()
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
  pushEntry('touchSession', 'begin', { activeId: folderId })
}

export function memoReorderDiagTouchEvent(
  kind: 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel',
  reason: string,
  e: Pick<TouchEvent, 'cancelable' | 'defaultPrevented'>,
  dx: number,
  dy: number,
): void {
  pushEntry(kind, reason, {
    dx,
    dy,
    cancelable: e.cancelable,
    defaultPrevented: e.defaultPrevented,
  })
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
  pushEntry(kind, reason, {})
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
  pushEntry(kind, reason, { activeId })
}

export function memoReorderDiagSessionReset(reason: string): void {
  setDiagTimerState('idle')
  pushEntry('sessionReset', reason, {})
  sessionOriginMs = 0
}

export function memoReorderDiagStateReset(reason: string): void {
  pushEntry('stateReset', reason, {})
}

export function formatMemoReorderDiagRingLine(
  entry: MemoReorderDiagRingEntry,
): string {
  const flags =
    entry.cancelable == null
      ? 'c:? dp:?'
      : `c:${entry.cancelable ? 1 : 0} dp:${entry.defaultPrevented ? 1 : 0}`
  return (
    `${entry.tMs}ms ${entry.kind}/${entry.reason} ` +
    `d(${entry.dx},${entry.dy})=${entry.dist} ${flags} ` +
    `gp=${entry.gesturePhase} drag=${entry.dragging ? 1 : 0} ` +
    `id=${entry.activeId ?? '-'}`
  )
}
