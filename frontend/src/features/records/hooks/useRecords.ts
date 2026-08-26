import { useCallback, useEffect, useState } from 'react'
import {
  createRecord,
  deleteRecord,
  listRecords,
  updateRecord,
} from '../api/recordsApi'
import type { PriceRecord, PriceRecordInput } from '../types'

function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: string }).message)
  }
  return '操作に失敗しました'
}

export function useRecords(folderId: string | null) {
  const [records, setRecords] = useState<PriceRecord[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isMutating, setIsMutating] = useState(false)

  const refresh = useCallback(async () => {
    if (!folderId) {
      setRecords([])
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      setRecords(await listRecords(folderId))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }, [folderId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const create = async (input: PriceRecordInput) => {
    setIsMutating(true)
    setError(null)
    try {
      const created = await createRecord(input)
      if (created.folder_id === folderId) {
        setRecords((prev) => [created, ...prev])
      }
      return created
    } catch (err) {
      setError(errorMessage(err))
      throw err
    } finally {
      setIsMutating(false)
    }
  }

  const update = async (
    id: string,
    input: Omit<PriceRecordInput, 'folder_id'> & { folder_id?: string },
  ) => {
    setIsMutating(true)
    setError(null)
    try {
      const updated = await updateRecord(id, input)
      setRecords((prev) => {
        if (folderId && updated.folder_id !== folderId) {
          return prev.filter((r) => r.id !== id)
        }
        return prev.map((r) => (r.id === id ? updated : r))
      })
      return updated
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
      await deleteRecord(id)
      setRecords((prev) => prev.filter((r) => r.id !== id))
    } catch (err) {
      setError(errorMessage(err))
      throw err
    } finally {
      setIsMutating(false)
    }
  }

  return {
    records,
    isLoading,
    isMutating,
    error,
    refresh,
    create,
    update,
    remove,
  }
}
