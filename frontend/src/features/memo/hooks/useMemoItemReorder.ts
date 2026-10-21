import { useCallback, type Dispatch, type SetStateAction } from 'react'
import { reorderIds } from '@/lib/listOrder'
import { getCurrentAuthUserId } from '@/lib/authIdentity'
import {
  isMemoReorderStaleError,
  reorderMemoItems,
  type PriceMemoItem,
} from '../api/memoApi'

export const MEMO_REORDER_STALE_MESSAGE =
  'メモの一覧が変更されました。もう一度並べ替えてください。'

export const MEMO_REORDER_UNKNOWN_ORDER_MESSAGE =
  '並べ替えの結果を確認できませんでした。しばらくしてから再度お試しください。'

export function memoReorderFailureMessage(err: unknown): string {
  if (isMemoReorderStaleError(err)) return MEMO_REORDER_STALE_MESSAGE
  return '並べ替えの保存に失敗しました。'
}

type LoadFn = (opts?: {
  silent?: boolean
  preserveError?: boolean
}) => Promise<'ok' | 'aborted' | 'error'>

type Refs = {
  reorderGenerationRef: { current: number }
  reorderInFlightRef: { current: boolean }
  loadGenerationRef: { current: number }
  skipPreserveMemoOrderRef: { current: boolean }
}

type Args = {
  memoItems: PriceMemoItem[]
  setMemoItems: Dispatch<SetStateAction<PriceMemoItem[]>>
  setError: Dispatch<SetStateAction<string | null>>
  load: LoadFn
  interactionsLocked: boolean
  refs: Refs
  onSuccess?: (message: string) => void
}

export function useMemoItemReorder({
  memoItems,
  setMemoItems,
  setError,
  load,
  interactionsLocked,
  refs,
  onSuccess,
}: Args) {
  const {
    reorderGenerationRef,
    reorderInFlightRef,
    loadGenerationRef,
    skipPreserveMemoOrderRef,
  } = refs

  const commitReorder = useCallback(
    async (
      draggedId: string,
      beforeId: string | null,
    ): Promise<'ok' | 'skipped' | 'locked'> => {
      if (interactionsLocked) return 'locked'
      if (reorderInFlightRef.current) return 'skipped'

      const userIdAtStart = getCurrentAuthUserId()
      if (!userIdAtStart) return 'skipped'

      const prev = memoItems
      const expectedIds = prev.map((m) => m.folder_id)
      const ids = reorderIds(expectedIds, draggedId, beforeId)
      if (
        ids.length === expectedIds.length &&
        ids.every((id, i) => id === expectedIds[i])
      ) {
        return 'skipped'
      }

      const reorderGeneration = reorderGenerationRef.current + 1
      reorderGenerationRef.current = reorderGeneration
      loadGenerationRef.current += 1
      reorderInFlightRef.current = true

      const map = new Map(prev.map((m) => [m.folder_id, m]))
      const next = ids
        .map((folderId, sort_order) => {
          const m = map.get(folderId)
          return m ? { ...m, sort_order } : null
        })
        .filter((m): m is PriceMemoItem => m != null)
      setMemoItems(next)

      try {
        await reorderMemoItems(expectedIds, ids)
        if (
          reorderGenerationRef.current !== reorderGeneration ||
          getCurrentAuthUserId() !== userIdAtStart
        ) {
          return 'skipped'
        }
        onSuccess?.('並べ替えを保存しました')
        return 'ok'
      } catch (err) {
        if (
          reorderGenerationRef.current !== reorderGeneration ||
          getCurrentAuthUserId() !== userIdAtStart
        ) {
          return 'skipped'
        }
        setError(memoReorderFailureMessage(err))
        reorderGenerationRef.current += 1
        reorderInFlightRef.current = false
        loadGenerationRef.current += 1
        const loadGenerationAtReload = loadGenerationRef.current
        const userIdBeforeReload = getCurrentAuthUserId()
        skipPreserveMemoOrderRef.current = true
        const loadResult = await load({ silent: true, preserveError: true })
        skipPreserveMemoOrderRef.current = false
        const reloadStillValid =
          getCurrentAuthUserId() === userIdBeforeReload &&
          loadGenerationRef.current === loadGenerationAtReload
        if (loadResult !== 'ok' && reloadStillValid) {
          setMemoItems(prev)
          setError((current) =>
            current
              ? `${current} ${MEMO_REORDER_UNKNOWN_ORDER_MESSAGE}`
              : MEMO_REORDER_UNKNOWN_ORDER_MESSAGE,
          )
        }
        return 'skipped'
      } finally {
        if (reorderGenerationRef.current === reorderGeneration) {
          reorderInFlightRef.current = false
          reorderGenerationRef.current += 1
        }
      }
    },
    [
      interactionsLocked,
      load,
      memoItems,
      onSuccess,
      reorderGenerationRef,
      reorderInFlightRef,
      loadGenerationRef,
      setError,
      setMemoItems,
      skipPreserveMemoOrderRef,
    ],
  )

  return { commitReorder }
}
