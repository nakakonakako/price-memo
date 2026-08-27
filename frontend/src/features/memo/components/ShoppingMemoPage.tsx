import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import { TrashDragProvider } from '@/components/trash/TrashDragProvider'
import type { DragEndResult } from '@/components/trash/types'
import {
  createFolder,
  deleteFolder,
  listFolders,
  reorderFolders,
} from '@/features/folders/api/foldersApi'
import type { PriceFolder } from '@/features/folders/types'
import {
  folderSortKey,
  parseFolderName,
} from '@/features/folders/utils/folderName'
import { listAllRecords } from '@/features/records/api/recordsApi'
import type { PriceRecord } from '@/features/records/types'
import { reorderIds } from '@/lib/listOrder'
import { toUserMessage } from '@/lib/userError'
import { recordsByFolderId } from '../utils/stats'
import { FolderMemoCard } from './FolderMemoCard'
import { useTrashDrag } from '@/components/trash/TrashDragProvider'

const MEMO_PALETTES = [
  'border-rose-200 bg-rose-50/90',
  'border-amber-200 bg-amber-50/90',
  'border-lime-200 bg-lime-50/90',
  'border-sky-200 bg-sky-50/90',
  'border-violet-200 bg-violet-50/90',
  'border-teal-200 bg-teal-50/90',
  'border-orange-200 bg-orange-50/90',
  'border-fuchsia-200 bg-fuchsia-50/90',
]

const nameCollator = new Intl.Collator('ja', {
  numeric: true,
  sensitivity: 'base',
})

function normalizeFolderQuery(value: string): string {
  return value.trim().toLocaleLowerCase('ja')
}

