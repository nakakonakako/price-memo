/** Dev-only gesture trace via `?memoReorderTrace=1` (no data persisted). */
export function isMemoReorderTraceEnabled(): boolean {
  if (!import.meta.env.DEV) return false
  try {
    return new URLSearchParams(window.location.search).has('memoReorderTrace')
  } catch {
    return false
  }
}

export type MemoReorderTracePayload = {
  event:
    | 'touchstart'
    | 'touchmove'
    | 'touchend'
    | 'touchcancel'
    | 'longPressArmed'
    | 'scroll'
  phase: string
  elapsedMs: number
  dx: number
  dy: number
  cancelable: boolean
  defaultPrevented: boolean
  dragActive: boolean
  longPressArmed: boolean
}

export function logMemoReorderTrace(payload: MemoReorderTracePayload): void {
  if (!isMemoReorderTraceEnabled()) return
  console.info('[memo-reorder-trace]', payload)
}
