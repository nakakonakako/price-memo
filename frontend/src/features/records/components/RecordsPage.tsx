import { useEffect, useState, type FormEvent } from 'react'
import { listFolders } from '@/features/folders/api/foldersApi'
import type { PriceFolder } from '@/features/folders/types'
import { useRecords } from '../hooks/useRecords'
import type { PriceRecord, PriceRecordInput, PriceUnit } from '../types'
import {
  formatYen,
  perHundredPrice,
  todayISODate,
  UNIT_OPTIONS,
  unitLabel,
  unitPrice,
} from '../utils/unitPrice'

type FormState = {
  recorded_at: string
  store_name: string
  price: string
  amount: string
  unit: PriceUnit
  note: string
}

const emptyForm = (): FormState => ({
  recorded_at: todayISODate(),
  store_name: '',
  price: '',
  amount: '',
  unit: 'g',
  note: '',
})

function parseInput(
  folderId: string,
  form: FormState,
): PriceRecordInput | string {
  const price = Number(form.price)
  const amount = Number(form.amount)
  if (!form.recorded_at) return '日付を入力してください'
  if (!form.store_name.trim()) return '店舗名を入力してください'
  if (!Number.isFinite(price) || price < 0) return '価格が不正です'
  if (!Number.isInteger(price)) return '価格は整数（円）で入力してください'
  if (!Number.isFinite(amount) || amount <= 0) return '数量が不正です'
  return {
    folder_id: folderId,
    recorded_at: form.recorded_at,
    store_name: form.store_name,
    price,
    amount,
    unit: form.unit,
    note: form.note,
  }
}

function recordToForm(record: PriceRecord): FormState {
  return {
    recorded_at: record.recorded_at,
    store_name: record.store_name,
    price: String(record.price),
    amount: String(record.amount),
    unit: record.unit,
    note: record.note ?? '',
  }
}

function UnitPriceSummary({
  price,
  amount,
  unit,
}: {
  price: number
  amount: number
  unit: PriceUnit
}) {
  const per = unitPrice(price, amount)
  const per100 = perHundredPrice(price, amount, unit)
  if (per == null) return null
  return (
    <p className="text-sm text-stone-700">
      単価{' '}
      <span className="font-medium">
        {formatYen(per, 2)}/{unitLabel(unit)}
      </span>
      {per100 != null && (
        <>
          {' '}
          · 100{unitLabel(unit)}あたり{' '}
          <span className="font-medium">{formatYen(per100, 1)}</span>
        </>
      )}
    </p>
  )
}

