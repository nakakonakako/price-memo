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
  const isMobile = useMediaQuery('(max-width: 1023px)')
  const [allFolders, setAllFolders] = useState<PriceFolder[]>([])
  const [memoItems, setMemoItems] = useState<PriceMemoItem[]>([])
  const [records, setRecords] = useState<PriceRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [pickQuery, setPickQuery] = useState('')
  const [mutating, setMutating] = useState(false)
  const [focusFolderId, setFocusFolderId] = useState<string | null>(null)
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
    const q = pickQuery.trim().toLocaleLowerCase('ja')
    if (!q) return []
    return foldersForPick.filter((f) => {
      const { displayName, reading } = parseFolderName(f.name)
      const hay = `${displayName} ${reading ?? ''} ${f.name}`.toLocaleLowerCase(
        'ja',
      )
      return hay.includes(q)
    })
  }, [foldersForPick, pickQuery])

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
    setInfo(null)
    try {
      await putOnMemo(folder)
      setPickQuery('')
      focusFolder(folder.id)
      setInfo(
        `「${parseFolderName(folder.name).displayName}」をメモに追加しました。`,
      )
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
    setInfo(null)
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
        setInfo(
          existing
            ? `既存フォルダ「${parseFolderName(folder.name).displayName}」をメモに追加しました。`
            : null,
        )
      } else {
        setInfo(
          `「${parseFolderName(folder.name).displayName}」はすでにメモにあります。`,
        )
      }
      setNewName('')
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
      <section className="space-y-6 pb-44">
        <div className="space-y-2">
          <h2 className="text-lg font-medium text-stone-900">買い物メモ</h2>
          <p className="text-sm text-stone-600">
            店頭用のリストです。フォルダタブの棚から選ぶか、新規名で追加できます。統計の保存はフォルダ側の記録になります。
            {isMobile
              ? '左にスワイプするとメモから外れるだけで、フォルダ自体は残ります。'
              : 'ゴミ箱へ落とすとメモから外れるだけで、フォルダ自体は残ります。'}
          </p>
        </div>

        <div className="space-y-3">
          <div className="space-y-2">
            <label className="text-sm font-medium text-stone-800">
              フォルダからメモに追加
            </label>
            <input
              type="search"
              value={pickQuery}
              onChange={(e) => setPickQuery(e.target.value)}
              placeholder="フォルダ名で検索"
              className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-stone-500"
              disabled={mutating}
            />
            {allFolders.length > 0 && foldersForPick.length === 0 ? (
              <p className="text-sm text-stone-500">
                追加できるフォルダはありません（すべてメモに載っています）。
              </p>
            ) : !pickQuery.trim() ? (
              <p className="text-sm text-stone-500">
                フォルダ名を入力すると候補が表示されます。
              </p>
            ) : pickableFolders.length === 0 ? (
              <p className="text-sm text-stone-500">
                一致するフォルダがありません。
              </p>
            ) : (
              <ul
                className="max-h-48 divide-y divide-stone-100 overflow-y-auto rounded-md border border-stone-200 bg-white"
              >
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
            )}
          </div>

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
              {allFolders.map((f) => (
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
        ) : memoItems.length === 0 ? (
          <p className="rounded-md border border-dashed border-stone-300 bg-white/60 px-4 py-8 text-center text-sm text-stone-500">
            まだメモがありません。フォルダから選ぶか、新規追加してください。
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-stone-600">{memoItems.length} 件のメモ</p>
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
          </div>
        )}
      </section>
  )

  if (isMobile) {
    return page
  }

  return (
    <TrashDragProvider onDragEnd={handleDragEnd} trashSize="memo">
      <MemoListRegistrar ids={dragIds} />
      {page}
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
