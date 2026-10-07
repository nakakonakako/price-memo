import { useState, type FormEvent } from 'react'
import { DateInput } from '@/components/DateInput'
import { FolderField } from '@/components/FolderField'
import { StoreField } from '@/components/StoreField'
import type { PriceFolder } from '@/features/folders/types'
import { searchReceiptItems } from '../api/recordsApi'
import type { PriceRecordInput, PriceUnit, ReceiptItemRef } from '../types'
import {
  formatYen,
  perHundredPrice,
  unitLabel,
  unitPrice,
} from '../utils/unitPrice'
import { UnitField } from './UnitField'
import { toUserMessage } from '@/lib/userError'
import {
  emptyRecordForm,
  parseRecordForm,
  type RecordFormState,
} from './recordFormUtils'

type FolderOption = { id: string; label: string }

type FolderPickerProps = {
  folders: PriceFolder[]
  folderId: string
  onFolderChange: (id: string) => void
  onCreateFolder: (name: string) => Promise<PriceFolder>
  foldersBusy?: boolean
}

type Props = {
  folderId: string
  folderName?: string
  folderOptions?: FolderOption[]
  /** Store name fixed for store-origin record create (hides store field). */
  fixedStoreName?: string
  /** Inline folder search/create for store-origin record create. */
  folderPicker?: FolderPickerProps
  preferredUnits?: PriceUnit[]
  busy?: boolean
  submitLabel?: string
  /** create shows receipt draft tools; edit starts from initial */
  mode?: 'create' | 'edit'
  initial?: RecordFormState
  onSubmit: (input: PriceRecordInput) => void | Promise<void>
  onCancel?: () => void
}

