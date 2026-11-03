import { useEffect, useState } from 'react'
import {
  formatMemoReorderDiagCounterLine,
  formatMemoReorderDiagRawSampleLine,
  formatMemoReorderDiagRingLine,
  getMemoReorderDiagGitSha,
  getMemoReorderDiagRawCounters,
  getMemoReorderDiagRawSamples,
  getMemoReorderDiagRing,
  getMemoReorderDiagRuntimeSnapshot,
  isMemoReorderDiagEnabled,
  subscribeMemoReorderDiag,
} from './memoMobileReorderDiag'

const PANEL_REFRESH_MS = 250

export function MemoMobileReorderDiagPanel() {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!isMemoReorderDiagEnabled()) return
    const id = window.setInterval(() => setTick((t) => t + 1), PANEL_REFRESH_MS)
    const unsub = subscribeMemoReorderDiag(() => setTick((t) => t + 1))
    return () => {
      window.clearInterval(id)
      unsub()
    }
  }, [])

  if (!isMemoReorderDiagEnabled()) return null

  void tick
  const snap = getMemoReorderDiagRuntimeSnapshot()
  const ring = getMemoReorderDiagRing()
  const rawSamples = getMemoReorderDiagRawSamples()
  const counters = getMemoReorderDiagRawCounters()
  const sha = getMemoReorderDiagGitSha()
  const scrollDelta =
    snap.scrollBaseX != null && snap.scrollBaseY != null
      ? `${Math.round((snap.scrollX - snap.scrollBaseX) * 10) / 10},${Math.round((snap.scrollY - snap.scrollBaseY) * 10) / 10}`
      : '-'

  return (
    <div
      data-testid="memo-reorder-diag-panel"
      className="fixed bottom-2 left-2 right-2 z-[9999] max-h-[38vh] overflow-hidden rounded border border-stone-500/40 bg-stone-900/75 px-2 py-1.5 font-mono text-[10px] leading-tight text-stone-100 shadow-lg"
      style={{ pointerEvents: 'none' }}
      aria-hidden
    >
      <div className="truncate opacity-90">
        {`sha=${sha} gp=${snap.gesturePhase} drag=${snap.dragging ? 1 : 0} ` +
          `id=${snap.activeId ?? '-'} timer=${snap.timerState} tid=${snap.trackedTouchId ?? '-'}`}
      </div>
      <div className="truncate opacity-85">
        {`docL=${snap.documentTouchListening ? 1 : 0} winL=${snap.windowCaptureMounted ? 1 : 0} ` +
          `cardL=${snap.cardTouchListeners} scr=${Math.round(snap.scrollX * 10) / 10},${Math.round(snap.scrollY * 10) / 10} ` +
          `dScr=${scrollDelta}`}
      </div>
      <div className="truncate opacity-80">{formatMemoReorderDiagCounterLine(counters)}</div>
      <div className="mt-1 max-h-[22vh] overflow-hidden opacity-85">
        {ring.length === 0 ? (
          <div className="text-stone-400">(no events yet)</div>
        ) : (
          ring.map((entry) => (
            <div key={entry.seq} className="truncate">
              {formatMemoReorderDiagRingLine(entry)}
            </div>
          ))
        )}
      </div>
      {rawSamples.length > 0 ? (
        <div className="mt-0.5 max-h-[8vh] overflow-hidden opacity-75">
          {rawSamples.map((sample) => (
            <div key={sample.seq} className="truncate">
              {formatMemoReorderDiagRawSampleLine(sample)}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
