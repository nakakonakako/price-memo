import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import { ScrollToTopButton } from '@/components/ScrollToTopButton'
import { TrashDragProvider, MemoTrashZone } from '@/components/trash/TrashDragProvider'
import type { DragEndResult } from '@/components/trash/types'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { createFolder, listFolders } from '@/features/folders/api/foldersApi'
import type { PriceFolder } from '@/features/folders/types'
import {
  folderSortKey,
  parseFolderName,
} from '@/features/folders/utils/folderName'
import { listRecords, listRecordsForFolders } from '@/features/records/api/recordsApi'
import type { PriceRecord } from '@/features/records/types'
import { reorderIds } from '@/lib/listOrder'
import { equalsSearchQuery, matchesSearchQuery } from '@/lib/kanaSearch'
import { toUserMessage } from '@/lib/userError'
import { getCurrentAuthUserId } from '@/lib/authIdentity'
import {
  getCatalogRevisions,
  subscribeFolderDeleted,
} from '@/lib/catalogSync'
import { useAuth } from '@/contexts/AuthContext'
import {
  addMemoItem,
  isMemoReorderStaleError,
  listMemoItems,
  removeMemoItem,
  reorderMemoItems,
  type PriceMemoItem,
} from '../api/memoApi'
import { recordsByFolderId } from '../utils/stats'
import { FolderMemoCard } from './FolderMemoCard'
import { useTrashDrag } from '@/components/trash/TrashDragContext'

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

const MEMO_REORDER_STALE_MESSAGE =
  'メモの一覧が変更されました。もう一度並べ替えてください。'

function reorderFailureMessage(err: unknown): string {
  if (isMemoReorderStaleError(err)) return MEMO_REORDER_STALE_MESSAGE
  return toUserMessage(err, '並べ替えの保存に失敗しました。')
}

function preserveCurrentMemoOrder(
  serverItems: PriceMemoItem[],
  currentItems: PriceMemoItem[],
): PriceMemoItem[] {
  const serverByFolderId = new Map(
    serverItems.map((item) => [item.folder_id, item]),
  )
  const currentIds = new Set(currentItems.map((item) => item.folder_id))
  const currentOrder = currentItems
    .map((item) => serverByFolderId.get(item.folder_id))
    .filter((item): item is PriceMemoItem => item != null)
  const newlyAdded = serverItems.filter(
    (item) => !currentIds.has(item.folder_id),
  )
  return [...currentOrder, ...newlyAdded]
}

function hasDeletedFolder(
  folderId: string,
  folderList: PriceFolder[],
  memoList: PriceMemoItem[],
): boolean {
  return (
    folderList.some((folder) => folder.id === folderId) ||
    memoList.some((item) => item.folder_id === folderId)
  )
}

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

