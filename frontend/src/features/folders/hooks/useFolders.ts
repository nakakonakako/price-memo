import { useCallback, useEffect, useRef, useState } from 'react'
import { getCurrentAuthUserId } from '@/lib/authIdentity'
import { createVisibleLoadTracker } from '@/lib/visibleLoad'
import { toUserMessage } from '@/lib/userError'
import {
  createFolder,
  deleteFolder,
  listFolders,
  renameFolder,
  reorderFolders,
} from '../api/foldersApi'
import type { PriceFolder } from '../types'

function appendFolderUnique(prev: PriceFolder[], created: PriceFolder): PriceFolder[] {
  return prev.some((f) => f.id === created.id) ? prev : [...prev, created]
}

export function useFolders() {
  const [folders, setFolders] = useState<PriceFolder[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isMutating, setIsMutating] = useState(false)
  const createInFlightRef = useRef(false)
  const mountedRef = useRef(true)
  const refreshGenerationRef = useRef(0)
  const visibleLoadRef = useRef(createVisibleLoadTracker())

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const refresh = useCallback(async (opts?: { silent?: boolean }) => {
    const generation = ++refreshGenerationRef.current
    const userIdAtStart = getCurrentAuthUserId()
    const startedVisibleLoad = !opts?.silent
    if (startedVisibleLoad) {
      visibleLoadRef.current.begin()
      setIsLoading(true)
    }
    setError(null)
    try {
      const next = await listFolders()
      if (
        !mountedRef.current ||
        generation !== refreshGenerationRef.current ||
        getCurrentAuthUserId() !== userIdAtStart
      ) {
        return
      }
      setFolders(next)
    } catch (err) {
      if (
        !mountedRef.current ||
        generation !== refreshGenerationRef.current ||
        getCurrentAuthUserId() !== userIdAtStart
      ) {
        return
      }
      setError(toUserMessage(err, 'フォルダの読み込みに失敗しました。'))
    } finally {
      if (opts?.silent) {
        visibleLoadRef.current.settle()
        if (mountedRef.current && getCurrentAuthUserId() === userIdAtStart) {
          setIsLoading(false)
        }
      }
      if (
        startedVisibleLoad &&
        mountedRef.current &&
        visibleLoadRef.current.end() &&
        getCurrentAuthUserId() === userIdAtStart
      ) {
        setIsLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const generation = ++refreshGenerationRef.current
    const userIdAtStart = getCurrentAuthUserId()
    visibleLoadRef.current.begin()
    listFolders()
      .then((next) => {
        if (
          !cancelled &&
          generation === refreshGenerationRef.current &&
          getCurrentAuthUserId() === userIdAtStart
        ) {
          setFolders(next)
        }
      })
      .catch((err: unknown) => {
        if (
          !cancelled &&
          generation === refreshGenerationRef.current &&
          getCurrentAuthUserId() === userIdAtStart
        ) {
          setError(toUserMessage(err, 'フォルダの読み込みに失敗しました。'))
        }
      })
      .finally(() => {
        if (
          !cancelled &&
          visibleLoadRef.current.end() &&
          getCurrentAuthUserId() === userIdAtStart
        ) {
          setIsLoading(false)
        }
      })
    return () => {
      cancelled = true
      refreshGenerationRef.current += 1
    }
  }, [])

  const create = async (
    name: string,
    options?: { atStart?: boolean },
  ) => {
    if (createInFlightRef.current) {
      throw new Error('品目の作成中です。完了までお待ちください。')
    }
    createInFlightRef.current = true
    setIsMutating(true)
    setError(null)
    try {
      const created = await createFolder(name)
      if (!mountedRef.current) return created
      refreshGenerationRef.current += 1
      if (options?.atStart) {
        const prevWithoutDup = folders.filter((f) => f.id !== created.id)
        const next = [created, ...prevWithoutDup].map((f, sort_order) => ({
          ...f,
          sort_order,
        }))
        setFolders(next)
        try {
          await reorderFolders(next.map((f) => f.id))
          if (!mountedRef.current) return created
          refreshGenerationRef.current += 1
        } catch (err) {
          setError(toUserMessage(err, '並べ替えの保存に失敗しました。'))
          await refresh()
          throw err
        }
        return created
      }
      setFolders((prev) => appendFolderUnique(prev, created))
      return created
    } catch (err) {
      setError(toUserMessage(err, 'フォルダの追加に失敗しました。'))
      throw err
    } finally {
      createInFlightRef.current = false
      setIsMutating(false)
    }
  }

  const rename = async (id: string, name: string) => {
    setIsMutating(true)
    setError(null)
    try {
      const updated = await renameFolder(id, name)
      if (!mountedRef.current) return
      refreshGenerationRef.current += 1
      setFolders((prev) => prev.map((f) => (f.id === id ? updated : f)))
    } catch (err) {
      setError(toUserMessage(err, 'フォルダ名の変更に失敗しました。'))
      throw err
    } finally {
      setIsMutating(false)
    }
  }

  const remove = async (id: string) => {
    setIsMutating(true)
    setError(null)
    try {
      await deleteFolder(id)
      if (!mountedRef.current) return
      refreshGenerationRef.current += 1
      setFolders((prev) => prev.filter((f) => f.id !== id))
    } catch (err) {
      setError(toUserMessage(err, 'フォルダの削除に失敗しました。'))
      throw err
    } finally {
      setIsMutating(false)
    }
  }

  const reorder = async (ids: string[]) => {
    refreshGenerationRef.current += 1
    const map = new Map(folders.map((f) => [f.id, f]))
    const next = ids
      .map((id, sort_order) => {
        const f = map.get(id)
        return f ? { ...f, sort_order } : null
      })
      .filter((f): f is PriceFolder => f != null)
    setFolders(next)
    try {
      await reorderFolders(ids)
      if (!mountedRef.current) return
      refreshGenerationRef.current += 1
    } catch (err) {
      setError(toUserMessage(err, '並べ替えの保存に失敗しました。'))
      await refresh()
      throw err
    }
  }

  return {
    folders,
    isLoading,
    isMutating,
    error,
    refresh,
    create,
    rename,
    remove,
    reorder,
  }
}