export function RecordsPage() {
  const [folders, setFolders] = useState<PriceFolder[]>([])
  const [foldersLoading, setFoldersLoading] = useState(true)
  const [folderId, setFolderId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const { records, isLoading, isMutating, error, create, update, remove } =
    useRecords(folderId)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setFoldersLoading(true)
      try {
        const list = await listFolders()
        if (cancelled) return
        setFolders(list)
        setFolderId((prev) => prev ?? list[0]?.id ?? null)
      } catch {
        if (!cancelled) setFolders([])
      } finally {
        if (!cancelled) setFoldersLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const previewPrice = Number(form.price)
  const previewAmount = Number(form.amount)
  const showPreview =
    Number.isFinite(previewPrice) &&
    previewPrice >= 0 &&
    Number.isFinite(previewAmount) &&
    previewAmount > 0

  const resetForm = () => {
    setForm(emptyForm())
    setEditingId(null)
    setFormError(null)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!folderId) return
    const parsed = parseInput(folderId, form)
    if (typeof parsed === 'string') {
      setFormError(parsed)
      return
    }
    setFormError(null)
    try {
      if (editingId) {
        await update(editingId, parsed)
      } else {
        await create(parsed)
      }
      resetForm()
    } catch {
      /* hook error */
    }
  }

  const startEdit = (record: PriceRecord) => {
    setEditingId(record.id)
    setForm(recordToForm(record))
    setFormError(null)
  }

  const handleDelete = async (record: PriceRecord) => {
    const ok = window.confirm(
      `${record.recorded_at} ${record.store_name}（${formatYen(record.price, 0)}）を削除しますか？`,
    )
    if (!ok) return
    try {
      await remove(record.id)
      if (editingId === record.id) resetForm()
    } catch {
      /* hook error */
    }
  }

  const fieldClass =
    'w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-stone-500'

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-lg font-medium text-stone-900">厳密レコード</h2>
        <p className="text-sm text-stone-600">
          価格と確定した単位量だけを記録します。仮定値は入れません。
        </p>
      </div>

      {foldersLoading ? (
        <p className="text-sm text-stone-500">フォルダを読み込み中...</p>
      ) : folders.length === 0 ? (
        <p className="rounded-md border border-dashed border-stone-300 bg-white/60 px-4 py-8 text-center text-sm text-stone-500">
          先に「フォルダ」タブで比較用の棚を作ってください。
        </p>
      ) : (
        <>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-stone-500">フォルダ</span>
            <select
              className={fieldClass}
              value={folderId ?? ''}
              onChange={(e) => {
                setFolderId(e.target.value)
                resetForm()
              }}
            >
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>

          <form
            onSubmit={handleSubmit}
            className="space-y-3 rounded-md border border-stone-200 bg-white/70 p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-medium text-stone-800">
                {editingId ? 'レコードを編集' : '新規レコード'}
              </h3>
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-xs text-stone-500 hover:text-stone-800"
                >
                  新規に戻す
                </button>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className="text-xs text-stone-500">日付</span>
                <input
                  type="date"
                  className={fieldClass}
                  value={form.recorded_at}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, recorded_at: e.target.value }))
                  }
                  required
                  disabled={isMutating}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-stone-500">店舗</span>
                <input
                  type="text"
                  className={fieldClass}
                  value={form.store_name}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, store_name: e.target.value }))
                  }
                  placeholder="例: 〇〇スーパー"
                  required
                  disabled={isMutating}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-stone-500">価格（円）</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  className={fieldClass}
                  value={form.price}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, price: e.target.value }))
                  }
                  required
                  disabled={isMutating}
                />
              </label>
              <div className="grid grid-cols-[1fr_5.5rem] gap-2">
                <label className="block space-y-1">
                  <span className="text-xs text-stone-500">数量</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    className={fieldClass}
                    value={form.amount}
                    onChange={(e) =>
                      setForm((s) => ({ ...s, amount: e.target.value }))
                    }
                    required
                    disabled={isMutating}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs text-stone-500">単位</span>
                  <select
                    className={fieldClass}
                    value={form.unit}
                    onChange={(e) =>
                      setForm((s) => ({
                        ...s,
                        unit: e.target.value as PriceUnit,
                      }))
                    }
                    disabled={isMutating}
                  >
                    {UNIT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <label className="block space-y-1">
              <span className="text-xs text-stone-500">メモ（任意）</span>
              <input
                type="text"
                className={fieldClass}
                value={form.note}
                onChange={(e) =>
                  setForm((s) => ({ ...s, note: e.target.value }))
                }
                disabled={isMutating}
              />
            </label>

            {showPreview && (
              <UnitPriceSummary
                price={previewPrice}
                amount={previewAmount}
                unit={form.unit}
              />
            )}

            {(formError || error) && (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {formError || error}
              </p>
            )}

            <button
              type="submit"
              disabled={isMutating || !folderId}
              className="rounded-md bg-stone-900 px-4 py-2 text-sm text-white hover:bg-stone-800 disabled:opacity-50"
            >
              {editingId ? '更新する' : '追加する'}
            </button>
          </form>

          {isLoading ? (
            <p className="text-sm text-stone-500">読み込み中...</p>
          ) : records.length === 0 ? (
            <p className="rounded-md border border-dashed border-stone-300 bg-white/60 px-4 py-8 text-center text-sm text-stone-500">
              このフォルダにレコードはまだありません。
            </p>
          ) : (
            <ul className="divide-y divide-stone-200 border border-stone-200 bg-white/70">
              {records.map((record) => {
                const per = unitPrice(record.price, record.amount)
                const per100 = perHundredPrice(
                  record.price,
                  record.amount,
                  record.unit,
                )
                return (
                  <li
                    key={record.id}
                    className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-sm font-medium text-stone-900">
                        {record.recorded_at} · {record.store_name}
                      </p>
                      <p className="text-sm text-stone-600">
                        {formatYen(record.price, 0)} / {record.amount}
                        {unitLabel(record.unit)}
                        {per != null && (
                          <>
                            {' '}
                            → {formatYen(per, 2)}/{unitLabel(record.unit)}
                            {per100 != null && (
                              <>（100{unitLabel(record.unit)} {formatYen(per100, 1)}）</>
                            )}
                          </>
                        )}
                      </p>
                      {record.note && (
                        <p className="text-xs text-stone-500">{record.note}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => startEdit(record)}
                        className="rounded-md px-2.5 py-1 text-sm text-stone-600 hover:bg-stone-100"
                        disabled={isMutating}
                      >
                        編集
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(record)}
                        className="rounded-md px-2.5 py-1 text-sm text-red-600 hover:bg-red-50"
                        disabled={isMutating}
                      >
                        削除
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
    </section>
  )
}
