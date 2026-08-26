import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { listFolders } from '@/features/folders/api/foldersApi'
import type { PriceFolder } from '@/features/folders/types'
import {
  linkReceiptItemToRecord,
  listRecords,
  searchReceiptItems,
} from '@/features/records/api/recordsApi'
import type { PriceRecord, ReceiptItemRef } from '@/features/records/types'
import { formatYen } from '@/features/records/utils/unitPrice'

export function ReceiptLinkPage() {
  const [folders, setFolders] = useState<PriceFolder[]>([])
  const [folderId, setFolderId] = useState<string | null>(null)
  const [records, setRecords] = useState<PriceRecord[]>([])
  const [recordId, setRecordId] = useState<string | null>(null)
  const [results, setResults] = useState<ReceiptItemRef[]>([])
  const [q, setQ] = useState('')
  const [store, setStore] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setIsLoading(true)
      try {
        const folderList = await listFolders()
        if (cancelled) return
        setFolders(folderList)
        const firstFolderId = folderList[0]?.id ?? null
        setFolderId(firstFolderId)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'フォルダ取得に失敗')
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!folderId) {
      setRecords([])
      setRecordId(null)
      return
    }
    let cancelled = false
    ;(async () => {
      setIsLoading(true)
      try {
        const rows = await listRecords(folderId)
        if (cancelled) return
        setRecords(rows)
        setRecordId((prev) => {
          if (prev && rows.some((r) => r.id === prev)) return prev
          return rows[0]?.id ?? null
        })
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'レコード取得に失敗')
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [folderId])

  const selectedRecord = useMemo(
    () => records.find((r) => r.id === recordId) ?? null,
    [records, recordId],
  )

  const runSearch = async (e?: FormEvent) => {
    if (e) e.preventDefault()
    setIsLoading(true)
    setError(null)
    try {
      const rows = await searchReceiptItems({
        q,
        store,
        from: from || undefined,
        to: to || undefined,
        limit: 60,
      })
      setResults(rows)
    } catch (err) {
      setError(err instanceof Error ? err.message : '検索に失敗')
    } finally {
      setIsLoading(false)
    }
  }

  const link = async (receiptItemId: string | null) => {
    if (!recordId) return
    setIsLoading(true)
    setError(null)
    try {
      const updated = await linkReceiptItemToRecord(recordId, receiptItemId)
      setRecords((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
    } catch (err) {
      setError(err instanceof Error ? err.message : '紐付けに失敗')
    } finally {
      setIsLoading(false)
    }
  }

  const fieldClass =
    'w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-stone-500'

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-lg font-medium text-stone-900">レシート紐付け</h2>
        <p className="text-sm text-stone-600">
          すでに完成した厳密レコードへ、A
          明細をあとから参照紐付けします。値段の穴埋め待ちには使いません（新規登録は「記録」タブ）。
        </p>
      </div>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {folders.length === 0 ? (
        <p className="rounded-md border border-dashed border-stone-300 bg-white/60 px-4 py-8 text-center text-sm text-stone-500">
          先にフォルダと厳密レコードを作成してください。
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs font-medium text-stone-500">フォルダ</span>
              <select
                className={fieldClass}
                value={folderId ?? ''}
                onChange={(e) => {
                  setFolderId(e.target.value)
                  setRecordId(null)
                }}
              >
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-stone-500">
                対象レコード（完成済み）
              </span>
              <select
                className={fieldClass}
                value={recordId ?? ''}
                onChange={(e) => setRecordId(e.target.value)}
                disabled={records.length === 0}
              >
                {records.length === 0 ? (
                  <option value="">レコードなし</option>
                ) : (
                  records.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.recorded_at} / {r.store_name} / {formatYen(r.price, 0)}
                    </option>
                  ))
                )}
              </select>
            </label>
          </div>

          {selectedRecord && (
            <div className="rounded-md border border-stone-200 bg-white/70 px-3 py-2 text-sm">
              <p className="text-stone-800">
                選択中: {selectedRecord.recorded_at} · {selectedRecord.store_name}{' '}
                · {formatYen(selectedRecord.price, 0)}
              </p>
              <p className="text-xs text-stone-500">
                現在の参照: {selectedRecord.receipt_item_id ?? 'なし'}
              </p>
              {selectedRecord.receipt_item_id && (
                <button
                  type="button"
                  className="mt-2 rounded-md px-2.5 py-1 text-xs text-red-600 hover:bg-red-50"
                  onClick={() => void link(null)}
                  disabled={isLoading}
                >
                  参照を外す
                </button>
              )}
            </div>
          )}

          <form
            className="grid gap-3 rounded-md border border-stone-200 bg-white/70 p-3 sm:grid-cols-4"
            onSubmit={(e) => void runSearch(e)}
          >
            <input
              className={fieldClass}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="商品名"
            />
            <input
              className={fieldClass}
              value={store}
              onChange={(e) => setStore(e.target.value)}
              placeholder="店舗名"
            />
            <input
              type="date"
              className={fieldClass}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
            <input
              type="date"
              className={fieldClass}
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
            <button
              type="submit"
              className="rounded-md bg-stone-900 px-4 py-2 text-sm text-white hover:bg-stone-800 disabled:opacity-50 sm:col-span-4 sm:w-fit"
              disabled={isLoading || !recordId}
            >
              {isLoading ? '検索中...' : 'A レシートを検索'}
            </button>
          </form>

          {results.length === 0 ? (
            <p className="text-sm text-stone-500">
              検索結果はまだありません。空欄のままだと直近最大60件です。
            </p>
          ) : (
            <ul className="divide-y divide-stone-200 border border-stone-200 bg-white/70">
              {results.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-stone-900">
                      {item.item_name} · {formatYen(item.price, 0)}
                    </p>
                    <p className="truncate text-xs text-stone-500">
                      {item.receipts?.date ?? '-'} ·{' '}
                      {item.receipts?.store_name ?? '-'}
                      {item.main_category ? ` · ${item.main_category}` : ''}
                      {item.sub_category ? ` / ${item.sub_category}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="rounded-md bg-stone-900 px-3 py-1.5 text-sm text-white hover:bg-stone-800 disabled:opacity-50"
                    onClick={() => void link(item.id)}
                    disabled={isLoading || !recordId}
                  >
                    参照として紐付け
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}