export function RecordForm({
  folderId,
  folderName,
  folderOptions,
  fixedStoreName,
  folderPicker,
  preferredUnits = [],
  busy,
  submitLabel,
  mode = 'create',
  initial,
  onSubmit,
  onCancel,
}: Props) {
  const isEdit = mode === 'edit'
  const [folderSelection, setFolderSelection] = useState({
    folderId,
    selectedFolderId: folderId,
  })
  const selectedFolderId =
    folderSelection.folderId === folderId
      ? folderSelection.selectedFolderId
      : folderId
  const [form, setForm] = useState<RecordFormState>(
    () => initial ?? emptyRecordForm(),
  )
  const [formError, setFormError] = useState<string | null>(null)
  const [showReceiptSearch, setShowReceiptSearch] = useState(false)

  const resolvedFolderId =
    folderPicker != null
      ? folderPicker.folderId
      : isEdit && folderOptions && folderOptions.length > 0
        ? selectedFolderId
        : folderId
  const resolvedFolderLabel =
    folderOptions?.find((f) => f.id === resolvedFolderId)?.label ?? folderName
  const storeFixed = fixedStoreName != null && fixedStoreName.length > 0
  const resolvedSubmitLabel =
    submitLabel ?? (isEdit ? '保存する' : '追加する')
  const [q, setQ] = useState('')
  const [store, setStore] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [results, setResults] = useState<ReceiptItemRef[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  const previewPrice = Number(form.price)
  const previewAmount = Number(form.amount)
  const showPreview =
    Number.isFinite(previewPrice) &&
    previewPrice >= 0 &&
    Number.isFinite(previewAmount) &&
    previewAmount > 0

  const fieldClass =
    'w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-stone-500'

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (folderPicker != null && !resolvedFolderId) {
      setFormError('品目（フォルダ）を選択または作成してください。')
      return
    }
    const formForSubmit = storeFixed
      ? { ...form, store_name: fixedStoreName }
      : form
    const parsed = parseRecordForm(resolvedFolderId, formForSubmit)
    if (typeof parsed === 'string') {
      setFormError(parsed)
      return
    }
    setFormError(null)
    try {
      await onSubmit(parsed)
    } catch (err) {
      setFormError(toUserMessage(err, '保存に失敗しました。'))
    }
  }

  const runSearch = async (e: FormEvent) => {
    e.preventDefault()
    setSearching(true)
    setSearchError(null)
    try {
      const rows = await searchReceiptItems({
        q,
        store,
        from: from || undefined,
        to: to || undefined,
        limit: 40,
      })
      setResults(rows)
      if (rows.length === 0) {
        setSearchError(
          '見つかりませんでした。購入日・店・値段は下のフォームに手動で入れてください。',
        )
      }
    } catch (err) {
      setSearchError(
        toUserMessage(err, 'レシート検索に失敗しました。'),
      )
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="space-y-3" data-edit-surface>
      {isEdit && folderOptions && folderOptions.length > 0 ? (
        <label className="block space-y-1">
          <span className="text-xs text-stone-500">品目（フォルダ）</span>
          <select
            className={fieldClass}
            value={selectedFolderId}
            onChange={(e) =>
              setFolderSelection({
                folderId,
                selectedFolderId: e.target.value,
              })
            }
            disabled={busy}
          >
            {folderOptions.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
      ) : (
        !storeFixed &&
        !folderPicker &&
        resolvedFolderLabel && (
          <p className="text-sm text-stone-600">
            フォルダ:{' '}
            <span className="font-medium text-stone-900">
              {resolvedFolderLabel}
            </span>
          </p>
        )
      )}

      {!isEdit && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-stone-800">新規レコード</h3>
          <button
            type="button"
            onClick={() => setShowReceiptSearch((v) => !v)}
            className="rounded-md px-2.5 py-1 text-xs text-stone-700 hover:bg-stone-100"
          >
            {showReceiptSearch
              ? 'レシート検索を閉じる'
              : '（任意）レシート管理から下書き'}
          </button>
        </div>
      )}

      {!isEdit && showReceiptSearch && (
        <div className="space-y-3 rounded-md border border-dashed border-stone-300 bg-stone-50/80 p-3">
          <p className="text-xs text-stone-600">
            レシート管理アプリの明細から購入日・店・値段を下書きできます。数量は常に手入力です。
          </p>
          <form
            onSubmit={(e) => void runSearch(e)}
            className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2"
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
            <DateInput
              wrapClassName="px-3"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              aria-label="検索開始日"
            />
            <DateInput
              wrapClassName="px-3"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              aria-label="検索終了日"
            />
            <button
              type="submit"
              disabled={searching}
              className="rounded-md bg-stone-800 px-3 py-2 text-sm text-white hover:bg-stone-700 disabled:opacity-50 sm:col-span-2 sm:w-fit"
            >
              {searching ? '検索中...' : '検索'}
            </button>
          </form>
          {searchError && (
            <p className="text-xs text-amber-800">{searchError}</p>
          )}
          {results.length > 0 && (
            <ul className="max-h-40 divide-y divide-stone-200 overflow-y-auto border border-stone-200 bg-white">
              {results.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-2 px-2 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-stone-900">
                      {item.item_name} · {formatYen(item.price, 0)}
                    </p>
                    <p className="truncate text-xs text-stone-500">
                      {item.receipts?.date ?? '-'} ·{' '}
                      {item.receipts?.store_name ?? '-'}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 rounded-md px-2 py-1 text-xs text-stone-800 hover:bg-stone-100"
                    onClick={() => {
                      setForm((s) => ({
                        ...s,
                        recorded_at: item.receipts?.date ?? s.recorded_at,
                        store_name: item.receipts?.store_name ?? s.store_name,
                        price: String(item.price),
                        receipt_item_id: item.id,
                        note: s.note || item.item_name,
                      }))
                      setShowReceiptSearch(false)
                      setFormError(null)
                    }}
                  >
                    下書きに使う
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
        {form.receipt_item_id && (
          <div className="flex flex-wrap items-center gap-2 rounded-md bg-stone-100 px-3 py-2 text-xs text-stone-700">
            <span>
              レシート明細を参照中（{form.receipt_item_id.slice(0, 8)}…）
            </span>
            <button
              type="button"
              onClick={() => setForm((s) => ({ ...s, receipt_item_id: null }))}
              className="underline hover:text-stone-900"
            >
              参照を外す
            </button>
          </div>
        )}

        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block min-w-0 space-y-1">
            <span className="text-xs text-stone-500">購入日</span>
            <DateInput
              wrapClassName="px-3"
              value={form.recorded_at}
              onChange={(e) =>
                setForm((s) => ({ ...s, recorded_at: e.target.value }))
              }
              required
              disabled={busy}
            />
          </label>
          {folderPicker ? (
            <label className="block min-w-0 space-y-1">
              <span className="text-xs text-stone-500">品目（フォルダ）</span>
              <FolderField
                folders={folderPicker.folders}
                folderId={folderPicker.folderId}
                onFolderChange={folderPicker.onFolderChange}
                onCreateFolder={folderPicker.onCreateFolder}
                disabled={busy || folderPicker.foldersBusy}
                required
                className={fieldClass}
              />
            </label>
          ) : !storeFixed ? (
            <label className="block min-w-0 space-y-1">
              <span className="text-xs text-stone-500">店舗</span>
              <StoreField
                value={form.store_name}
                onChange={(store_name) =>
                  setForm((s) => ({ ...s, store_name }))
                }
                disabled={busy}
                required
                className={fieldClass}
              />
            </label>
          ) : (
            <div className="hidden sm:block" aria-hidden />
          )}
          <UnitField
            value={form.unit}
            onChange={(unit) => setForm((s) => ({ ...s, unit }))}
            preferredUnits={preferredUnits}
            disabled={busy}
            className={fieldClass}
          >
            {({ select, customInput }) => (
              <>
                <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] gap-2">
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
                      disabled={busy}
                    />
                  </label>
                  <label className="block min-w-0 space-y-1">
                    <span className="text-xs text-stone-500">単位</span>
                    {select}
                  </label>
                </div>
                {customInput}
              </>
            )}
          </UnitField>
          <label className="block space-y-1">
            <span className="text-xs text-stone-500">値段（円）</span>
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
              disabled={busy}
            />
          </label>
        </div>

        <label className="block space-y-1">
          <span className="text-xs text-stone-500">メモ（任意）</span>
          <input
            type="text"
            className={fieldClass}
            value={form.note}
            onChange={(e) => setForm((s) => ({ ...s, note: e.target.value }))}
            disabled={busy}
          />
        </label>

        {showPreview && (
          <p className="text-sm text-stone-700">
            単価{' '}
            <span className="font-medium">
              {formatYen(unitPrice(previewPrice, previewAmount) ?? 0, 2)}/
              {unitLabel(form.unit)}
            </span>
            {perHundredPrice(previewPrice, previewAmount, form.unit) != null && (
              <>
                {' '}
                · 100{unitLabel(form.unit)}あたり{' '}
                <span className="font-medium">
                  {formatYen(
                    perHundredPrice(previewPrice, previewAmount, form.unit)!,
                    1,
                  )}
                </span>
              </>
            )}
          </p>
        )}

        {formError && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {formError}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-stone-900 px-4 py-2 text-sm text-white hover:bg-stone-800 disabled:opacity-50"
          >
            {busy ? '保存中...' : resolvedSubmitLabel}
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="rounded-md px-4 py-2 text-sm text-stone-600 hover:bg-stone-100"
            >
              キャンセル
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
