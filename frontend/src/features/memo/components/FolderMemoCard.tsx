import { useMemo, useState, type FormEvent } from 'react'
import { createRecord } from '@/features/records/api/recordsApi'
import type { PriceRecord, PriceUnit } from '@/features/records/types'
import {
  formatYen,
  todayISODate,
  UNIT_OPTIONS,
  unitLabel,
} from '@/features/records/utils/unitPrice'
import {
  canCompareToStats,
  computeFolderStats,
  defaultBasis,
  diffVs,
  formatDiff,
  trialDisplayValue,
  valueLabelFor,
} from '../utils/stats'

type Props = {
  folderId: string
  folderName: string
  records: PriceRecord[]
  onSaved: () => void
}

export function FolderMemoCard({
  folderId,
  folderName,
  records,
  onSaved,
}: Props) {
  const stats = useMemo(() => computeFolderStats(records), [records])
  const [open, setOpen] = useState(false)
  const [price, setPrice] = useState('')
  const [amount, setAmount] = useState('')
  const [unit, setUnit] = useState<PriceUnit>('g')
  const [store, setStore] = useState('')
  const [recordedAt, setRecordedAt] = useState(todayISODate())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)

  const priceN = Number(price)
  const amountN = Number(amount)
  const compareOk = canCompareToStats(unit, stats)
  const trialBasis =
    compareOk && stats ? stats.basis : defaultBasis(unit)
  const trialValue = trialDisplayValue(priceN, amountN, unit, trialBasis)
  const displayLabel =
    compareOk && stats
      ? stats.valueLabel
      : valueLabelFor(unit, defaultBasis(unit))

  const fieldClass =
    'w-full rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-stone-500'

  const handleOpen = () => {
    setOpen((v) => {
      const next = !v
      if (next && stats) setUnit(stats.unit)
      setError(null)
      setSavedMsg(null)
      return next
    })
  }

  const handleSave = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSavedMsg(null)
    if (!store.trim()) {
      setError('保存するには店名が必要です')
      return
    }
    if (!Number.isFinite(priceN) || priceN < 0 || !Number.isInteger(priceN)) {
      setError('価格は 0 以上の整数（円）で入力してください')
      return
    }
    if (!Number.isFinite(amountN) || amountN <= 0) {
      setError('数量は 0 より大きくしてください')
      return
    }
    if (!recordedAt) {
      setError('確認日を入力してください')
      return
    }

    setSaving(true)
    try {
      await createRecord({
        folder_id: folderId,
        recorded_at: recordedAt,
        store_name: store,
        price: priceN,
        amount: amountN,
        unit,
      })
      setSavedMsg('統計に残しました')
      setPrice('')
      setAmount('')
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  return (
    <li className="border border-stone-200 bg-white/70">
      <button
        type="button"
        onClick={handleOpen}
        className="flex w-full items-start justify-between gap-3 px-3 py-3 text-left hover:bg-stone-50/80"
      >
        <div className="min-w-0 space-y-1">
          <p className="truncate text-sm font-medium text-stone-900">
            {folderName}
          </p>
          {stats ? (
            <p className="text-xs text-stone-600">
              {stats.count}件 · {stats.valueLabel}
            </p>
          ) : (
            <p className="text-xs text-stone-500">まだ統計なし</p>
          )}
        </div>
        <span className="shrink-0 text-xs text-stone-500">
          {open ? '閉じる' : '試算'}
        </span>
      </button>

      {stats && (
        <div className="grid grid-cols-3 gap-2 border-t border-stone-100 px-3 py-2 text-center">
          <StatCell label="平均" value={stats.avg} />
          <StatCell label="最安" value={stats.min} highlight />
          <StatCell label="直近" value={stats.latest} sub={stats.latestDate} />
        </div>
      )}

      {open && (
        <form
          onSubmit={(e) => void handleSave(e)}
          className="space-y-3 border-t border-stone-200 bg-stone-50/60 px-3 py-3"
        >
          <p className="text-xs text-stone-600">
            棚の総額と数量を入れて単価を出します。残したければ店名を入れて保存（買っていなくても可）。
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <label className="space-y-1">
              <span className="text-xs text-stone-500">総額（円）</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                className={fieldClass}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-stone-500">数量</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                className={fieldClass}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-stone-500">単位</span>
              <select
                className={fieldClass}
                value={unit}
                onChange={(e) => setUnit(e.target.value as PriceUnit)}
              >
                {UNIT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs text-stone-500">確認日</span>
              <input
                type="date"
                className={fieldClass}
                value={recordedAt}
                onChange={(e) => setRecordedAt(e.target.value)}
              />
            </label>
          </div>

          <label className="block space-y-1">
            <span className="text-xs text-stone-500">店名（保存時必須）</span>
            <input
              type="text"
              className={fieldClass}
              value={store}
              onChange={(e) => setStore(e.target.value)}
              placeholder="例: 〇〇スーパー"
            />
          </label>

          {trialValue != null ? (
            <div className="space-y-1 rounded-md border border-stone-200 bg-white px-3 py-2">
              <p className="text-sm text-stone-900">
                今の単価{' '}
                <span className="font-semibold">
                  {formatYen(trialValue, 2)}
                </span>{' '}
                <span className="text-xs text-stone-500">({displayLabel})</span>
              </p>
              {compareOk && stats ? (
                <ul className="space-y-0.5 text-xs text-stone-600">
                  <CompareLine
                    label="平均"
                    baseline={stats.avg}
                    current={trialValue}
                  />
                  <CompareLine
                    label="最安"
                    baseline={stats.min}
                    current={trialValue}
                  />
                  <CompareLine
                    label="直近"
                    baseline={stats.latest}
                    current={trialValue}
                  />
                </ul>
              ) : stats ? (
                <p className="text-xs text-amber-800">
                  統計は {unitLabel(stats.unit)}{' '}
                  基準です。単位を合わせると比較できます。
                </p>
              ) : (
                <p className="text-xs text-stone-500">
                  初回なので比較対象の過去統計はまだありません。
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-stone-500">
              総額と数量を入れると単価が出ます。
            </p>
          )}

          {error && <p className="text-xs text-red-700">{error}</p>}
          {savedMsg && <p className="text-xs text-teal-800">{savedMsg}</p>}

          <button
            type="submit"
            disabled={saving || trialValue == null}
            className="rounded-md bg-stone-900 px-3 py-2 text-sm text-white hover:bg-stone-800 disabled:opacity-50"
          >
            {saving ? '保存中...' : '統計に残す'}
          </button>
        </form>
      )}
    </li>
  )
}

function StatCell({
  label,
  value,
  highlight,
  sub,
}: {
  label: string
  value: number
  highlight?: boolean
  sub?: string
}) {
  return (
    <div>
      <p className="text-[10px] tracking-wide text-stone-500">{label}</p>
      <p
        className={
          highlight
            ? 'text-sm font-semibold text-teal-800'
            : 'text-sm font-medium text-stone-900'
        }
      >
        {formatYen(value, 1)}
      </p>
      {sub && <p className="text-[10px] text-stone-400">{sub}</p>}
    </div>
  )
}

function CompareLine({
  label,
  baseline,
  current,
}: {
  label: string
  baseline: number
  current: number
}) {
  const d = diffVs(current, baseline)
  const cheaper = d < 0
  const same = Math.abs(d) < 0.005
  return (
    <li>
      {label} {formatYen(baseline, 1)} との差{' '}
      <span
        className={
          same
            ? 'text-stone-600'
            : cheaper
              ? 'font-medium text-teal-800'
              : 'font-medium text-amber-800'
        }
      >
        {same
          ? 'ほぼ同じ'
          : `${formatDiff(d, 1)}（${cheaper ? '安い' : '高い'}）`}
      </span>
    </li>
  )
}
