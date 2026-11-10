import { useState, type FormEvent } from 'react'
import { DateInput } from '@/components/DateInput'
import { FolderField } from '@/components/FolderField'
import { StoreField } from '@/components/StoreField'
import type { PriceFolder } from '@/features/folders/types'
import type { PriceRecordInput, PriceUnit } from '../types'
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
  mode?: 'create' | 'edit'
  initial?: RecordFormState
  /** Folder-tab create: on narrow viewports show price before quantity/unit (DOM + tab order). */
  mobilePriceBeforeQuantity?: boolean
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
  mobilePriceBeforeQuantity = false,
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
  const previewPrice = Number(form.price)
  const previewAmount = Number(form.amount)
  const showPreview =
    Number.isFinite(previewPrice) &&
    previewPrice >= 0 &&
    Number.isFinite(previewAmount) &&
    previewAmount > 0

  const fieldClass =
    'w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-stone-500'

  const amountUnitFields = (
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
  )

  const priceField = (
    <label className="block space-y-1">
      <span className="text-xs text-stone-500">値段（円）</span>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        step={1}
        className={fieldClass}
        value={form.price}
        onChange={(e) => setForm((s) => ({ ...s, price: e.target.value }))}
        required
        disabled={busy}
      />
    </label>
  )

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

      {!isEdit && <h3 className="text-sm font-medium text-stone-800">新規レコード</h3>}

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
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
          {mobilePriceBeforeQuantity ? (
            <>
              <div className="contents sm:hidden">{priceField}</div>
              {amountUnitFields}
              <div className="hidden sm:contents">{priceField}</div>
            </>
          ) : (
            <>
              {amountUnitFields}
              {priceField}
            </>
          )}
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
