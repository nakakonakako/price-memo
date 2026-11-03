import { useEffect, useState } from 'react'
import {
  formatMemoReorderDiagCounterLine,
  getMemoReorderDiagGitSha,
  getMemoReorderDiagMergedTimeline,
  getMemoReorderDiagRawCounters,
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
  const counters = getMemoReorderDiagRawCounters()
  const timeline = getMemoReorderDiagMergedTimeline()
  const sha = getMemoReorderDiagGitSha()
  const scrollDelta =
    snap.scrollBaseX != null && snap.scrollBaseY != null
      ? `${Math.round((snap.scrollX - snap.scrollBaseX) * 10) / 10},${Math.round((snap.scrollY - snap.scrollBaseY) * 10) / 10}`
      : '-'

  return (
    <div
      data-testid="memo-reorder-diag-panel"
      className="fixed bottom-2 left-2 right-2 z-[9999] flex max-h-[34vh] flex-col overflow-hidden rounded border border-stone-500/40 bg-stone-900/75 px-2 py-1.5 font-mono text-[10px] leading-tight text-stone-100 shadow-lg"
      style={{ pointerEvents: 'none' }}
      aria-hidden
    >
      <div className="shrink-0 truncate opacity-90">
        {`sha=${sha} gp=${snap.gesturePhase} drag=${snap.dragging ? 1 : 0} ` +
          `id=${snap.activeId ?? '-'} timer=${snap.timerState} tid=${snap.trackedTouchId ?? '-'}`}
      </div>
      <div className="shrink-0 truncate opacity-85">
        {`docL=${snap.documentTouchListening ? 1 : 0} winL=${snap.windowCaptureMounted ? 1 : 0} ` +
          `cardL=${snap.cardTouchListeners} scr=${Math.round(snap.scrollX * 10) / 10},${Math.round(snap.scrollY * 10) / 10} ` +
          `dScr=${scrollDelta}`}
      </div>
      <div className="shrink-0 truncate opacity-80">{formatMemoReorderDiagCounterLine(counters)}</div>
      <div
        data-testid="memo-reorder-diag-timeline"
        className="mt-1 min-h-0 shrink opacity-85"
      >
        {timeline.length === 0 ? (
          <div className="text-stone-400">(no events yet)</div>
        ) : (
          timeline.map((item) => (
            <div key={item.seq} className="truncate">
              {item.line}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
