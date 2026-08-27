import { useEffect, useMemo, useState, type FormEvent, type MouseEvent } from 'react'
import { TrashDragItem } from '@/components/trash/TrashDragItem'
import { StoreField } from '@/components/StoreField'
import { parseFolderName } from '@/features/folders/utils/folderName'
import { UnitField } from '@/features/records/components/UnitField'
import { createRecord } from '@/features/records/api/recordsApi'
import type { PriceRecord, PriceUnit } from '@/features/records/types'
import {
  formatYen,
  todayISODate,
  unitLabel,
} from '@/features/records/utils/unitPrice'
import { toUserMessage } from '@/lib/userError'
import {
  canCompareToStats,
  computeAllFolderStats,
  defaultBasis,
  diffVs,
  formatDiff,
  trialDisplayValue,
  unitsInRecords,
  valueLabelFor,
  type FolderStats,
} from '../utils/stats'

type Props = {
  folderId: string
  folderName: string
  records: PriceRecord[]
  colorClass?: string
  forceOpen?: boolean
  onForceOpenHandled?: () => void
  rootRef?: (el: HTMLElement | null) => void
  onSaved: (record: PriceRecord) => void
}

export function FolderMemoCard({
  folderId,
  folderName,
  records,
  colorClass = 'border-stone-200 bg-white',
  forceOpen = false,
  onForceOpenHandled,
  rootRef,
  onSaved,
}: Props) {
  const displayName = parseFolderName(folderName).displayName
  const allStats = useMemo(() => computeAllFolderStats(records), [records])
  const preferredUnits = useMemo(() => unitsInRecords(records), [records])
  const [statsUnit, setStatsUnit] = useState<PriceUnit | null>(null)
  const activeStats: FolderStats | null = useMemo(() => {
    if (allStats.length === 0) return null
    if (statsUnit) {
      return allStats.find((s) => s.unit === statsUnit) ?? null
    }
    return allStats[0]
  }, [allStats, statsUnit])

  const unitColumns = useMemo(() => {
    if (allStats.length <= 1) return []
    const cols: PriceUnit[][] = []
    for (let i = 0; i < allStats.length; i += 2) {
      cols.push(allStats.slice(i, i + 2).map((s) => s.unit))
    }
    return cols
  }, [allStats])

  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [unit, setUnit] = useState<PriceUnit>('g')
  const [price, setPrice] = useState('')
  const [store, setStore] = useState('')
  const [note, setNote] = useState('')
  const [recordedAt, setRecordedAt] = useState(todayISODate())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!forceOpen) return
    setOpen(true)
    setError(null)
    setSavedMsg(null)
    onForceOpenHandled?.()
  }, [forceOpen, onForceOpenHandled])

  const priceN = Number(price)
  const amountN = Number(amount)
  const compareOk = canCompareToStats(unit, activeStats)
  const trialBasis =
    compareOk && activeStats ? activeStats.basis : defaultBasis(unit)
  const trialValue = trialDisplayValue(priceN, amountN, unit, trialBasis)
  const displayLabel =
    compareOk && activeStats
      ? activeStats.valueLabel
      : valueLabelFor(unit, defaultBasis(unit))

  const fieldClass =
    'w-full rounded-md border border-stone-300 bg-white px-2.5 py-2 text-sm outline-none focus:border-stone-500'

  const setTrialUnit = (next: PriceUnit) => {
    setUnit(next)
    setStatsUnit(next)
  }

  const handleStatsUnitChange = (next: PriceUnit, e: MouseEvent) => {
    e.stopPropagation()
    setStatsUnit(next)
    setUnit(next)
  }

  const handleOpen = () => {
    setOpen((v) => {
      const next = !v
      if (next && activeStats) {
        setUnit(activeStats.unit)
        setStatsUnit(activeStats.unit)
      }
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
      setError('内容量は 0 より大きくしてください')
      return
    }
    if (!unit.trim()) {
      setError('単位を入力してください')
      return
    }
    if (!recordedAt) {
      setError('確認日を入力してください')
      return
    }

    setSaving(true)
    try {
      const created = await createRecord({
        folder_id: folderId,
        recorded_at: recordedAt,
        store_name: store,
        price: priceN,
        amount: amountN,
        unit: unit.trim(),
        note: note.trim() || null,
      })
      setSavedMsg('統計に残しました')
      setPrice('')
      setAmount('')
      setNote('')
      setStatsUnit(created.unit)
      onSaved(created)
    } catch (err) {
      setError(toUserMessage(err, '保存に失敗しました。'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <li className="list-none" ref={rootRef}>
      <TrashDragItem
        payload={{ kind: 'memo-folder', id: folderId }}
        onClick={handleOpen}
        className={`overflow-hidden rounded-lg border shadow-sm transition-colors ${colorClass} ${
          open ? 'ring-1 ring-stone-400' : 'hover:brightness-[0.99]'
        }`}
      >
        <div className="px-3 py-2.5">
          <div className="flex items-start gap-2 sm:items-center">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span
                  className={`shrink-0 text-stone-400 transition-transform ${open ? 'rotate-90' : ''}`}
                  aria-hidden
                >
                  ▸
                </span>
                <p className="truncate text-base font-semibold text-stone-900 sm:text-lg">
                  {displayName}
                </p>
              </div>
            </div>

            {activeStats ? (
              <div className="grid shrink-0 grid-cols-3 gap-3 text-center sm:gap-4">
                <StatCell label="平均" value={activeStats.avg} />
                <StatCell label="最安" value={activeStats.min} highlight />
                <StatCell
                  label="直近"
                  value={activeStats.latest}
                  sub={activeStats.latestDate}
                />
              </div>
            ) : null}

            {unitColumns.length > 0 && (
              <div
                className="flex shrink-0 gap-1 self-center"
                data-no-trash-drag
                onClick={(e) => e.stopPropagation()}
              >
                {unitColumns.map((col, colIdx) => (
                  <div key={colIdx} className="flex flex-col gap-0.5">
                    {col.map((u) => {
                      const active = u === activeStats?.unit
                      return (
                        <button
                          key={u}
                          type="button"
                          onClick={(e) => handleStatsUnitChange(u, e)}
                          className={
                            active
                              ? 'min-w-[2rem] rounded bg-stone-900 px-1.5 py-0.5 text-[11px] text-white'
                              : 'min-w-[2rem] rounded border border-stone-300 bg-white px-1.5 py-0.5 text-[11px] text-stone-600 hover:bg-stone-50'
                          }
                        >
                          {unitLabel(u)}
                        </button>
                      )
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>

          {!open && (
            <p className="mt-2 border-t border-dashed border-stone-200 pt-2 text-center text-[11px] text-stone-400">
              タップして入力 · ドラッグで並べ替え / 削除
            </p>
          )}
        </div>

        {open && (
          <form
            onSubmit={(e) => void handleSave(e)}
            data-no-trash-drag
            className="space-y-3 border-t border-stone-200/80 bg-white/50 px-3 py-3"
            onClick={(e) => e.stopPropagation()}
          >
          <p className="text-sm text-stone-600">
            内容量と値段を入れると単価が出ます。
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs text-stone-500">確認日</span>
              <input
                type="date"
                className={fieldClass}
                value={recordedAt}
                onChange={(e) => setRecordedAt(e.target.value)}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-stone-500">店名（保存時必須）</span>
              <StoreField
                value={store}
                onChange={setStore}
                className={fieldClass}
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-xs text-stone-500">値段（円・総額）</span>
                <div className="relative">
                  <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-stone-400">
                    ¥
                  </span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    className="w-full rounded-md border border-stone-300 bg-white py-2 pl-7 pr-2.5 text-sm outline-none focus:border-stone-500"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="398"
                  />
                </div>
              </label>

              <div className="space-y-1">
                <span className="text-xs text-stone-500">内容量</span>
                <div className="flex min-w-0 overflow-hidden rounded-md border border-stone-300 bg-white focus-within:border-stone-500">
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    className="min-w-0 flex-1 border-0 bg-transparent px-2.5 py-2 text-sm outline-none"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="250"
                  />
                  <div className="w-[4.5rem] shrink-0 border-l border-stone-200 bg-stone-50 [&_select]:border-0 [&_select]:bg-transparent [&_select]:py-2 [&_select]:text-sm">
                    <UnitField
                      value={unit}
                      onChange={setTrialUnit}
                      preferredUnits={preferredUnits}
                      className="w-full border-0 bg-transparent px-1 py-2 text-sm outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-[1fr_auto] items-end gap-2">
              <label className="space-y-1">
                <span className="text-xs text-stone-500">補足など</span>
                <input
                  type="text"
                  className={fieldClass}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder=""
                />
              </label>

              <button
                type="submit"
                disabled={saving || trialValue == null}
                className="h-[42px] shrink-0 rounded-md bg-stone-900 px-4 text-sm text-white hover:bg-stone-800 disabled:opacity-50 sm:whitespace-nowrap"
              >
                {saving ? '保存中...' : '統計に残す'}
              </button>
            </div>
          </div>

          {trialValue != null ? (
            <div className="space-y-2 rounded-md border border-stone-200 bg-white px-4 py-3">
              <p className="text-base text-stone-900">
                今の単価{' '}
                <span className="text-lg font-bold">
                  {formatYen(trialValue, 2)}
                </span>{' '}
                <span className="text-sm text-stone-500">({displayLabel})</span>
              </p>
              {compareOk && activeStats ? (
                <ul className="space-y-1 text-sm text-stone-700">
                  <CompareLine
                    label="平均"
                    baseline={activeStats.avg}
                    current={trialValue}
                  />
                  <CompareLine
                    label="最安"
                    baseline={activeStats.min}
                    current={trialValue}
                  />
                  <CompareLine
                    label="直近"
                    baseline={activeStats.latest}
                    current={trialValue}
                  />
                </ul>
              ) : (
                <p className="text-sm text-stone-500">
                  {unitLabel(unit)} の過去データがないため、比較はまだできません。
                </p>
              )}
            </div>
          ) : null}

          {error && <p className="text-sm text-red-700">{error}</p>}
          {savedMsg && <p className="text-sm text-teal-800">{savedMsg}</p>}
        </form>
      )}
      </TrashDragItem>
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
    <div className="min-w-[3.5rem]">
      <p className="text-[10px] tracking-wide text-stone-500">{label}</p>
      <p
        className={
          highlight
            ? 'text-lg font-bold tabular-nums leading-tight text-teal-800 sm:text-xl'
            : 'text-lg font-semibold tabular-nums leading-tight text-stone-900 sm:text-xl'
        }
      >
        {formatYen(value, 1)}
      </p>
      {sub && <p className="text-[9px] text-stone-400">{sub}</p>}
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
              ? 'font-semibold text-teal-800'
              : 'font-semibold text-amber-800'
        }
      >
        {same
          ? 'ほぼ同じ'
          : `${formatDiff(d, 1)}（${cheaper ? '安い' : '高い'}）`}
      </span>
    </li>
  )
}
