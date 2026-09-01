import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import { TrashDragProvider, MemoTrashZone } from '@/components/trash/TrashDragProvider'
import type { DragEndResult } from '@/components/trash/types'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { createFolder, listFolders } from '@/features/folders/api/foldersApi'
import type { PriceFolder } from '@/features/folders/types'
import {
  folderSortKey,
  parseFolderName,
} from '@/features/folders/utils/folderName'
import { listAllRecords } from '@/features/records/api/recordsApi'
import type { PriceRecord } from '@/features/records/types'
import { reorderIds } from '@/lib/listOrder'
import { equalsSearchQuery, matchesSearchQuery } from '@/lib/kanaSearch'
import { toUserMessage } from '@/lib/userError'
import {
  addMemoItem,
  listMemoItems,
  removeMemoItem,
  reorderMemoItems,
  type PriceMemoItem,
} from '../api/memoApi'
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

function findFolderByInput(
  folders: PriceFolder[],
  input: string,
): PriceFolder | undefined {
  const q = input.trim()
  if (!q) return undefined
  return folders.find((f) => {
    const { displayName } = parseFolderName(f.name)
    return equalsSearchQuery(f.name, q) || equalsSearchQuery(displayName, q)
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
  const isMobile = useMediaQuery('(max-width: 1023px)')
  const [allFolders, setAllFolders] = useState<PriceFolder[]>([])
  const [memoItems, setMemoItems] = useState<PriceMemoItem[]>([])
  const [records, setRecords] = useState<PriceRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [mutating, setMutating] = useState(false)
  const [focusFolderId, setFocusFolderId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const cardRefs = useRef(new Map<string, HTMLElement>())

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setIsLoading(true)
    setError(null)
    try {
      const [folderList, memoList, recordList] = await Promise.all([
        listFolders(),
        listMemoItems(),
        listAllRecords(),
      ])
      setAllFolders(folderList)
      setMemoItems(memoList)
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
  const memoFolderIds = useMemo(
    () => new Set(memoItems.map((m) => m.folder_id)),
    [memoItems],
  )
  const dragIds = useMemo(
    () => memoItems.map((m) => m.folder_id),
    [memoItems],
  )

  const foldersForPick = useMemo(() => {
    return allFolders
      .filter((f) => !memoFolderIds.has(f.id))
      .sort((a, b) =>
        nameCollator.compare(folderSortKey(a.name), folderSortKey(b.name)),
      )
  }, [allFolders, memoFolderIds])

  const pickableFolders = useMemo(() => {
    const q = newName.trim()
    if (!q) return []
    return foldersForPick.filter((f) => {
      const { displayName, reading } = parseFolderName(f.name)
      const hay = `${displayName} ${reading ?? ''} ${f.name}`
      return matchesSearchQuery(hay, q)
    })
  }, [foldersForPick, newName])

  const clearFocusFolder = useCallback(() => {
    setFocusFolderId(null)
  }, [])

  const focusFolder = useCallback((folderId: string) => {
    setFocusFolderId(folderId)
    setError(null)
    requestAnimationFrame(() => {
      const el = cardRefs.current.get(folderId)
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
  }, [])

  const putOnMemo = useCallback(async (folder: PriceFolder) => {
    const item = await addMemoItem(folder.id)
    setMemoItems((prev) => {
      if (prev.some((m) => m.folder_id === folder.id)) return prev
      return [...prev, item]
    })
    return item
  }, [])

  const addFolderToMemo = async (folder: PriceFolder) => {
    setMutating(true)
    setError(null)
    try {
      await putOnMemo(folder)
      setNewName('')
      setAddOpen(false)
      focusFolder(folder.id)
    } catch (err) {
      setError(toUserMessage(err, 'メモへの追加に失敗しました。'))
    } finally {
      setMutating(false)
    }
  }

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    const trimmed = newName.trim()
    if (!trimmed) return
    setError(null)
    setMutating(true)
    try {
      const existing = findFolderByInput(allFolders, trimmed)
      let folder = existing
      if (!folder) {
        folder = await createFolder(trimmed)
        setAllFolders((prev) => [...prev, folder!])
      }

      const alreadyOnMemo = memoFolderIds.has(folder.id)
      if (!alreadyOnMemo) {
        await putOnMemo(folder)
      }
      setNewName('')
      setAddOpen(false)
      focusFolder(folder.id)
    } catch (err) {
      setError(toUserMessage(err, '追加に失敗しました。'))
    } finally {
      setMutating(false)
    }
  }

  const removeFromMemo = useCallback(async (folderId: string) => {
    setMutating(true)
    setError(null)
    try {
      await removeMemoItem(folderId)
      setMemoItems((prev) => prev.filter((m) => m.folder_id !== folderId))
    } catch (err) {
      setError(toUserMessage(err, 'メモからの削除に失敗しました。'))
    } finally {
      setMutating(false)
    }
  }, [])

  const handleDragEnd = useCallback(
    async (result: DragEndResult) => {
      if (result.action === 'cancel') return
      if (result.payload.kind !== 'memo-folder') return

      if (result.action === 'delete') {
        await removeFromMemo(result.payload.id)
        return
      }

      if (result.action === 'reorder') {
        const prev = memoItems
        const ids = reorderIds(
          prev.map((m) => m.folder_id),
          result.payload.id,
          result.beforeId,
        )
        const map = new Map(prev.map((m) => [m.folder_id, m]))
        const next = ids
          .map((folderId, sort_order) => {
            const m = map.get(folderId)
            return m ? { ...m, sort_order } : null
          })
          .filter((m): m is PriceMemoItem => m != null)
        setMemoItems(next)
        try {
          await reorderMemoItems(ids)
        } catch (err) {
          setError(toUserMessage(err, '並べ替えの保存に失敗しました。'))
          void load({ silent: true })
        }
      }
    },
    [load, memoItems, removeFromMemo],
  )

  const handleSaved = (record: PriceRecord) => {
    setRecords((prev) => [record, ...prev])
  }

  const page = (
      <section className="space-y-4 pb-44 lg:pb-4">
        <button
          type="button"
          onClick={() => setAddOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 hover:bg-stone-50"
          aria-expanded={addOpen}
        >
          <span className="text-base leading-none" aria-hidden>
            ＋
          </span>
          メモを追加
        </button>

        {addOpen && (
          <div className="space-y-2 rounded-lg border border-stone-200 bg-white/80 p-3">
            <form
              onSubmit={(e) => void handleCreate(e)}
              className="flex flex-col gap-2 sm:flex-row"
            >
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="品目名（例: 鶏むね / 牛乳（ぎゅうにゅう））"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                className="min-w-0 flex-1 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-stone-500"
                disabled={mutating}
                autoFocus
              />
              <button
                type="submit"
                disabled={mutating || !newName.trim()}
                className="shrink-0 rounded-md bg-stone-900 px-4 py-2 text-sm text-white hover:bg-stone-800 disabled:opacity-50"
              >
                追加
              </button>
            </form>
            {allFolders.length > 0 && foldersForPick.length === 0 ? (
              <p className="text-sm text-stone-500">
                追加できるフォルダはありません
              </p>
            ) : newName.trim() && pickableFolders.length > 0 ? (
              <ul className="max-h-48 divide-y divide-stone-100 overflow-y-auto rounded-md border border-stone-200 bg-white">
                {pickableFolders.map((f) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      disabled={mutating}
                      onClick={() => void addFolderToMemo(f)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm hover:bg-stone-50 disabled:opacity-50"
                    >
                      <span className="min-w-0 truncate font-medium text-stone-900">
                        {parseFolderName(f.name).displayName}
                      </span>
                      <span className="shrink-0 text-xs text-stone-500">
                        メモに追加
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : newName.trim() && foldersForPick.length > 0 ? (
              <p className="text-sm text-stone-500">
                一致するフォルダがありません。追加ボタンで新規作成できます。
              </p>
            ) : null}
          </div>
        )}

        {error && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {isLoading ? (
          <p className="text-sm text-stone-500">読み込み中...</p>
        ) : memoItems.length === 0 ? (
          <p className="rounded-md border border-dashed border-stone-300 bg-white/60 px-4 py-8 text-center text-sm text-stone-500">
            まだメモがありません
          </p>
        ) : (
          <ul className="space-y-2">
              {memoItems.map((item, index) => (
                <FolderMemoCard
                  key={item.id}
                  folderId={item.folder_id}
                  folderName={item.folder.name}
                  records={byFolder.get(item.folder_id) ?? []}
                  colorClass={MEMO_PALETTES[index % MEMO_PALETTES.length]}
                  forceOpen={focusFolderId === item.folder_id}
                  onForceOpenHandled={clearFocusFolder}
                  rootRef={(el) => {
                    if (el) cardRefs.current.set(item.folder_id, el)
                    else cardRefs.current.delete(item.folder_id)
                  }}
                  onSaved={handleSaved}
                  dragEnabled={!isMobile}
                  onRemoveFromMemo={() => void removeFromMemo(item.folder_id)}
                />
              ))}
              {!isMobile && (
                <MemoListEndMarker
                  lastId={memoItems[memoItems.length - 1]?.folder_id ?? null}
                />
              )}
            </ul>
        )}
      </section>
  )

  if (isMobile) {
    return page
  }

  return (
    <TrashDragProvider onDragEnd={handleDragEnd} trashPlacement="external">
      <MemoListRegistrar ids={dragIds} />
      {page}
      <MemoTrashZone />
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
