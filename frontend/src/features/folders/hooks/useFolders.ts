import { useCallback, useEffect, useState } from 'react'
import {
  createFolder,
  deleteFolder,
  listFolders,
  renameFolder,
  reorderFolders,
} from '../api/foldersApi'
import type { PriceFolder } from '../types'

function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: string }).message)
  }
  return '操作に失敗しました'
}

export function useFolders() {
  const [folders, setFolders] = useState<PriceFolder[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isMutating, setIsMutating] = useState(false)

  const refresh = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setFolders(await listFolders())
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const create = async (
    name: string,
    options?: { atStart?: boolean },
  ) => {
    setIsMutating(true)
    setError(null)
    try {
      const created = await createFolder(name)
      if (options?.atStart) {
        const next = [created, ...folders].map((f, sort_order) => ({
          ...f,
          sort_order,
        }))
        setFolders(next)
        try {
          await reorderFolders(next.map((f) => f.id))
        } catch (err) {
          setError(errorMessage(err))
          await refresh()
          throw err
        }
        return created
      }
      setFolders((prev) => [...prev, created])
      return created
    } catch (err) {
      setError(errorMessage(err))
      throw err
    } finally {
      setIsMutating(false)
    }
  }

  const rename = async (id: string, name: string) => {
    setIsMutating(true)
    setError(null)
    try {
      const updated = await renameFolder(id, name)
      setFolders((prev) => prev.map((f) => (f.id === id ? updated : f)))
    } catch (err) {
      setError(errorMessage(err))
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
      setFolders((prev) => prev.filter((f) => f.id !== id))
    } catch (err) {
      setError(errorMessage(err))
      throw err
    } finally {
      setIsMutating(false)
    }
  }

  const reorder = async (ids: string[]) => {
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
    } catch (err) {
      setError(errorMessage(err))
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
