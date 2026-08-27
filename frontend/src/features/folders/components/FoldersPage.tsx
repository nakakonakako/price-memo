import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { EditIconButton } from '@/components/EditIconButton'
import { TrashDragItem } from '@/components/trash/TrashDragItem'
import {
  TrashDragProvider,
  useTrashDrag,
} from '@/components/trash/TrashDragProvider'
import type { DragEndResult, TrashDragPayload } from '@/components/trash/types'
import { useOutsidePointerDown } from '@/hooks/useOutsidePointerDown'
import {
  applyIdOrder,
  loadIdOrder,
  reorderIds,
  saveIdOrder,
} from '@/lib/listOrder'
import {
  deleteRecord,
  listAllRecords,
  listRecords,
  updateRecord,
} from '@/features/records/api/recordsApi'
import { UnitField } from '@/features/records/components/UnitField'
import type { PriceRecord, PriceUnit } from '@/features/records/types'
import {
  formatYen,
  unitLabel,
  unitPrice,
} from '@/features/records/utils/unitPrice'
import { useFolders } from '../hooks/useFolders'
import type { PriceFolder } from '../types'

const FOLDER_ORDER_KEY = 'price-memo-folder-order'

function recordOrderKey(folderId: string) {
  return `price-memo-record-order:${folderId}`
}

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
  const { folders, isLoading, isMutating, error, create, rename, remove } =
    useFolders()
  const [newName, setNewName] = useState('')
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
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null)
  const [recordCounts, setRecordCounts] = useState<Record<string, number>>({})
  const [folderOrder, setFolderOrder] = useState(() =>
    loadIdOrder(FOLDER_ORDER_KEY),
  )

  const orderedFolders = useMemo(
    () => applyIdOrder(folders, folderOrder),
    [folders, folderOrder],
  )
  const folderIds = useMemo(
    () => orderedFolders.map((f) => f.id),
    [orderedFolders],
  )

  useEffect(() => {
    const next = applyIdOrder(folders, folderOrder).map((f) => f.id)
    const prevKept = folderOrder.filter((id) =>
      folders.some((f) => f.id === id),
    )
    if (next.join() === prevKept.join() && next.length === prevKept.length) {
      return
    }
    setFolderOrder(next)
    saveIdOrder(FOLDER_ORDER_KEY, next)
  }, [folders, folderOrder])

  useEffect(() => {
    if (isLoading) return
    void listAllRecords()
      .then((records) => {
        const counts: Record<string, number> = {}
        for (const r of records) {
          counts[r.folder_id] = (counts[r.folder_id] ?? 0) + 1
        }
        setRecordCounts(counts)
      })
      .catch(() => {
        /* counts are optional; folder open still works */
      })
  }, [isLoading, folders])

  const getRecordCount = (folderId: string) => {
    if (recordsByFolder[folderId]) return recordsByFolder[folderId].length
    return recordCounts[folderId] ?? 0
  }

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    try {
      await create(newName)
      setNewName('')
    } catch {
      /* error shown via hook */
    }
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
      cancelEdit()
    } catch {
      /* error shown via hook */
    }
  }

  useOutsidePointerDown(editingId != null, cancelEdit)

  const toggleFolderDetail = async (folderId: string) => {
    if (openFolderId === folderId) {
      setOpenFolderId(null)
      setEditingRecordId(null)
      return
    }

    setOpenFolderId(folderId)
    setEditingRecordId(null)
    setRecordsError(null)

    if (recordsByFolder[folderId]) return

    try {
      setOpenFolderLoadingId(folderId)
      const records = await listRecords(folderId)
      const ordered = applyIdOrder(records, loadIdOrder(recordOrderKey(folderId)))
      setRecordsByFolder((prev) => ({ ...prev, [folderId]: ordered }))
      setRecordCounts((prev) => ({ ...prev, [folderId]: ordered.length }))
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'フォルダ中身の読み込みに失敗しました。'
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

  const persistFolderOrder = (ids: string[]) => {
    setFolderOrder(ids)
    saveIdOrder(FOLDER_ORDER_KEY, ids)
  }

  const handleTrashDrop = useCallback(
    async (result: DragEndResult) => {
      if (result.action === 'cancel') return
      const payload = result.payload

      if (result.action === 'reorder') {
        if (payload.kind === 'folder') {
          persistFolderOrder(
            reorderIds(folderIds, payload.id, result.beforeId),
          )
        } else if (payload.kind === 'folder-record') {
          patchFolderRecords(payload.folderId, (rows) => {
            const ids = reorderIds(
              rows.map((r) => r.id),
              payload.id,
              result.beforeId,
            )
            saveIdOrder(recordOrderKey(payload.folderId), ids)
            return applyIdOrder(rows, ids)
          })
        }
        return
      }

      if (result.action !== 'delete') return
      try {
        if (payload.kind === 'folder') {
          await remove(payload.id)
          if (editingId === payload.id) cancelEdit()
          if (openFolderId === payload.id) setOpenFolderId(null)
          setRecordCounts((prev) => {
            const next = { ...prev }
            delete next[payload.id]
            return next
          })
        } else if (payload.kind === 'folder-record') {
          await deleteRecord(payload.id)
          patchFolderRecords(payload.folderId, (rows) => {
            const next = rows.filter((r) => r.id !== payload.id)
            saveIdOrder(
              recordOrderKey(payload.folderId),
              next.map((r) => r.id),
            )
            return next
          })
          if (editingRecordId === payload.id) setEditingRecordId(null)
        }
      } catch {
        /* error shown via hook or recordsError */
      }
    },
    [cancelEdit, editingId, editingRecordId, folderIds, openFolderId, remove],
  )

  return (
    <TrashDragProvider onDragEnd={handleTrashDrop}>
      <section className="space-y-6 pb-28">
        <div className="space-y-2">
          <h2 className="text-lg font-medium text-stone-900">フォルダ</h2>
          <p className="text-sm text-stone-600">
            比較したい商品集合を手動で棚分けします。フォルダや記録はドラッグで並べ替え、右下のゴミ箱へ落とすと削除できます。
          </p>
        </div>

      <form onSubmit={handleCreate} className="flex gap-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="例: 鶏むね / 牛乳 1L"
          className="min-w-0 flex-1 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-stone-500"
          disabled={isMutating}
        />
        <button
          type="submit"
          disabled={isMutating || !newName.trim()}
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
      {recordsError && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {recordsError}
        </p>
      )}

      {isLoading ? (
        <p className="text-sm text-stone-500">読み込み中...</p>
      ) : folders.length === 0 ? (
        <p className="rounded-md border border-dashed border-stone-300 bg-white/60 px-4 py-8 text-center text-sm text-stone-500">
          まだフォルダがありません。上から追加してください。
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          <ListRegistrar kind="folder" ids={folderIds} />
          {orderedFolders.map((folder) => {
            const isOpen = openFolderId === folder.id
            const recordCount = getRecordCount(folder.id)
            return (
              <li key={folder.id} className="flex flex-col">
                <div className="relative">
                  {editingId !== folder.id && (
                    <div className="absolute right-1 top-3 z-10">
                      <EditIconButton
                        label="名前変更"
                        onClick={() => startEdit(folder)}
                        disabled={isMutating}
                      />
                    </div>
                  )}
                  <TrashDragItem
                    payload={{ kind: 'folder', id: folder.id }}
                    onClick={() => void toggleFolderDetail(folder.id)}
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

                  <div className="flex flex-col gap-2 px-4 pb-3 pt-5 pr-12">
                    {editingId === folder.id ? (
                      <form
                        data-edit-surface
                        data-no-trash-drag
                        onSubmit={handleRename}
                        className="flex min-w-0 flex-col gap-2"
                      >
                        <input
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          className="min-w-0 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-stone-500"
                          autoFocus
                          disabled={isMutating}
                        />
                        <div className="flex gap-1">
                          <button
                            type="submit"
                            disabled={isMutating || !editingName.trim()}
                            className="rounded-md bg-stone-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                          >
                            保存
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="rounded-md px-3 py-1.5 text-sm text-stone-600 hover:bg-white/60"
                          >
                            取消
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-base font-semibold text-stone-900">
                          {folder.name}
                        </span>
                        <span className="shrink-0 tabular-nums text-sm text-stone-500">
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
                    <div
                      data-no-trash-drag
                      className="border-t border-amber-200/70 bg-white/80 px-3 py-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {openFolderLoadingId === folder.id ? (
                        <p className="text-sm text-stone-500">中身を読み込み中...</p>
                      ) : (recordsByFolder[folder.id] ?? []).length === 0 ? (
                        <p className="text-sm text-stone-500">
                          このフォルダにレコードはまだありません。
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
                          {(recordsByFolder[folder.id] ?? []).map((record) =>
                            editingRecordId === record.id ? (
                              <FolderRecordEditor
                                key={record.id}
                                record={record}
                                preferredUnits={[
                                  ...new Set(
                                    (recordsByFolder[folder.id] ?? []).map(
                                      (r) => r.unit,
                                    ),
                                  ),
                                ]}
                                onCancel={() => setEditingRecordId(null)}
                              onSaved={(updated) => {
                                patchFolderRecords(folder.id, (rows) =>
                                  rows.map((r) =>
                                    r.id === updated.id ? updated : r,
                                  ),
                                )
                                setEditingRecordId(null)
                              }}
                            />
                          ) : (
                            <li key={record.id} className="list-none">
                              <div className="flex items-start gap-1 rounded-md border border-stone-200 bg-white px-2 py-2 sm:px-3">
                                <TrashDragItem
                                  payload={{
                                    kind: 'folder-record',
                                    id: record.id,
                                    folderId: folder.id,
                                  }}
                                  className="min-w-0 flex-1 py-0.5"
                                >
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium text-stone-900">
                                      {record.recorded_at} · {record.store_name}
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
                                </TrashDragItem>
                                <EditIconButton
                                  label="編集"
                                  onClick={() => setEditingRecordId(record.id)}
                                />
                              </div>
                            </li>
                            ),
                          )}
                          <DropEndMarker
                            kind="folder-record"
                            lastId={
                              (recordsByFolder[folder.id] ?? []).at(-1)?.id ??
                              null
                            }
                          />
                        </ul>
                      )}
                    </div>
                  )}
                </TrashDragItem>
                </div>
              </li>
            )
          })}
          <DropEndMarker
            kind="folder"
            lastId={orderedFolders.at(-1)?.id ?? null}
            className="col-span-full h-1 rounded-full bg-stone-800"
          />
        </ul>
      )}
      </section>
    </TrashDragProvider>
  )
}

