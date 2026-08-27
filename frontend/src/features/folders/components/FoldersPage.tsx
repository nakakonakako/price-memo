import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { EditIconButton } from '@/components/EditIconButton'
import { Modal } from '@/components/Modal'
import { TrashDragItem } from '@/components/trash/TrashDragItem'
import {
  TrashDragProvider,
  useTrashDrag,
} from '@/components/trash/TrashDragProvider'
import type { DragEndResult, TrashDragPayload } from '@/components/trash/types'
import { useOutsidePointerDown } from '@/hooks/useOutsidePointerDown'
import { reorderIds } from '@/lib/listOrder'
import {
  createRecord,
  deleteRecord,
  listAllRecords,
  listRecords,
  reorderRecords,
  updateRecord,
} from '@/features/records/api/recordsApi'
import {
  RecordForm,
  recordToFormState,
} from '@/features/records/components/RecordForm'
import type { PriceRecord } from '@/features/records/types'
import {
  formatYen,
  unitLabel,
  unitPrice,
} from '@/features/records/utils/unitPrice'
import { toUserMessage } from '@/lib/userError'
import {
  createStore,
  deleteStore,
  listStores,
  renameStore,
} from '@/features/stores/api/storesApi'
import type { PriceStore } from '@/features/stores/types'
import { useFolders } from '../hooks/useFolders'
import type { PriceFolder } from '../types'
import { folderSortKey, parseFolderName } from '../utils/folderName'

type CatalogView = 'folder' | 'store'
type CatalogSort = 'added' | 'name'

const nameCollator = new Intl.Collator('ja', {
  numeric: true,
  sensitivity: 'base',
})

function ListRegistrar({
  kind,
  ids,
  scope,
}: {
  kind: TrashDragPayload['kind']
  ids: string[]
  scope?: string
}) {
  const { registerList } = useTrashDrag()
  useEffect(() => {
    registerList(kind, ids, scope)
  }, [kind, ids, scope, registerList])
  return null
}

function DropEndMarker({
  kind,
  lastId,
  className = 'h-1 rounded-full bg-stone-800',
}: {
  kind: TrashDragPayload['kind']
  lastId: string | null
  className?: string
}) {
  const { insertBeforeId, activeId, activeKind, dragOverTrash, dragging } =
    useTrashDrag()
  if (!dragging || dragOverTrash || activeKind !== kind) return null
  if (insertBeforeId !== null) return null
  if (lastId != null && activeId === lastId) return null
  return <div className={className} aria-hidden />
}

