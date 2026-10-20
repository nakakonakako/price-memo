import { useEffect, useRef } from 'react'
import {
  subscribeExternalSync,
  type PriceMemoTable,
} from '@/lib/externalSync'

/** Re-fetches invalidated server data while deferring hidden keep-alive tabs. */
export function useExternalCatalogRefresh({
  active,
  tables,
  onSignal,
  onRefresh,
}: {
  active: boolean
  tables: readonly PriceMemoTable[]
  onSignal?: (tables: ReadonlySet<PriceMemoTable>) => void
  onRefresh: (tables: ReadonlySet<PriceMemoTable>) => void | Promise<void>
}) {
  const activeRef = useRef(active)
  const tablesRef = useRef(new Set(tables))
  const onSignalRef = useRef(onSignal)
  const onRefreshRef = useRef(onRefresh)
  const pendingWhileHiddenRef = useRef(new Set<PriceMemoTable>())
  const queuedWhileRefreshingRef = useRef(new Set<PriceMemoTable>())
  const refreshInFlightRef = useRef(false)

  useEffect(() => {
    activeRef.current = active
    tablesRef.current = new Set(tables)
    onSignalRef.current = onSignal
    onRefreshRef.current = onRefresh
  }, [active, onRefresh, onSignal, tables])

  const runRefreshRef = useRef<(tables: ReadonlySet<PriceMemoTable>) => void>(
    () => {},
  )

  useEffect(() => {
    const runRefresh = (requested: ReadonlySet<PriceMemoTable>) => {
      for (const table of requested) queuedWhileRefreshingRef.current.add(table)
      if (refreshInFlightRef.current) return

      const runNext = async () => {
        const batch = queuedWhileRefreshingRef.current
        queuedWhileRefreshingRef.current = new Set()
        if (batch.size === 0) return
        refreshInFlightRef.current = true
        try {
          await onRefreshRef.current(batch)
        } catch {
          // Page refreshes preserve their current data when the network is unavailable.
        } finally {
          refreshInFlightRef.current = false
          if (queuedWhileRefreshingRef.current.size > 0) {
            void runNext()
          }
        }
      }

      void runNext()
    }
    runRefreshRef.current = runRefresh

    return subscribeExternalSync((requested) => {
      const relevant = new Set(
        [...requested].filter((table) => tablesRef.current.has(table)),
      )
      if (relevant.size === 0) return
      onSignalRef.current?.(relevant)
      if (!activeRef.current) {
        for (const table of relevant) pendingWhileHiddenRef.current.add(table)
        return
      }
      runRefresh(relevant)
    })
  }, [])

  useEffect(() => {
    if (!active || pendingWhileHiddenRef.current.size === 0) return
    const pending = pendingWhileHiddenRef.current
    pendingWhileHiddenRef.current = new Set()
    runRefreshRef.current(pending)
  }, [active])
}
