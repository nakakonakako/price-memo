import { useEffect, useRef } from 'react'
import {
  getResumeSyncGeneration,
  subscribeResumeSync,
} from '@/lib/resumeSync'

/**
 * Runs `onRefresh` when the app resumes from another context (visibility/focus/pageshow).
 * Separate from `catalogSync` revision bumps (local mutations / keep-alive tab sync).
 */
export function useResumeCatalogRefresh({
  active,
  enabled = true,
  onResumeSignal,
  onRefresh,
}: {
  active: boolean
  enabled?: boolean
  /** Runs when a new resume generation is observed (including while the tab is hidden). */
  onResumeSignal?: () => void
  onRefresh: () => void | Promise<void>
}) {
  const onRefreshRef = useRef(onRefresh)
  const onResumeSignalRef = useRef(onResumeSignal)
  useEffect(() => {
    onRefreshRef.current = onRefresh
    onResumeSignalRef.current = onResumeSignal
  }, [onRefresh, onResumeSignal])

  const lastResumeGenerationRef = useRef(getResumeSyncGeneration())
  const pendingWhileHiddenRef = useRef(false)
  const refreshInFlightRef = useRef(false)
  const refreshQueuedRef = useRef(false)
  const runRefreshRef = useRef<() => Promise<void>>(async () => {})

  useEffect(() => {
    const runRefresh = async () => {
      if (refreshInFlightRef.current) {
        refreshQueuedRef.current = true
        return
      }
      refreshInFlightRef.current = true
      try {
        await onRefreshRef.current()
      } finally {
        refreshInFlightRef.current = false
        if (refreshQueuedRef.current) {
          refreshQueuedRef.current = false
          void runRefresh()
        }
      }
    }
    runRefreshRef.current = runRefresh

    const onResumeGeneration = (generation: number) => {
      if (!enabled) return
      if (generation === lastResumeGenerationRef.current) return
      lastResumeGenerationRef.current = generation
      onResumeSignalRef.current?.()

      if (!active) {
        pendingWhileHiddenRef.current = true
        return
      }
      void runRefresh()
    }

    return subscribeResumeSync(onResumeGeneration)
  }, [active, enabled])

  useEffect(() => {
    if (!active || !enabled) return
    if (!pendingWhileHiddenRef.current) return
    pendingWhileHiddenRef.current = false
    void runRefreshRef.current()
  }, [active, enabled])
}
