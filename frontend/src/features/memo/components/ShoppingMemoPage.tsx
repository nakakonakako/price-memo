import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { TrashDragProvider } from '@/components/trash/TrashDragProvider'
import type { DragEndResult } from '@/components/trash/types'
import {
  createFolder,
  deleteFolder,
  listFolders,
} from '@/features/folders/api/foldersApi'
import type { PriceFolder } from '@/features/folders/types'
import { listAllRecords } from '@/features/records/api/recordsApi'
import type { PriceRecord } from '@/features/records/types'
import {
  applyIdOrder,
  loadIdOrder,
  reorderIds,
  saveIdOrder,
} from '@/lib/listOrder'
import { recordsByFolderId } from '../utils/stats'
import { FolderMemoCard } from './FolderMemoCard'
import { useTrashDrag } from '@/components/trash/TrashDragProvider'

const ORDER_KEY = 'price-memo-memo-order'

function MemoListEndMarker({ lastId }: { lastId: string | null }) {
  const { insertBeforeId, activeId, activeKind, dragOverTrash, dragging } =
    useTrashDrag()
  if (!dragging || dragOverTrash || activeKind !== 'memo-folder') return null
  if (insertBeforeId !== null) return null
  if (lastId != null && activeId === lastId) return null
  return <div className="h-1 rounded-full bg-stone-800" aria-hidden />
}

export function ShoppingMemoPage() {
  const [folders, setFolders] = useState<PriceFolder[]>([])
  const [records, setRecords] = useState<PriceRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [mutating, setMutating] = useState(false)

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setIsLoading(true)
    setError(null)
    try {
      const [folderList, recordList] = await Promise.all([
        listFolders(),
        listAllRecords(),
      ])
      setFolders(applyIdOrder(folderList, loadIdOrder(ORDER_KEY)))
      setRecords(recordList)
    } catch (err) {
      setError(err instanceof Error ? err.message : '読み込みに失敗しました')
    } finally {
      if (!opts?.silent) setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const byFolder = useMemo(() => recordsByFolderId(records), [records])
  const folderIds = useMemo(() => folders.map((f) => f.id), [folders])

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) return
    setMutating(true)
    setError(null)
    try {
      const created = await createFolder(newName)
      setFolders((prev) => {
        const next = [...prev, created]
        saveIdOrder(ORDER_KEY, next.map((f) => f.id))
        return next
      })
      setNewName('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '追加に失敗しました')
    } finally {
      setMutating(false)
    }
  }

  const handleDragEnd = useCallback(async (result: DragEndResult) => {
    if (result.action === 'cancel') return
    if (result.payload.kind !== 'memo-folder') return

    if (result.action === 'delete') {
      setMutating(true)
      setError(null)
      try {
        await deleteFolder(result.payload.id)
        setFolders((prev) => {
          const next = prev.filter((f) => f.id !== result.payload.id)
          saveIdOrder(ORDER_KEY, next.map((f) => f.id))
          return next
        })
        setRecords((prev) =>
          prev.filter((r) => r.folder_id !== result.payload.id),
        )
      } catch (err) {
        setError(err instanceof Error ? err.message : '削除に失敗しました')
      } finally {
        setMutating(false)
      }
      return
    }

    if (result.action === 'reorder') {
      setFolders((prev) => {
        const ids = reorderIds(
          prev.map((f) => f.id),
          result.payload.id,
          result.beforeId,
        )
        saveIdOrder(ORDER_KEY, ids)
        const map = new Map(prev.map((f) => [f.id, f]))
        return ids.map((id) => map.get(id)!).filter(Boolean)
      })
    }
  }, [])

  const handleSaved = (record: PriceRecord) => {
    setRecords((prev) => [record, ...prev])
  }

  return (
    <TrashDragProvider onDragEnd={handleDragEnd} trashSize="memo">
      <MemoListRegistrar ids={folderIds} />
      <section className="space-y-6 pb-44">
        <div className="space-y-2">
          <h2 className="text-lg font-medium text-stone-900">買い物メモ</h2>
          <p className="text-sm text-stone-600">
            買う候補をメモに追加し、平均・最安・直近を見ながら試算します。ドラッグで並べ替え、右下のゴミ箱へ落とすと削除できます。
          </p>
        </div>

        <form onSubmit={(e) => void handleCreate(e)} className="flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="例: 鶏むね / 牛乳 1L"
            className="min-w-0 flex-1 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-stone-500"
            disabled={mutating}
          />
          <button
            type="submit"
            disabled={mutating || !newName.trim()}
            className="shrink-0 rounded-md bg-stone-900 px-4 py-2 text-sm text-white hover:bg-stone-800 disabled:opacity-50"
          >
            追加
          </button>
        </form>

        {error && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {isLoading ? (
          <p className="text-sm text-stone-500">読み込み中...</p>
        ) : folders.length === 0 ? (
          <p className="rounded-md border border-dashed border-stone-300 bg-white/60 px-4 py-8 text-center text-sm text-stone-500">
            まだメモがありません。上から追加してください。
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-stone-600">{folders.length} 件のメモ</p>
            <ul className="space-y-2">
              {folders.map((folder) => (
                <FolderMemoCard
                  key={folder.id}
                  folderId={folder.id}
                  folderName={folder.name}
                  records={byFolder.get(folder.id) ?? []}
                  onSaved={handleSaved}
                />
              ))}
              <MemoListEndMarker
                lastId={folders[folders.length - 1]?.id ?? null}
              />
            </ul>
          </div>
        )}
      </section>
    </TrashDragProvider>
  )
}

function MemoListRegistrar({ ids }: { ids: string[] }) {
  const { registerList } = useTrashDrag()
  useEffect(() => {
    registerList('memo-folder', ids)
  }, [ids, registerList])
  return null
}
