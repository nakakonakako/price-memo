import { useState, type FormEvent } from 'react'
import { listRecords } from '@/features/records/api/recordsApi'
import type { PriceRecord } from '@/features/records/types'
import { formatYen, unitLabel, unitPrice } from '@/features/records/utils/unitPrice'
import { useFolders } from '../hooks/useFolders'
import type { PriceFolder } from '../types'

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

  const cancelEdit = () => {
    setEditingId(null)
    setEditingName('')
  }

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

  const handleDelete = async (folder: PriceFolder) => {
    const ok = window.confirm(
      `「${folder.name}」を削除しますか？\n中の厳密レコードもまとめて消えます。`,
    )
    if (!ok) return
    try {
      await remove(folder.id)
      if (editingId === folder.id) cancelEdit()
    } catch {
      /* error shown via hook */
    }
  }

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
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'フォルダ中身の読み込みに失敗しました。'
      setRecordsError(msg)
    } finally {
      setOpenFolderLoadingId(null)
    }
  }

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-lg font-medium text-stone-900">フォルダ</h2>
        <p className="text-sm text-stone-600">
          比較したい商品集合を手動で棚分けします。AI 自動カテゴリは使いません。
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
        <ul className="divide-y divide-stone-200 border border-stone-200 bg-white/70">
          {folders.map((folder) => (
            <li
              key={folder.id}
              className="flex flex-col gap-3 px-3 py-3"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                {editingId === folder.id ? (
                  <form
                    onSubmit={handleRename}
                    className="flex min-w-0 flex-1 flex-wrap gap-2"
                  >
                    <input
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      className="min-w-0 flex-1 rounded-md border border-stone-300 px-3 py-1.5 text-sm outline-none focus:border-stone-500"
                      autoFocus
                      disabled={isMutating}
                    />
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
                      className="rounded-md px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100"
                    >
                      取消
                    </button>
                  </form>
                ) : (
                  <>
                    <button
                      type="button"
                      className="truncate text-left text-sm font-medium text-stone-900 hover:text-stone-700"
                      onClick={() => void toggleFolderDetail(folder.id)}
                    >
                      {folder.name}
                    </button>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => void toggleFolderDetail(folder.id)}
                        className="rounded-md px-2.5 py-1 text-sm text-stone-700 hover:bg-stone-100"
                      >
                        {openFolderId === folder.id ? '閉じる' : '中身を見る'}
                      </button>
                      <button
                        type="button"
                        onClick={() => startEdit(folder)}
                        className="rounded-md px-2.5 py-1 text-sm text-stone-600 hover:bg-stone-100"
                        disabled={isMutating}
                      >
                        名前変更
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(folder)}
                        className="rounded-md px-2.5 py-1 text-sm text-red-600 hover:bg-red-50"
                        disabled={isMutating}
                      >
                        削除
                      </button>
                    </div>
                  </>
                )}
              </div>

              {openFolderId === folder.id && (
                <div className="rounded-md border border-stone-200 bg-white/70 px-3 py-3">
                  {openFolderLoadingId === folder.id ? (
                    <p className="text-sm text-stone-500">中身を読み込み中...</p>
                  ) : (recordsByFolder[folder.id] ?? []).length === 0 ? (
                    <p className="text-sm text-stone-500">
                      このフォルダにレコードはまだありません。
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {(recordsByFolder[folder.id] ?? []).map((record) => {
                        const unit = unitPrice(record.price, record.amount)
                        return (
                          <li
                            key={record.id}
                            className="rounded border border-stone-200 bg-white px-3 py-2"
                          >
                            <p className="text-sm font-medium text-stone-900">
                              {record.recorded_at} · {record.store_name}
                            </p>
                            <p className="text-xs text-stone-600">
                              {formatYen(record.price, 0)} / {record.amount}
                              {unitLabel(record.unit)}
                              {unit != null &&
                                `（${formatYen(unit, 2)}/${unitLabel(record.unit)}）`}
                            </p>
                            {record.note && (
                              <p className="mt-1 text-xs text-stone-500">{record.note}</p>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
