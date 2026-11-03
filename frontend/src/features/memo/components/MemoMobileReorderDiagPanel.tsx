import { useEffect, useState } from 'react'
import {
  formatMemoReorderDiagRingLine,
  getMemoReorderDiagGitSha,
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
  const sha = getMemoReorderDiagGitSha()

  return (
    <div
      data-testid="memo-reorder-diag-panel"
      className="fixed bottom-2 left-2 right-2 z-[9999] max-h-[38vh] overflow-hidden rounded border border-stone-500/40 bg-stone-900/75 px-2 py-1.5 font-mono text-[10px] leading-tight text-stone-100 shadow-lg"
      style={{ pointerEvents: 'none' }}
      aria-hidden
    >
      <div className="truncate opacity-90">
        {`sha=${sha} gp=${snap.gesturePhase} drag=${snap.dragging ? 1 : 0} ` +
          `id=${snap.activeId ?? '-'} timer=${snap.timerState}`}
      </div>
      <div className="mt-1 max-h-[30vh] overflow-hidden opacity-85">
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
    </div>
  )
}