function FolderRecordEditor({
  record,
  preferredUnits,
  onCancel,
  onSaved,
}: {
  record: PriceRecord
  preferredUnits: PriceUnit[]
  onCancel: () => void
  onSaved: (record: PriceRecord) => void
}) {
  const [recordedAt, setRecordedAt] = useState(record.recorded_at)
  const [store, setStore] = useState(record.store_name)
  const [amount, setAmount] = useState(String(record.amount))
  const [unit, setUnit] = useState(record.unit)
  const [price, setPrice] = useState(String(record.price))
  const [note, setNote] = useState(record.note ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useOutsidePointerDown(true, onCancel)

  const fieldClass =
    'w-full rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-stone-500'

  const handleSave = async (e: FormEvent) => {
    e.preventDefault()
    const priceN = Number(price)
    const amountN = Number(amount)
    if (!store.trim()) {
      setError('店舗名を入力してください')
      return
    }
    if (!Number.isFinite(priceN) || priceN < 0 || !Number.isInteger(priceN)) {
      setError('値段が不正です')
      return
    }
    if (!Number.isFinite(amountN) || amountN <= 0) {
      setError('数量が不正です')
      return
    }
    if (!unit.trim()) {
      setError('単位を入力してください')
      return
    }

    setBusy(true)
    setError(null)
    try {
      const updated = await updateRecord(record.id, {
        recorded_at: recordedAt,
        store_name: store,
        price: priceN,
        amount: amountN,
        unit: unit.trim(),
        note,
      })
      onSaved(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新に失敗しました')
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="list-none rounded border border-stone-300 bg-stone-50 px-3 py-3">
      <form
        onSubmit={(e) => void handleSave(e)}
        data-no-trash-drag
        data-edit-surface
        className="space-y-2"
      >
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs text-stone-500">購入日</span>
            <input
              type="date"
              className={fieldClass}
              value={recordedAt}
              onChange={(e) => setRecordedAt(e.target.value)}
              disabled={busy}
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-stone-500">店舗</span>
            <input
              type="text"
              className={fieldClass}
              value={store}
              onChange={(e) => setStore(e.target.value)}
              disabled={busy}
            />
          </label>
        </div>

        <div className="grid gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="space-y-1">
            <span className="text-xs text-stone-500">数量</span>
            <div className="flex min-w-0">
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                className="min-w-0 flex-[1.4] rounded-l-md border border-r-0 border-stone-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-stone-500"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={busy}
              />
              <div className="w-[5.5rem] shrink-0">
                <UnitField
                  value={unit}
                  onChange={setUnit}
                  preferredUnits={preferredUnits}
                  disabled={busy}
                  className="w-full rounded-none rounded-r-md border border-stone-300 bg-white px-1.5 py-1.5 text-sm outline-none focus:border-stone-500"
                />
              </div>
            </div>
          </div>
          <label className="space-y-1">
            <span className="text-xs text-stone-500">値段（円）</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              className={fieldClass}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              disabled={busy}
            />
          </label>
        </div>

        <label className="block space-y-1">
          <span className="text-xs text-stone-500">メモ</span>
          <input
            type="text"
            className={fieldClass}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={busy}
          />
        </label>

        {error && <p className="text-xs text-red-700">{error}</p>}

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-stone-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            保存
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100"
          >
            取消
          </button>
        </div>
      </form>
    </li>
  )
}