export function FoldersPage() {
  const {
    folders,
    isLoading,
    isMutating,
    error,
    create,
    rename,
    remove,
  } = useFolders()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [openFolderId, setOpenFolderId] = useState<string | null>(null)
  const [openFolderLoadingId, setOpenFolderLoadingId] = useState<string | null>(
    null,
  )
  const [recordsByFolder, setRecordsByFolder] = useState<
    Record<string, PriceRecord[]>
  >({})
  const [recordsError, setRecordsError] = useState<string | null>(null)
  const [editingRecord, setEditingRecord] = useState<PriceRecord | null>(null)
  const [recordCounts, setRecordCounts] = useState<Record<string, number>>({})
  const [addingFolderId, setAddingFolderId] = useState<string | null>(null)
  const [addingBusy, setAddingBusy] = useState(false)
  const [editingBusy, setEditingBusy] = useState(false)
  const [folderQuery, setFolderQuery] = useState('')
  const [folderSort, setFolderSort] = useState<CatalogSort>('added')
  const [catalogView, setCatalogView] = useState<CatalogView>('folder')
  const [stores, setStores] = useState<PriceStore[]>([])
  const [storesLoading, setStoresLoading] = useState(true)
  const [storesError, setStoresError] = useState<string | null>(null)
  const [storeQuery, setStoreQuery] = useState('')
  const [storeSort, setStoreSort] = useState<CatalogSort>('added')
  const [editingStoreId, setEditingStoreId] = useState<string | null>(null)
  const [editingStoreName, setEditingStoreName] = useState('')
  const [openStoreId, setOpenStoreId] = useState<string | null>(null)
  const [storeMutating, setStoreMutating] = useState(false)
  const [deleteConfirmStoreId, setDeleteConfirmStoreId] = useState<
    string | null
  >(null)
  const [deleteConfirmStoreBusy, setDeleteConfirmStoreBusy] = useState(false)
  const [allRecords, setAllRecords] = useState<PriceRecord[]>([])
  const [storeRecordCounts, setStoreRecordCounts] = useState<
    Record<string, number>
  >({})
  /** New folder stays beside the add tile until rename is saved (name sort). */
  const [draftFolderId, setDraftFolderId] = useState<string | null>(null)
  const [deleteConfirmFolderId, setDeleteConfirmFolderId] = useState<
    string | null
  >(null)
  const [deleteConfirmBusy, setDeleteConfirmBusy] = useState(false)

  const addingFolder = folders.find((f) => f.id === addingFolderId) ?? null
  const deleteConfirmFolder =
    folders.find((f) => f.id === deleteConfirmFolderId) ?? null
  const deleteConfirmStore =
    stores.find((s) => s.id === deleteConfirmStoreId) ?? null
  const editingRecordFolder =
    editingRecord != null
      ? (folders.find((f) => f.id === editingRecord.folder_id) ?? null)
      : null

  const visibleFolders = useMemo(() => {
    const q = folderQuery.trim().toLocaleLowerCase('ja')
    const filtered = q
      ? folders.filter((f) => {
          const { displayName, reading } = parseFolderName(f.name)
          const hay = `${displayName} ${reading ?? ''} ${f.name}`.toLocaleLowerCase(
            'ja',
          )
          return hay.includes(q)
        })
      : folders
    const rows = [...filtered]
    if (folderSort === 'name') {
      rows.sort((a, b) =>
        nameCollator.compare(folderSortKey(a.name), folderSortKey(b.name)),
      )
      if (draftFolderId) {
        const draftIdx = rows.findIndex((f) => f.id === draftFolderId)
        if (draftIdx > 0) {
          const [draft] = rows.splice(draftIdx, 1)
          rows.unshift(draft)
        }
      }
    } else {
      rows.sort((a, b) => {
        const byCreated = b.created_at.localeCompare(a.created_at)
        if (byCreated !== 0) return byCreated
        return b.id.localeCompare(a.id)
      })
    }
    return rows
  }, [draftFolderId, folderQuery, folderSort, folders])

  const visibleStores = useMemo(() => {
    const q = storeQuery.trim().toLocaleLowerCase('ja')
    const filtered = q
      ? stores.filter((s) => s.name.toLocaleLowerCase('ja').includes(q))
      : stores
    const rows = [...filtered]
    if (storeSort === 'name') {
      rows.sort((a, b) => nameCollator.compare(a.name, b.name))
    } else {
      rows.sort((a, b) => {
        const byCreated = b.created_at.localeCompare(a.created_at)
        if (byCreated !== 0) return byCreated
        return b.id.localeCompare(a.id)
      })
    }
    return rows
  }, [storeQuery, storeSort, stores])

  const refreshStores = useCallback(async () => {
    setStoresLoading(true)
    setStoresError(null)
    try {
      setStores(await listStores())
    } catch (err) {
      setStoresError(toUserMessage(err, '店舗の読み込みに失敗しました。'))
    } finally {
      setStoresLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshStores()
  }, [refreshStores])

  useEffect(() => {
    if (isLoading) return
    void listAllRecords()
      .then((records) => {
        setAllRecords(records)
        const folderCounts: Record<string, number> = {}
        const storeCounts: Record<string, number> = {}
        for (const r of records) {
          folderCounts[r.folder_id] = (folderCounts[r.folder_id] ?? 0) + 1
        }
        for (const store of stores) {
          storeCounts[store.id] = records.filter(
            (r) => r.store_name === store.name,
          ).length
        }
        setRecordCounts(folderCounts)
        setStoreRecordCounts(storeCounts)
      })
      .catch(() => {
        /* optional */
      })
  }, [isLoading, folders, stores])

  const getRecordCount = (folderId: string) => {
    if (recordsByFolder[folderId]) return recordsByFolder[folderId].length
    return recordCounts[folderId] ?? 0
  }

  const getStoreRecordCount = (storeId: string) => {
    return storeRecordCounts[storeId] ?? 0
  }

  const getStoreRecords = (storeName: string) =>
    allRecords.filter((r) => r.store_name === storeName)

  const startEditStore = (store: PriceStore) => {
    setEditingStoreId(store.id)
    setEditingStoreName(store.name)
  }

  const cancelEditStore = useCallback(() => {
    setEditingStoreId(null)
    setEditingStoreName('')
  }, [])

  const handleRenameStore = async (e: FormEvent) => {
    e.preventDefault()
    if (!editingStoreId) return
    setStoreMutating(true)
    setStoresError(null)
    try {
      const updated = await renameStore(editingStoreId, editingStoreName)
      setStores((prev) =>
        prev.map((s) => (s.id === updated.id ? updated : s)),
      )
      const fresh = await listAllRecords()
      setAllRecords(fresh)
      cancelEditStore()
    } catch (err) {
      setStoresError(toUserMessage(err, '店舗名の変更に失敗しました。'))
    } finally {
      setStoreMutating(false)
    }
  }

  const handleAddStore = async () => {
    let name = '新しい店舗'
    let n = 2
    while (stores.some((s) => s.name === name)) {
      name = `新しい店舗 ${n}`
      n += 1
    }
    setStoreMutating(true)
    setStoresError(null)
    try {
      const created = await createStore(name)
      setStores((prev) => [...prev, created])
      startEditStore(created)
    } catch (err) {
      setStoresError(toUserMessage(err, '店舗の追加に失敗しました。'))
    } finally {
      setStoreMutating(false)
    }
  }

  const confirmDeleteStore = async () => {
    if (!deleteConfirmStoreId) return
    const storeId = deleteConfirmStoreId
    setDeleteConfirmStoreBusy(true)
    try {
      await deleteStore(storeId)
      setStores((prev) => prev.filter((s) => s.id !== storeId))
      if (editingStoreId === storeId) cancelEditStore()
      if (openStoreId === storeId) setOpenStoreId(null)
      setDeleteConfirmStoreId(null)
    } catch (err) {
      setStoresError(toUserMessage(err, '店舗の削除に失敗しました。'))
    } finally {
      setDeleteConfirmStoreBusy(false)
    }
  }

  useOutsidePointerDown(editingStoreId != null, cancelEditStore)

  const toggleStoreDetail = (storeId: string) => {
    if (openStoreId === storeId) {
      setOpenStoreId(null)
      return
    }
    setOpenStoreId(storeId)
    setEditingRecord(null)
  }

  const startEdit = (folder: PriceFolder) => {
    setEditingId(folder.id)
    setEditingName(folder.name)
  }

  const cancelEdit = useCallback(() => {
    setEditingId(null)
    setEditingName('')
  }, [])

  const handleRename = async (e: FormEvent) => {
    e.preventDefault()
    if (!editingId) return
    try {
      await rename(editingId, editingName)
      setDraftFolderId((id) => (id === editingId ? null : id))
      cancelEdit()
    } catch {
      /* hook */
    }
  }

  const handleAddFolder = async () => {
    let name = '新しいフォルダ'
    let n = 2
    while (folders.some((f) => f.name === name)) {
      name = `新しいフォルダ ${n}`
      n += 1
    }
    try {
      const created = await create(name)
      setDraftFolderId(created.id)
      startEdit(created)
    } catch {
      /* hook */
    }
  }

  useOutsidePointerDown(editingId != null, cancelEdit)

  const toggleFolderDetail = async (folderId: string) => {
    if (openFolderId === folderId) {
      setOpenFolderId(null)
      return
    }

    setOpenFolderId(folderId)
    setRecordsError(null)

    if (recordsByFolder[folderId]) return

    try {
      setOpenFolderLoadingId(folderId)
      const records = await listRecords(folderId)
      setRecordsByFolder((prev) => ({ ...prev, [folderId]: records }))
      setRecordCounts((prev) => ({ ...prev, [folderId]: records.length }))
    } catch (err) {
      const msg = toUserMessage(
        err,
        'フォルダ中身の読み込みに失敗しました。',
      )
      setRecordsError(msg)
    } finally {
      setOpenFolderLoadingId(null)
    }
  }

  const patchFolderRecords = (
    folderId: string,
    updater: (rows: PriceRecord[]) => PriceRecord[],
  ) => {
    setRecordsByFolder((prev) => {
      const nextRows = updater(prev[folderId] ?? [])
      setRecordCounts((counts) => ({ ...counts, [folderId]: nextRows.length }))
      return { ...prev, [folderId]: nextRows }
    })
  }

  const finalizeFolderRemoved = useCallback(
    (folderId: string) => {
      if (editingId === folderId) cancelEdit()
      if (openFolderId === folderId) setOpenFolderId(null)
      if (editingRecord?.folder_id === folderId) setEditingRecord(null)
      setDraftFolderId((id) => (id === folderId ? null : id))
      setRecordCounts((prev) => {
        const next = { ...prev }
        delete next[folderId]
        return next
      })
      setRecordsByFolder((prev) => {
        const next = { ...prev }
        delete next[folderId]
        return next
      })
    },
    [cancelEdit, editingId, editingRecord, openFolderId],
  )

  const confirmDeleteFolder = async () => {
    if (!deleteConfirmFolderId) return
    const folderId = deleteConfirmFolderId
    setDeleteConfirmBusy(true)
    try {
      await remove(folderId)
      finalizeFolderRemoved(folderId)
      setDeleteConfirmFolderId(null)
    } catch {
      /* hook */
    } finally {
      setDeleteConfirmBusy(false)
    }
  }

  const handleDragEnd = useCallback(
    async (result: DragEndResult) => {
      if (result.action === 'cancel') return
      const payload = result.payload

      if (result.action === 'reorder') {
        if (payload.kind !== 'folder-record') return
        const rows = recordsByFolder[payload.folderId] ?? []
        const ids = reorderIds(
          rows.map((r) => r.id),
          payload.id,
          result.beforeId,
        )
        patchFolderRecords(payload.folderId, (current) => {
          const map = new Map(current.map((r) => [r.id, r]))
          return ids
            .map((id, sort_order) => {
              const r = map.get(id)
              return r ? { ...r, sort_order } : null
            })
            .filter((r): r is PriceRecord => r != null)
        })
        try {
          await reorderRecords(payload.folderId, ids)
        } catch (err) {
          setRecordsError(
            toUserMessage(err, '並べ替えの保存に失敗しました。'),
          )
          const fresh = await listRecords(payload.folderId)
          setRecordsByFolder((prev) => ({
            ...prev,
            [payload.folderId]: fresh,
          }))
        }
        return
      }

      if (result.action !== 'delete') return
      try {
        if (payload.kind === 'folder') {
          setDeleteConfirmFolderId(payload.id)
        } else if (payload.kind === 'store') {
          setDeleteConfirmStoreId(payload.id)
        } else if (payload.kind === 'folder-record') {
          await deleteRecord(payload.id)
          patchFolderRecords(payload.folderId, (rows) =>
            rows.filter((r) => r.id !== payload.id),
          )
          setAllRecords((prev) =>
            prev.filter((r) => r.id !== payload.id),
          )
          if (editingRecord?.id === payload.id) setEditingRecord(null)
        }
      } catch {
        /* hook */
      }
    },
    [editingRecord],
  )

  return (
    <TrashDragProvider
      onDragEnd={handleDragEnd}
      reorderKinds={['folder-record']}
    >
      <section className="space-y-6 pb-28">
        <div className="space-y-2">
          <h2 className="text-lg font-medium text-stone-900">フォルダ</h2>
          <p className="text-sm text-stone-600">
            品目名（フォルダ）と店名を管理し、記録の追加・編集もここから行います。先頭のカードで追加。ゴミ箱へ落とすと削除（フォルダは確認あり）。
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="flex rounded-md border border-stone-300 bg-white p-0.5">
            <button
              type="button"
              onClick={() => {
                setCatalogView('folder')
                setOpenStoreId(null)
              }}
              className={`rounded px-3 py-1.5 text-sm ${
                catalogView === 'folder'
                  ? 'bg-stone-900 text-white'
                  : 'text-stone-700 hover:bg-stone-100'
              }`}
            >
              品目名
            </button>
            <button
              type="button"
              onClick={() => {
                setCatalogView('store')
                setOpenFolderId(null)
              }}
              className={`rounded px-3 py-1.5 text-sm ${
                catalogView === 'store'
                  ? 'bg-stone-900 text-white'
                  : 'text-stone-700 hover:bg-stone-100'
              }`}
            >
              店名
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="search"
            value={catalogView === 'folder' ? folderQuery : storeQuery}
            onChange={(e) =>
              catalogView === 'folder'
                ? setFolderQuery(e.target.value)
                : setStoreQuery(e.target.value)
            }
            placeholder={
              catalogView === 'folder' ? 'フォルダ名で検索' : '店舗名で検索'
            }
            className="min-w-0 flex-1 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-stone-500"
          />
          <label className="flex shrink-0 items-center gap-2 text-sm text-stone-600">
            <span className="sr-only sm:not-sr-only">並び</span>
            <select
              value={catalogView === 'folder' ? folderSort : storeSort}
              onChange={(e) => {
                const next = e.target.value as CatalogSort
                if (catalogView === 'folder') setFolderSort(next)
                else setStoreSort(next)
              }}
              className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-stone-500"
              title={
                catalogView === 'folder'
                  ? '名前順は末尾の () / （）内の読みを優先します。'
                  : undefined
              }
            >
              <option value="added">追加順（新しい順）</option>
              <option value="name">名前順</option>
            </select>
          </label>
        </div>

        {error && catalogView === 'folder' && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        {storesError && catalogView === 'store' && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {storesError}
          </p>
        )}
        {recordsError && catalogView === 'folder' && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {recordsError}
          </p>
        )}

        {isLoading && catalogView === 'folder' ? (
          <p className="text-sm text-stone-500">読み込み中...</p>
        ) : storesLoading && catalogView === 'store' ? (
          <p className="text-sm text-stone-500">読み込み中...</p>
        ) : catalogView === 'folder' ? (
          <ul className="grid gap-4 sm:grid-cols-2">
            <li className="flex flex-col">
              <button
                type="button"
                onClick={() => void handleAddFolder()}
                disabled={isMutating}
                aria-label="フォルダを追加"
                className="relative flex min-h-[5.75rem] w-full flex-col items-center justify-center overflow-hidden rounded-lg border border-sky-200/90 bg-gradient-to-b from-sky-50 via-sky-50/90 to-sky-100/50 shadow-sm transition-shadow hover:shadow-md disabled:opacity-50"
              >
                <div
                  className="absolute left-4 top-0 h-2.5 w-14 rounded-b-sm border border-t-0 border-sky-300/70 bg-sky-200/80"
                  aria-hidden
                />
                <span
                  className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-sky-500 text-2xl font-light leading-none text-sky-700"
                  aria-hidden
                >
                  ＋
                </span>
              </button>
            </li>

            {visibleFolders.length === 0 ? (
              <li className="col-span-full rounded-md border border-dashed border-stone-300 bg-white/60 px-4 py-8 text-center text-sm text-stone-500 sm:col-span-1">
                {folderQuery.trim()
                  ? '一致するフォルダがありません。'
                  : 'まだフォルダがありません。左のカードから追加してください。'}
              </li>
            ) : (
              visibleFolders.map((folder) => {
                const isOpen = openFolderId === folder.id
                const recordCount = getRecordCount(folder.id)
                return (
                  <li key={folder.id} className="flex flex-col">
                    <TrashDragItem
                      payload={{ kind: 'folder', id: folder.id }}
                      onClick={() => {
                        if (editingId === folder.id) return
                        void toggleFolderDetail(folder.id)
                      }}
                      className={`relative flex flex-col overflow-hidden rounded-lg border shadow-sm transition-shadow ${
                        isOpen
                          ? 'border-amber-400/80 shadow-md'
                          : 'border-amber-200/90 hover:shadow-md'
                      } bg-gradient-to-b from-amber-50 via-amber-50/90 to-amber-100/40`}
                    >
                      <div
                        className="absolute left-4 top-0 h-2.5 w-14 rounded-b-sm border border-t-0 border-amber-300/70 bg-amber-200/90"
                        aria-hidden
                      />

                      <div className="flex flex-col gap-2 px-4 pb-3 pt-5">
                        {editingId === folder.id ? (
                          <form
                            data-edit-surface
                            data-no-trash-drag
                            onSubmit={(e) => void handleRename(e)}
                            className="flex min-w-0 items-center gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="text"
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              className="min-w-0 flex-1 rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-stone-500"
                              autoFocus
                              disabled={isMutating}
                            />
                            <button
                              type="submit"
                              disabled={isMutating || !editingName.trim()}
                              className="shrink-0 rounded-md bg-stone-900 px-2.5 py-1.5 text-sm text-white disabled:opacity-50"
                            >
                              保存
                            </button>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              className="shrink-0 rounded-md px-2.5 py-1.5 text-sm text-stone-600 hover:bg-white/60"
                            >
                              取消
                            </button>
                          </form>
                        ) : (
                          <div className="flex min-w-0 items-center gap-0.5">
                            <span className="min-w-0 truncate px-1 text-base font-semibold text-stone-900">
                              {parseFolderName(folder.name).displayName}
                            </span>
                            <EditIconButton
                              quiet
                              label="名前変更"
                              onClick={() => startEdit(folder)}
                              disabled={isMutating}
                            />
                            <span className="ml-auto shrink-0 tabular-nums text-sm text-stone-500">
                              {recordCount}
                            </span>
                            <span
                              className="shrink-0 text-stone-400 transition-transform"
                              style={{
                                transform: isOpen
                                  ? 'rotate(90deg)'
                                  : undefined,
                              }}
                              aria-hidden
                            >
                              ▸
                            </span>
                            <button
                              type="button"
                              aria-label="記録を追加"
                              title="記録を追加"
                              onClick={() => setAddingFolderId(folder.id)}
                              className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-md text-xl font-medium text-stone-700 hover:bg-white/70"
                            >
                              ＋
                            </button>
                          </div>
                        )}
                      </div>

                      {isOpen && (
                        <div className="border-t border-amber-200/70 bg-white/80 px-3 py-3">
                          {openFolderLoadingId === folder.id ? (
                            <p className="text-sm text-stone-500">
                              中身を読み込み中...
                            </p>
                          ) : (recordsByFolder[folder.id] ?? []).length ===
                            0 ? (
                            <p className="text-sm text-stone-500">
                              このフォルダにレコードはまだありません。「＋」から追加できます。
                            </p>
                          ) : (
                            <ul className="max-h-64 space-y-2 overflow-y-auto">
                              <ListRegistrar
                                kind="folder-record"
                                ids={(recordsByFolder[folder.id] ?? []).map(
                                  (r) => r.id,
                                )}
                                scope={folder.id}
                              />
                              {(recordsByFolder[folder.id] ?? []).map(
                                (record) => (
                                  <li key={record.id} className="list-none">
                                    <TrashDragItem
                                      payload={{
                                        kind: 'folder-record',
                                        id: record.id,
                                        folderId: folder.id,
                                      }}
                                      className="flex items-start gap-1 rounded-md border border-stone-200 bg-white px-2 py-2 sm:px-3"
                                    >
                                      <div className="min-w-0 flex-1 py-0.5">
                                        <p className="text-sm font-medium text-stone-900">
                                          {record.recorded_at} ·{' '}
                                          {record.store_name}
                                        </p>
                                        <p className="text-xs text-stone-600">
                                          {formatYen(record.price, 0)} /{' '}
                                          {record.amount}
                                          {unitLabel(record.unit)}
                                          {(() => {
                                            const per = unitPrice(
                                              record.price,
                                              record.amount,
                                            )
                                            return per != null
                                              ? `（${formatYen(per, 2)}/${unitLabel(record.unit)}）`
                                              : ''
                                          })()}
                                        </p>
                                        {record.note && (
                                          <p className="mt-1 text-xs text-stone-500">
                                            {record.note}
                                          </p>
                                        )}
                                      </div>
                                      <EditIconButton
                                        label="編集"
                                        onClick={() =>
                                          setEditingRecord(record)
                                        }
                                      />
                                    </TrashDragItem>
                                  </li>
                                ),
                              )}
                              <DropEndMarker
                                kind="folder-record"
                                lastId={
                                  (recordsByFolder[folder.id] ?? []).at(-1)
                                    ?.id ?? null
                                }
                              />
                            </ul>
                          )}
                        </div>
                      )}
                    </TrashDragItem>
                  </li>
                )
              })
            )}
          </ul>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            <li className="flex flex-col">
              <button
                type="button"
                onClick={() => void handleAddStore()}
                disabled={storeMutating}
                aria-label="店舗を追加"
                className="relative flex min-h-[5.75rem] w-full flex-col items-center justify-center overflow-hidden rounded-lg border border-sky-200/90 bg-gradient-to-b from-sky-50 via-sky-50/90 to-sky-100/50 shadow-sm transition-shadow hover:shadow-md disabled:opacity-50"
              >
                <div
                  className="absolute left-4 top-0 h-2.5 w-14 rounded-b-sm border border-t-0 border-sky-300/70 bg-sky-200/80"
                  aria-hidden
                />
                <span
                  className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-sky-500 text-2xl font-light leading-none text-sky-700"
                  aria-hidden
                >
                  ＋
                </span>
              </button>
            </li>

            {visibleStores.length === 0 ? (
              <li className="col-span-full rounded-md border border-dashed border-stone-300 bg-white/60 px-4 py-8 text-center text-sm text-stone-500 sm:col-span-1">
                {storeQuery.trim()
                  ? '一致する店舗がありません。'
                  : 'まだ店舗がありません。左のカードから追加してください。'}
              </li>
            ) : (
              visibleStores.map((store) => {
                const isOpen = openStoreId === store.id
                const recordCount = getStoreRecordCount(store.id)
                const storeRecords = getStoreRecords(store.name)
                return (
                  <li key={store.id} className="flex flex-col">
                    <TrashDragItem
                      payload={{ kind: 'store', id: store.id }}
                      onClick={() => {
                        if (editingStoreId === store.id) return
                        toggleStoreDetail(store.id)
                      }}
                      className={`relative flex flex-col overflow-hidden rounded-lg border shadow-sm transition-shadow ${
                        isOpen
                          ? 'border-emerald-400/80 shadow-md'
                          : 'border-emerald-200/90 hover:shadow-md'
                      } bg-gradient-to-b from-emerald-50 via-emerald-50/90 to-emerald-100/40`}
                    >
                      <div
                        className="absolute left-4 top-0 h-2.5 w-14 rounded-b-sm border border-t-0 border-emerald-300/70 bg-emerald-200/90"
                        aria-hidden
                      />

                      <div className="flex flex-col gap-2 px-4 pb-3 pt-5">
                        {editingStoreId === store.id ? (
                          <form
                            data-edit-surface
                            data-no-trash-drag
                            onSubmit={(e) => void handleRenameStore(e)}
                            className="flex min-w-0 items-center gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="text"
                              value={editingStoreName}
                              onChange={(e) =>
                                setEditingStoreName(e.target.value)
                              }
                              className="min-w-0 flex-1 rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-stone-500"
                              autoFocus
                              disabled={storeMutating}
                            />
                            <button
                              type="submit"
                              disabled={
                                storeMutating || !editingStoreName.trim()
                              }
                              className="shrink-0 rounded-md bg-stone-900 px-2.5 py-1.5 text-sm text-white disabled:opacity-50"
                            >
                              保存
                            </button>
                            <button
                              type="button"
                              onClick={cancelEditStore}
                              className="shrink-0 rounded-md px-2.5 py-1.5 text-sm text-stone-600 hover:bg-white/60"
                            >
                              取消
                            </button>
                          </form>
                        ) : (
                          <div className="flex min-w-0 items-center gap-0.5">
                            <span className="min-w-0 truncate px-1 text-base font-semibold text-stone-900">
                              {store.name}
                            </span>
                            <EditIconButton
                              quiet
                              label="名前変更"
                              onClick={() => startEditStore(store)}
                              disabled={storeMutating}
                            />
                            <span className="ml-auto shrink-0 tabular-nums text-sm text-stone-500">
                              {recordCount}
                            </span>
                            <span
                              className="shrink-0 text-stone-400 transition-transform"
                              style={{
                                transform: isOpen ? 'rotate(90deg)' : undefined,
                              }}
                              aria-hidden
                            >
                              ▸
                            </span>
                          </div>
                        )}
                      </div>

                      {isOpen && (
                        <div className="border-t border-emerald-200/70 bg-white/80 px-3 py-3">
                          {storeRecords.length === 0 ? (
                            <p className="text-sm text-stone-500">
                              この店舗の記録はまだありません。
                            </p>
                          ) : (
                            <ul className="max-h-64 space-y-2 overflow-y-auto">
                              {storeRecords.map((record) => (
                                <li key={record.id} className="list-none">
                                  <div className="flex items-start gap-1 rounded-md border border-stone-200 bg-white px-2 py-2 sm:px-3">
                                    <div className="min-w-0 flex-1 py-0.5">
                                      <p className="text-sm font-medium text-stone-900">
                                        {record.recorded_at} ·{' '}
                                        {parseFolderName(
                                          folders.find(
                                            (f) => f.id === record.folder_id,
                                          )?.name ?? '—',
                                        ).displayName}
                                      </p>
                                      <p className="text-xs text-stone-600">
                                        {formatYen(record.price, 0)} /{' '}
                                        {record.amount}
                                        {unitLabel(record.unit)}
                                      </p>
                                    </div>
                                    <EditIconButton
                                      label="編集"
                                      onClick={() => setEditingRecord(record)}
                                    />
                                  </div>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </TrashDragItem>
                  </li>
                )
              })
            )}
          </ul>
        )}
      </section>

      <Modal
        title="記録を追加"
        open={addingFolder != null}
        onClose={() => setAddingFolderId(null)}
      >
        {addingFolder && (
          <RecordForm
            key={`add-${addingFolder.id}`}
            folderId={addingFolder.id}
            folderName={addingFolder.name}
            preferredUnits={[
              ...new Set(
                (recordsByFolder[addingFolder.id] ?? []).map((r) => r.unit),
              ),
            ]}
            busy={addingBusy}
            onCancel={() => setAddingFolderId(null)}
            onSubmit={async (input) => {
              setAddingBusy(true)
              try {
                const created = await createRecord(input)
                patchFolderRecords(addingFolder.id, (rows) => [
                  ...rows,
                  created,
                ])
                setAllRecords((prev) => [created, ...prev])
                if (openFolderId !== addingFolder.id) {
                  setOpenFolderId(addingFolder.id)
                }
                setAddingFolderId(null)
              } finally {
                setAddingBusy(false)
              }
            }}
          />
        )}
      </Modal>

      <Modal
        title="記録を編集"
        open={editingRecord != null}
        onClose={() => setEditingRecord(null)}
      >
        {editingRecord && (
          <RecordForm
            key={editingRecord.id}
            mode="edit"
            folderId={editingRecord.folder_id}
            folderName={editingRecordFolder?.name}
            initial={recordToFormState(editingRecord)}
            preferredUnits={[
              ...new Set(
                (
                  recordsByFolder[editingRecord.folder_id] ?? [editingRecord]
                ).map((r) => r.unit),
              ),
            ]}
            busy={editingBusy}
            onCancel={() => setEditingRecord(null)}
            onSubmit={async (input) => {
              setEditingBusy(true)
              try {
                const updated = await updateRecord(editingRecord.id, input)
                patchFolderRecords(editingRecord.folder_id, (rows) =>
                  rows.map((r) => (r.id === updated.id ? updated : r)),
                )
                setAllRecords((prev) =>
                  prev.map((r) => (r.id === updated.id ? updated : r)),
                )
                setEditingRecord(null)
              } finally {
                setEditingBusy(false)
              }
            }}
          />
        )}
      </Modal>

      <Modal
        title="フォルダを削除"
        open={deleteConfirmFolder != null}
        onClose={() => {
          if (!deleteConfirmBusy) setDeleteConfirmFolderId(null)
        }}
      >
        {deleteConfirmFolder && (
          <div className="space-y-4">
            <p className="text-sm text-stone-700">
              「
              <span className="font-medium text-stone-900">
                {parseFolderName(deleteConfirmFolder.name).displayName}
              </span>
              」を削除しますか？
            </p>
            {getRecordCount(deleteConfirmFolder.id) > 0 ? (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                このフォルダ内の記録{' '}
                <span className="font-medium tabular-nums">
                  {getRecordCount(deleteConfirmFolder.id)}
                </span>
                件もまとめて削除されます。元に戻せません。
              </p>
            ) : (
              <p className="text-sm text-stone-600">
                記録はまだありません。買い物メモに載せている場合は、そこからも外れます。
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmFolderId(null)}
                disabled={deleteConfirmBusy}
                className="rounded-md px-4 py-2 text-sm text-stone-600 hover:bg-stone-100 disabled:opacity-50"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => void confirmDeleteFolder()}
                disabled={deleteConfirmBusy || isMutating}
                className="rounded-md bg-red-700 px-4 py-2 text-sm text-white hover:bg-red-800 disabled:opacity-50"
              >
                {deleteConfirmBusy ? '削除中...' : '削除する'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        title="店舗を削除"
        open={deleteConfirmStore != null}
        onClose={() => {
          if (!deleteConfirmStoreBusy) setDeleteConfirmStoreId(null)
        }}
      >
        {deleteConfirmStore && (
          <div className="space-y-4">
            <p className="text-sm text-stone-700">
              「
              <span className="font-medium text-stone-900">
                {deleteConfirmStore.name}
              </span>
              」を店舗一覧から削除しますか？
            </p>
            {getStoreRecordCount(deleteConfirmStore.id) > 0 ? (
              <p className="text-sm text-stone-600">
                記録{' '}
                <span className="font-medium tabular-nums">
                  {getStoreRecordCount(deleteConfirmStore.id)}
                </span>
                件はそのまま残ります（選択肢から外れるだけです）。
              </p>
            ) : (
              <p className="text-sm text-stone-600">
                この店舗の記録はまだありません。
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmStoreId(null)}
                disabled={deleteConfirmStoreBusy}
                className="rounded-md px-4 py-2 text-sm text-stone-600 hover:bg-stone-100 disabled:opacity-50"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => void confirmDeleteStore()}
                disabled={deleteConfirmStoreBusy || storeMutating}
                className="rounded-md bg-red-700 px-4 py-2 text-sm text-white hover:bg-red-800 disabled:opacity-50"
              >
                {deleteConfirmStoreBusy ? '削除中...' : '削除する'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </TrashDragProvider>
  )
}