function findFolderByInput(
  folders: PriceFolder[],
  input: string,
): PriceFolder | undefined {
  const q = input.trim()
  if (!q) return undefined
  const nq = normalizeFolderQuery(q)
  return folders.find((f) => {
    const { displayName } = parseFolderName(f.name)
    return (
      normalizeFolderQuery(f.name) === nq ||
      normalizeFolderQuery(displayName) === nq
    )
  })
}

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
  const [info, setInfo] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [pickId, setPickId] = useState('')
  const [mutating, setMutating] = useState(false)
  const [focusFolderId, setFocusFolderId] = useState<string | null>(null)
  const cardRefs = useRef(new Map<string, HTMLElement>())

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setIsLoading(true)
    setError(null)
    try {
      const [folderList, recordList] = await Promise.all([
        listFolders(),
        listAllRecords(),
      ])
      setFolders(folderList)
      setRecords(recordList)
    } catch (err) {
      setError(toUserMessage(err, '読み込みに失敗しました。'))
    } finally {
      if (!opts?.silent) setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const byFolder = useMemo(() => recordsByFolderId(records), [records])
  const folderIds = useMemo(() => folders.map((f) => f.id), [folders])

  const foldersForPick = useMemo(() => {
    return [...folders].sort((a, b) =>
      nameCollator.compare(folderSortKey(a.name), folderSortKey(b.name)),
    )
  }, [folders])

  const clearFocusFolder = useCallback(() => {
    setFocusFolderId(null)
  }, [])

  const focusFolder = useCallback((folderId: string) => {
    setFocusFolderId(folderId)
    setInfo(null)
    setError(null)
    requestAnimationFrame(() => {
      const el = cardRefs.current.get(folderId)
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
  }, [])

  const handlePickExisting = (e: FormEvent) => {
    e.preventDefault()
    if (!pickId) return
    focusFolder(pickId)
    setInfo('既存のフォルダを開きました。名前はフォルダタブと共通です。')
  }

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    const trimmed = newName.trim()
    if (!trimmed) return
    setError(null)
    setInfo(null)

    const existing = findFolderByInput(folders, trimmed)
    if (existing) {
      setNewName('')
      focusFolder(existing.id)
      setInfo(
        `「${parseFolderName(existing.name).displayName}」は既にあるので、そのフォルダを開きました。`,
      )
      return
    }

    setMutating(true)
    try {
      const created = await createFolder(trimmed)
      setFolders((prev) => [...prev, created])
      setNewName('')
      focusFolder(created.id)
    } catch (err) {
      setError(toUserMessage(err, '追加に失敗しました。'))
    } finally {
      setMutating(false)
    }
  }

  const handleDragEnd = useCallback(
    async (result: DragEndResult) => {
      if (result.action === 'cancel') return
      if (result.payload.kind !== 'memo-folder') return

      if (result.action === 'delete') {
        setMutating(true)
        setError(null)
        try {
          await deleteFolder(result.payload.id)
          setFolders((prev) => prev.filter((f) => f.id !== result.payload.id))
          setRecords((prev) =>
            prev.filter((r) => r.folder_id !== result.payload.id),
          )
        } catch (err) {
          setError(toUserMessage(err, '削除に失敗しました。'))
        } finally {
          setMutating(false)
        }
        return
      }

      if (result.action === 'reorder') {
        const prev = folders
        const ids = reorderIds(
          prev.map((f) => f.id),
          result.payload.id,
          result.beforeId,
        )
        const map = new Map(prev.map((f) => [f.id, f]))
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
          setError(toUserMessage(err, '並べ替えの保存に失敗しました。'))
          void load({ silent: true })
        }
      }
    },
    [folders, load],
  )

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
            フォルダタブと同じ棚を使います。既存フォルダを選ぶか、新しい名前で追加してください。ドラッグで並べ替え、右下のゴミ箱へ落とすと削除できます。
          </p>
        </div>

        <div className="space-y-2">
          <form
            onSubmit={handlePickExisting}
            className="flex flex-col gap-2 sm:flex-row"
          >
            <select
              value={pickId}
              onChange={(e) => setPickId(e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-stone-500"
              disabled={mutating || folders.length === 0}
            >
              <option value="">フォルダから選ぶ…</option>
              {foldersForPick.map((f) => (
                <option key={f.id} value={f.id}>
                  {parseFolderName(f.name).displayName}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={mutating || !pickId}
              className="shrink-0 rounded-md border border-stone-300 bg-white px-4 py-2 text-sm text-stone-800 hover:bg-stone-50 disabled:opacity-50"
            >
              開く
            </button>
          </form>

          <form
            onSubmit={(e) => void handleCreate(e)}
            className="flex flex-col gap-2 sm:flex-row"
          >
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="新規フォルダ名（例: 鶏むね / 牛乳（ぎゅうにゅう））"
              list="memo-folder-suggestions"
              className="min-w-0 flex-1 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-stone-500"
              disabled={mutating}
            />
            <datalist id="memo-folder-suggestions">
              {foldersForPick.map((f) => (
                <option
                  key={f.id}
                  value={parseFolderName(f.name).displayName}
                />
              ))}
            </datalist>
            <button
              type="submit"
              disabled={mutating || !newName.trim()}
              className="shrink-0 rounded-md bg-stone-900 px-4 py-2 text-sm text-white hover:bg-stone-800 disabled:opacity-50"
            >
              新規追加
            </button>
          </form>
        </div>

        {error && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        {info && (
          <p className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
            {info}
          </p>
        )}

        {isLoading ? (
          <p className="text-sm text-stone-500">読み込み中...</p>
        ) : folders.length === 0 ? (
          <p className="rounded-md border border-dashed border-stone-300 bg-white/60 px-4 py-8 text-center text-sm text-stone-500">
            まだメモがありません。上から追加するか、フォルダタブで棚を作ってください。
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-stone-600">{folders.length} 件のメモ</p>
            <ul className="space-y-2">
              {folders.map((folder, index) => (
                <FolderMemoCard
                  key={folder.id}
                  folderId={folder.id}
                  folderName={folder.name}
                  records={byFolder.get(folder.id) ?? []}
                  colorClass={MEMO_PALETTES[index % MEMO_PALETTES.length]}
                  forceOpen={focusFolderId === folder.id}
                  onForceOpenHandled={clearFocusFolder}
                  rootRef={(el) => {
                    if (el) cardRefs.current.set(folder.id, el)
                    else cardRefs.current.delete(folder.id)
                  }}
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