export function ShoppingMemoPage({
  active = true,
  onOpenFolder,
}: {
  active?: boolean
  onOpenFolder?: (folderId: string) => void
}) {
  const { session } = useAuth()
  const authUserId = session?.user?.id ?? null
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
  const loadGenerationRef = useRef(0)
  const reorderGenerationRef = useRef(0)
  const reorderInFlightRef = useRef(false)
  const catalogRevSeen = useRef<ReturnType<typeof getCatalogRevisions> | null>(
    null,
  )
  const deletedFolderTombstonesRef = useRef(new Set<string>())

  const withoutTombstonedFolders = useCallback(
    <T extends { id: string }>(folders: T[]): T[] => {
      const tombstones = deletedFolderTombstonesRef.current
      if (tombstones.size === 0) return folders
      return folders.filter((f) => !tombstones.has(f.id))
    },
    [],
  )

  const withoutTombstonedMemoItems = useCallback(
    (items: PriceMemoItem[]): PriceMemoItem[] => {
      const tombstones = deletedFolderTombstonesRef.current
      if (tombstones.size === 0) return items
      return items.filter((m) => !tombstones.has(m.folder_id))
    },
    [],
  )

  const withoutTombstonedRecords = useCallback(
    (rows: PriceRecord[]): PriceRecord[] => {
      const tombstones = deletedFolderTombstonesRef.current
      if (tombstones.size === 0) return rows
      return rows.filter((r) => !tombstones.has(r.folder_id))
    },
    [],
  )

  const load = useCallback(
    async (opts?: {
      silent?: boolean
      preserveError?: boolean
    }): Promise<'ok' | 'aborted' | 'error'> => {
      const generation = loadGenerationRef.current
      const reorderGeneration = reorderGenerationRef.current
      const userIdAtStart = getCurrentAuthUserId()
      if (!userIdAtStart) return 'aborted'
      if (!opts?.silent) setIsLoading(true)
      if (!opts?.preserveError) setError(null)
      try {
        const fetchSnapshot = async () => {
          const [folderList, memoList] = await Promise.all([
            listFolders(),
            listMemoItems(),
          ])
          const recordList = await listRecordsForFolders(
            memoList.map((m) => m.folder_id),
          )
          return { folderList, memoList, recordList }
        }
        let { folderList, memoList, recordList } = await fetchSnapshot()
        if (
          loadGenerationRef.current !== generation ||
          getCurrentAuthUserId() !== userIdAtStart
        ) {
          return 'aborted'
        }

        const tombstones = [...deletedFolderTombstonesRef.current]
        const returnedDeletedFolders = tombstones.filter((folderId) =>
          hasDeletedFolder(folderId, folderList, memoList),
        )
        if (returnedDeletedFolders.length > 0) {
          const retrySnapshot = await fetchSnapshot()
          folderList = retrySnapshot.folderList
          memoList = retrySnapshot.memoList
          recordList = retrySnapshot.recordList
          if (
            loadGenerationRef.current !== generation ||
            getCurrentAuthUserId() !== userIdAtStart
          ) {
            return 'aborted'
          }
          const stillPresent = returnedDeletedFolders.filter((folderId) =>
            hasDeletedFolder(folderId, folderList, memoList),
          )
          for (const folderId of stillPresent) {
            deletedFolderTombstonesRef.current.delete(folderId)
          }
          if (stillPresent.length > 0) {
            setError(
              '削除したフォルダがサーバーに残っています。状態を確認して再読み込みしてください。',
            )
          }
        }
        for (const folderId of tombstones) {
          deletedFolderTombstonesRef.current.delete(folderId)
        }

        setAllFolders(withoutTombstonedFolders(folderList))
        setMemoItems((current) => {
          const visible = withoutTombstonedMemoItems(memoList)
          return reorderGenerationRef.current !== reorderGeneration
            ? preserveCurrentMemoOrder(visible, current)
            : visible
        })
        setRecords(withoutTombstonedRecords(recordList))
        return 'ok'
      } catch (err) {
        if (
          loadGenerationRef.current !== generation ||
          getCurrentAuthUserId() !== userIdAtStart
        ) {
          return 'aborted'
        }
        const message = toUserMessage(err, '読み込みに失敗しました。')
        setError((current) =>
          opts?.preserveError && current
            ? `${current} 最新の一覧を再取得できませんでした。`
            : message,
        )
        return 'error'
      } finally {
        if (
          loadGenerationRef.current === generation &&
          getCurrentAuthUserId() === userIdAtStart &&
          !opts?.silent
        ) {
          setIsLoading(false)
        }
      }
    },
    [
      withoutTombstonedFolders,
      withoutTombstonedMemoItems,
      withoutTombstonedRecords,
    ],
  )

  const refreshAfterMemoMutation = useCallback(() => {
    loadGenerationRef.current += 1
    reorderGenerationRef.current += 1
    reorderInFlightRef.current = false
    void load({ silent: true })
  }, [load])

  useEffect(() => {
    if (!authUserId) return
    return subscribeFolderDeleted((event) => {
      if (
        event.userId !== authUserId ||
        event.userId !== getCurrentAuthUserId()
      ) {
        return
      }
      const revisionAtDelete = getCatalogRevisions()
      const revisionBeforeDelete = catalogRevSeen.current
      deletedFolderTombstonesRef.current.add(event.folderId)
      loadGenerationRef.current += 1
      reorderGenerationRef.current += 1
      reorderInFlightRef.current = false
      catalogRevSeen.current = revisionAtDelete
      setAllFolders((prev) => prev.filter((f) => f.id !== event.folderId))
      setMemoItems((prev) => prev.filter((m) => m.folder_id !== event.folderId))
      setRecords((prev) => prev.filter((r) => r.folder_id !== event.folderId))
      setError(null)

      const generation = loadGenerationRef.current
      void load({ silent: true }).then((result) => {
        if (
          result === 'error' &&
          loadGenerationRef.current === generation &&
          getCurrentAuthUserId() === authUserId
        ) {
          const current = getCatalogRevisions()
          catalogRevSeen.current = {
            ...current,
            folders:
              (revisionBeforeDelete?.folders ?? revisionAtDelete.folders - 1),
          }
        }
      })
    })
  }, [authUserId, load])

  useEffect(() => {
    loadGenerationRef.current += 1
    reorderGenerationRef.current += 1
    reorderInFlightRef.current = false
    deletedFolderTombstonesRef.current = new Set()

    if (!authUserId) {
      catalogRevSeen.current = null
      const generation = loadGenerationRef.current
      void Promise.resolve().then(() => {
        if (
          loadGenerationRef.current !== generation ||
          getCurrentAuthUserId() !== null
        ) {
          return
        }
        setAllFolders([])
        setMemoItems([])
        setRecords([])
        setError(null)
        setIsLoading(false)
      })
      return
    }

    void (async () => {
      setIsLoading(true)
      setError(null)
      setAllFolders([])
      setMemoItems([])
      setRecords([])
      const result = await load()
      if (result === 'ok') {
        catalogRevSeen.current = getCatalogRevisions()
      }
    })()
  }, [authUserId, load])

  useEffect(() => {
    if (!active) return
    const cur = getCatalogRevisions()
    if (catalogRevSeen.current == null) {
      catalogRevSeen.current = cur
      return
    }
    const prev = catalogRevSeen.current
    const foldersChanged = cur.folders !== prev.folders
    const recordsChanged = cur.records !== prev.records
    catalogRevSeen.current = cur

    if (!foldersChanged && !recordsChanged) return

    if (foldersChanged) {
      loadGenerationRef.current += 1
      void (async () => {
        const result = await load({ silent: true })
        if (result === 'ok') {
          catalogRevSeen.current = getCatalogRevisions()
        } else if (result === 'error') {
          catalogRevSeen.current = prev
        }
      })()
      return
    }

    if (recordsChanged) {
      const generation = loadGenerationRef.current
      const reorderGeneration = reorderGenerationRef.current
      const userIdAtStart = getCurrentAuthUserId()
      if (!userIdAtStart) return
      void listMemoItems()
        .then((memoList) => {
          if (
            loadGenerationRef.current !== generation ||
            getCurrentAuthUserId() !== userIdAtStart
          ) {
            return null
          }
          const visible = withoutTombstonedMemoItems(memoList)
          setMemoItems((current) =>
            reorderGenerationRef.current !== reorderGeneration
              ? preserveCurrentMemoOrder(visible, current)
              : visible,
          )
          return listRecordsForFolders(visible.map((m) => m.folder_id))
        })
        .then((recordList) => {
          if (
            recordList == null ||
            loadGenerationRef.current !== generation ||
            getCurrentAuthUserId() !== userIdAtStart
          ) {
            return
          }
          setRecords(withoutTombstonedRecords(recordList))
        })
        .catch((err: unknown) => {
          if (
            loadGenerationRef.current === generation &&
            getCurrentAuthUserId() === userIdAtStart
          ) {
            setError(toUserMessage(err, '読み込みに失敗しました。'))
          }
        })
    }
  }, [
    active,
    load,
    withoutTombstonedMemoItems,
    withoutTombstonedRecords,
  ])

  const mergeFolderRecords = useCallback(async (folderId: string) => {
    const generation = loadGenerationRef.current
    const userIdAtStart = getCurrentAuthUserId()
    const rows = await listRecords(folderId)
    if (
      generation !== loadGenerationRef.current ||
      userIdAtStart !== getCurrentAuthUserId() ||
      deletedFolderTombstonesRef.current.has(folderId)
    ) {
      return
    }
    setRecords((prev) =>
      withoutTombstonedRecords([
        ...rows,
        ...prev.filter((r) => r.folder_id !== folderId),
      ]),
    )
  }, [withoutTombstonedRecords])

  const interactionsLocked = mutating

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

  const putOnMemo = useCallback(
    async (folder: PriceFolder) => {
      const item = await addMemoItem(folder.id)
      setMemoItems((prev) => {
        if (deletedFolderTombstonesRef.current.has(folder.id)) return prev
        if (prev.some((m) => m.folder_id === folder.id)) return prev
        return [item, ...prev]
      })
      refreshAfterMemoMutation()
      await mergeFolderRecords(folder.id)
      return item
    },
    [mergeFolderRecords, refreshAfterMemoMutation],
  )

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
    if (interactionsLocked) return
    setMutating(true)
    setError(null)
    try {
      await removeMemoItem(folderId)
      refreshAfterMemoMutation()
      setMemoItems((prev) => prev.filter((m) => m.folder_id !== folderId))
      setRecords((prev) => prev.filter((r) => r.folder_id !== folderId))
    } catch (err) {
      setError(toUserMessage(err, 'メモからの削除に失敗しました。'))
    } finally {
      setMutating(false)
    }
  }, [interactionsLocked, refreshAfterMemoMutation])

  const handleDragEnd = useCallback(
    async (result: DragEndResult) => {
      if (interactionsLocked) return
      if (result.action === 'cancel') return
      if (result.payload.kind !== 'memo-folder') return

      if (result.action === 'delete') {
        if (reorderInFlightRef.current) return
        await removeFromMemo(result.payload.id)
        return
      }

      if (result.action === 'reorder') {
        if (reorderInFlightRef.current) return

        const userIdAtStart = getCurrentAuthUserId()
        if (!userIdAtStart) return

        const prev = memoItems
        const expectedIds = prev.map((m) => m.folder_id)
        const ids = reorderIds(expectedIds, result.payload.id, result.beforeId)
        if (ids.length === expectedIds.length && ids.every((id, i) => id === expectedIds[i])) {
          return
        }
        const reorderGeneration = reorderGenerationRef.current + 1
        reorderGenerationRef.current = reorderGeneration
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
            return
          }
        } catch (err) {
          if (
            reorderGenerationRef.current !== reorderGeneration ||
            getCurrentAuthUserId() !== userIdAtStart
          ) {
            return
          }
          setError(reorderFailureMessage(err))
          reorderGenerationRef.current += 1
          reorderInFlightRef.current = false
          loadGenerationRef.current += 1
          await load({ silent: true, preserveError: true })
        } finally {
          if (reorderGenerationRef.current === reorderGeneration) {
            reorderInFlightRef.current = false
          }
        }
      }
    },
    [interactionsLocked, load, memoItems, removeFromMemo],
  )

  const handleSaved = (record: PriceRecord) => {
    if (deletedFolderTombstonesRef.current.has(record.folder_id)) return
    setRecords((prev) => withoutTombstonedRecords([record, ...prev]))
  }

  const page = (
      <section className="space-y-4 pb-44 lg:pb-4">
        <ScrollToTopButton />
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
                disabled={interactionsLocked}
                autoFocus
              />
              <button
                type="submit"
                disabled={interactionsLocked || !newName.trim()}
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
                      disabled={interactionsLocked}
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
          <ul
            className="space-y-2"
          >
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
                  dragEnabled={!isMobile && !interactionsLocked}
                  onRemoveFromMemo={() => void removeFromMemo(item.folder_id)}
                  onOpenFolder={
                    onOpenFolder
                      ? () => onOpenFolder(item.folder_id)
                      : undefined
                  }
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
