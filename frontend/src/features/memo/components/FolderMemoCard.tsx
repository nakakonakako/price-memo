import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
} from 'react'
import { DraggableCatalogItem } from '@/components/catalog/DraggableCatalogItem'
import { useMobileReorderOptional } from './MemoMobileReorderContext'
import {
  MemoMobileReorderA11yControls,
  MemoMobileReorderGestureRoot,
  MemoMobileReorderInsertMarker,
  MemoMobileReorderItemRegistrar,
} from './MemoMobileReorder'
import { DateInput } from '@/components/DateInput'
import { StoreField } from '@/components/StoreField'
import { useMediaQuery } from '@/hooks/useMediaQuery'
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
  comparisonDiffFontClass,
  diffVs,
  formatComparisonDiffLabel,
  isSameComparisonDiff,
  parseTrialPriceInput,
  recordsForStoreScope,
  trialDisplayValue,
  uniqueStoreNamesInRecords,
  unitsInRecords,
  type FolderStats,
} from '../utils/stats'

export type RecordStoreCandidate = {
  recordedAt: string
  storeName: string
}

type Props = {
  folderId: string
  folderName: string
  records: PriceRecord[]
  recordStoreCandidate?: RecordStoreCandidate | null
  colorClass?: string
  forceOpen?: boolean
  onForceOpenHandled?: () => void
  rootRef?: (el: HTMLElement | null) => void
  onSaved: (record: PriceRecord) => void
  dragEnabled?: boolean
  mobileReorderEnabled?: boolean
  mobileReorderIndex?: number
  mobileReorderTotal?: number
  onRemoveFromMemo?: () => void
  onOpenFolder?: () => void
}

export function FolderMemoCard({
  folderId,
  folderName,
  records,
  recordStoreCandidate = null,
  colorClass = 'border-stone-200 bg-white',
  forceOpen = false,
  onForceOpenHandled,
  rootRef,
  onSaved,
  dragEnabled = true,
  mobileReorderEnabled = false,
  mobileReorderIndex = 0,
  mobileReorderTotal = 1,
  onRemoveFromMemo,
  onOpenFolder,
}: Props) {
  const isMobile = useMediaQuery('(max-width: 1023px)')
  const listItemRef = useRef<HTMLElement | null>(null)
  const [listItemEl, setListItemEl] = useState<HTMLElement | null>(null)
  const mobileReorder = useMobileReorderOptional()
  const isReorderLifted =
    mobileReorderEnabled && mobileReorder?.activeId === folderId
  const compactListDisplay =
    mobileReorderEnabled && (mobileReorder?.compactListDisplay ?? false)
  const displayName = folderName
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [unit, setUnit] = useState<PriceUnit>('g')
  const [price, setPrice] = useState('')
  const [compareStore, setCompareStore] = useState('')
  const [recordStore, setRecordStore] = useState('')
  const [note, setNote] = useState('')
  const [recordedAt, setRecordedAt] = useState(todayISODate())
  const [recordSectionOpen, setRecordSectionOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)
  const [statsUnit, setStatsUnit] = useState<PriceUnit | null>(null)

  const compareStoreCandidates = useMemo(
    () => uniqueStoreNamesInRecords(records),
    [records],
  )

  const [recordsSnapshot, setRecordsSnapshot] = useState(records)
  if (records !== recordsSnapshot) {
    setRecordsSnapshot(records)
    const selected = compareStore.trim()
    if (selected && !records.some((r) => r.store_name === selected)) {
      setCompareStore('')
    }
  }

  const statsRecords = useMemo(
    () => recordsForStoreScope(records, compareStore),
    [records, compareStore],
  )
  const allStats = useMemo(
    () => computeAllFolderStats(statsRecords),
    [statsRecords],
  )
  const preferredUnits = useMemo(() => unitsInRecords(records), [records])
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

  const isOpen = open || forceOpen

  useEffect(() => {
    if (!forceOpen) return
    const frame = requestAnimationFrame(() => {
      setError(null)
      setSavedMsg(null)
      onForceOpenHandled?.()
    })
    return () => cancelAnimationFrame(frame)
  }, [forceOpen, onForceOpenHandled])

  const priceN = parseTrialPriceInput(price)
  const amountN = Number(amount)
  const compareOk = canCompareToStats(unit, activeStats)
  const trialBasis =
    compareOk && activeStats ? activeStats.basis : defaultBasis(unit)
  const trialValue =
    priceN != null
      ? trialDisplayValue(priceN, amountN, unit, trialBasis)
      : null
  const showStatDiffs =
    isOpen &&
    !compactListDisplay &&
    compareOk &&
    activeStats != null &&
    trialValue != null

  const fieldClass =
    'w-full rounded-md border border-stone-300 bg-white px-2.5 py-2 text-sm outline-none focus:border-stone-500'

  const openFolderButton =
    isOpen && onOpenFolder ? (
      <button
        type="button"
        data-no-trash-drag
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation()
          onOpenFolder()
        }}
        className="shrink-0 whitespace-nowrap rounded px-1 py-0.5 text-xs text-stone-400 hover:bg-black/5 hover:text-stone-600"
      >
        フォルダへ
      </button>
    ) : null

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

  const openRecordSection = () => {
    setRecordSectionOpen(true)
    setError(null)
    setSavedMsg(null)
    if (
      recordStoreCandidate?.recordedAt === recordedAt &&
      recordStoreCandidate.storeName.trim() &&
      !recordStore.trim()
    ) {
      setRecordStore(recordStoreCandidate.storeName)
    }
  }

  const handleSave = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSavedMsg(null)
    if (!recordStore.trim()) {
      setError('保存するには記録先の店名が必要です')
      return
    }
    if (price.trim() === '') {
      setError('価格は 0 以上の整数（円）で入力してください')
      return
    }
    const savePrice = Number(price)
    if (
      !Number.isFinite(savePrice) ||
      savePrice < 0 ||
      !Number.isInteger(savePrice)
    ) {
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
        store_name: recordStore,
        price: savePrice,
        amount: amountN,
        unit: unit.trim(),
        note: note.trim() || null,
      })
      setSavedMsg('統計に残しました')
      setNote('')
      setStatsUnit(created.unit)
      onSaved(created)
    } catch (err) {
      setError(toUserMessage(err, '保存に失敗しました。'))
    } finally {
      setSaving(false)
    }
  }

  const setLiRef = (el: HTMLElement | null) => {
    listItemRef.current = el
    setListItemEl(el)
    rootRef?.(el)
  }

  return (
    <li className="list-none" ref={setLiRef}>
      {mobileReorderEnabled && (
        <>
          <MemoMobileReorderInsertMarker folderId={folderId} />
          <MemoMobileReorderItemRegistrar folderId={folderId} rootRef={listItemEl} />
        </>
      )}
      {isReorderLifted && (
        <div
          aria-hidden
          className={`rounded-lg border-2 border-dashed border-stone-300 bg-stone-100/80 ${colorClass}`}
          style={
            mobileReorder?.activePlaceholderHeight != null
              ? { height: mobileReorder.activePlaceholderHeight }
              : { minHeight: '4.5rem' }
          }
        />
      )}
      <div className="relative flex min-w-0 items-start gap-0.5">
        <MemoMobileReorderGestureRoot
          folderId={folderId}
          cardRootRef={listItemRef}
        >
        <div
          className={`min-w-0 flex-1 ${
            isReorderLifted ? 'absolute inset-x-0 top-0 opacity-0' : ''
          }`}
          aria-hidden={isReorderLifted ? true : undefined}
        >
      <DraggableCatalogItem
        dragEnabled={dragEnabled}
        payload={{ kind: 'memo-folder', id: folderId }}
        onClick={isMobile ? undefined : handleOpen}
        onDelete={() => onRemoveFromMemo?.()}
        className={`overflow-hidden rounded-lg border shadow-sm transition-colors ${colorClass} ${
          isOpen && !compactListDisplay
            ? 'ring-1 ring-stone-400'
            : 'hover:brightness-[0.99]'
        } ${compactListDisplay ? 'select-none' : ''}`}
      >
        <div className="px-3 py-2.5">
          {isMobile ? (
            <div className="space-y-2">
              <div className="relative flex min-w-0 items-center gap-1">
                <div
                  data-memo-card-toggle
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5"
                  onClick={handleOpen}
                >
                  <span
                    className={`shrink-0 text-stone-400 transition-transform ${
                      isOpen && !compactListDisplay ? 'rotate-90' : ''
                    }`}
                    aria-hidden
                  >
                    ▸
                  </span>
                  <p
                    data-memo-compact-title
                    className="min-w-0 flex-1 truncate text-left text-base font-semibold text-stone-900"
                  >
                    {displayName}
                  </p>
                  {openFolderButton}
                </div>
                {mobileReorderEnabled && (
                  <MemoMobileReorderA11yControls
                    folderId={folderId}
                    folderName={displayName}
                    index={mobileReorderIndex}
                    total={mobileReorderTotal}
                  />
                )}
              </div>

              {activeStats ? (
                <div
                  data-memo-card-toggle
                  className={`cursor-pointer text-center ${compactListDisplay ? 'hidden' : ''}`}
                  onClick={handleOpen}
                >
                  <MemoStatsGrid
                    activeStats={activeStats}
                    showStatDiffs={showStatDiffs}
                    trialValue={trialValue}
                  />
                  {!isOpen &&
                    (compareStore.trim() || activeStats.latestDate) && (
                    <div className="mt-0.5 inline-grid grid-cols-3 gap-3">
                      {compareStore.trim() ? (
                        <p className="col-span-2 truncate text-[9px] text-stone-400">
                          {compareStore.trim()}
                        </p>
                      ) : (
                        <div className="col-span-2" aria-hidden />
                      )}
                      {activeStats.latestDate ? (
                        <p className="text-[9px] text-stone-400">
                          {activeStats.latestDate}
                        </p>
                      ) : (
                        <div aria-hidden />
                      )}
                    </div>
                  )}
                </div>
              ) : records.length > 0 && compareStore.trim() ? (
                <p
                  className={`text-center text-[11px] text-stone-500 ${compactListDisplay ? 'hidden' : ''}`}
                >
                  この店の記録なし
                </p>
              ) : null}

              {unitColumns.length > 0 && (
                <div
                  className={`flex justify-center gap-1 ${compactListDisplay ? 'hidden' : ''}`}
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
          ) : (
          <div className="flex items-start gap-2 sm:items-center">
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-1.5">
                <span
                  className={`shrink-0 text-stone-400 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                  aria-hidden
                >
                  ▸
                </span>
                <p className="min-w-0 flex-1 truncate text-base font-semibold text-stone-900 sm:text-lg">
                  {displayName}
                </p>
                {openFolderButton}
              </div>
            </div>

            {activeStats ? (
              <div className="shrink-0 text-center">
                <MemoStatsGrid
                  activeStats={activeStats}
                  showStatDiffs={showStatDiffs}
                  trialValue={trialValue}
                  desktop
                />
                {!isOpen &&
                  (compareStore.trim() || activeStats.latestDate) && (
                  <div className="mt-0.5 grid grid-cols-3 gap-3 sm:gap-4">
                    {compareStore.trim() ? (
                      <p className="col-span-2 truncate text-[9px] text-stone-400">
                        {compareStore.trim()}
                      </p>
                    ) : (
                      <div className="col-span-2" aria-hidden />
                    )}
                    {activeStats.latestDate ? (
                      <p className="text-[9px] text-stone-400">
                        {activeStats.latestDate}
                      </p>
                    ) : (
                      <div aria-hidden />
                    )}
                  </div>
                )}
              </div>
            ) : records.length > 0 && compareStore.trim() ? (
              <p className="shrink-0 text-right text-[11px] text-stone-500">
                この店の記録なし
              </p>
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
          )}

        </div>

        {isOpen && (
          <form
            onSubmit={(e) => void handleSave(e)}
            className={`space-y-3 border-t border-stone-200/80 bg-white/50 px-3 py-3 ${compactListDisplay ? 'hidden' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            <label className="block min-w-0 space-y-1">
              <span className="text-xs text-stone-500">比較店舗</span>
              <StoreField
                value={compareStore}
                onChange={setCompareStore}
                allowRegister={false}
                candidateNames={compareStoreCandidates}
                placeholder="全店舗の記録と比較"
                clearable
                clearAriaLabel="比較店舗をクリア"
                className={fieldClass}
              />
            </label>

            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-2 gap-y-3 sm:gap-x-3">
              <label className="min-w-0 space-y-1">
                <span className="text-xs text-stone-500">値段</span>
                <div className="relative">
                  <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-stone-400">
                    ¥
                  </span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    aria-label="値段"
                    className="w-full rounded-md border border-stone-300 bg-white py-2 pl-7 pr-2.5 text-sm outline-none focus:border-stone-500"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="398"
                  />
                </div>
              </label>

              <UnitField
                value={unit}
                onChange={setTrialUnit}
                preferredUnits={preferredUnits}
                className="w-full border-0 bg-transparent px-1 py-2 text-sm outline-none"
                customInputClassName={fieldClass}
              >
                {({ select, customInput }) => (
                  <div className="min-w-0 space-y-1">
                    <span className="text-xs text-stone-500">内容量</span>
                    <div className="flex min-w-0 overflow-hidden rounded-md border border-stone-300 bg-white focus-within:border-stone-500">
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="any"
                        aria-label="内容量"
                        className="min-w-0 flex-1 border-0 bg-transparent px-2.5 py-2 text-sm outline-none"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="250"
                      />
                      <div className="w-[4.5rem] shrink-0 border-l border-stone-200 bg-stone-50 [&_select]:border-0 [&_select]:bg-transparent [&_select]:py-2 [&_select]:text-sm">
                        {select}
                      </div>
                    </div>
                    {customInput}
                  </div>
                )}
              </UnitField>
            </div>

            {!recordSectionOpen ? (
              <button
                type="button"
                data-no-trash-drag
                disabled={trialValue == null}
                onClick={openRecordSection}
                className="h-[42px] w-full rounded-md border border-stone-300 bg-white px-4 text-sm text-stone-800 hover:bg-stone-50 disabled:opacity-50"
              >
                この価格を記録
              </button>
            ) : (
              <div className="space-y-3 rounded-md border border-stone-200 bg-white/80 p-3">
                <label className="block min-w-0 space-y-1">
                  <span className="text-xs text-stone-500">記録先店舗</span>
                  <StoreField
                    value={recordStore}
                    onChange={setRecordStore}
                    className={fieldClass}
                  />
                </label>

                <button
                  type="button"
                  data-no-trash-drag
                  onClick={() => setDetailsOpen((v) => !v)}
                  className="flex w-full items-center gap-1 text-left text-xs text-stone-500 hover:text-stone-700"
                >
                  <span
                    className={`text-stone-400 transition-transform ${detailsOpen ? 'rotate-90' : ''}`}
                    aria-hidden
                  >
                    ▸
                  </span>
                  日付・補足
                </button>

                {detailsOpen ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="min-w-0 space-y-1">
                      <span className="text-xs text-stone-500">確認日</span>
                      <DateInput
                        wrapClassName="px-2.5"
                        value={recordedAt}
                        onChange={(e) => setRecordedAt(e.target.value)}
                      />
                    </label>
                    <label className="min-w-0 space-y-1 sm:col-span-1">
                      <span className="text-xs text-stone-500">補足など</span>
                      <input
                        type="text"
                        className={fieldClass}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder=""
                      />
                    </label>
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={saving || trialValue == null}
                  className="h-[42px] w-full shrink-0 rounded-md bg-stone-900 px-4 text-sm text-white hover:bg-stone-800 disabled:opacity-50 sm:w-auto sm:whitespace-nowrap"
                >
                  {saving ? '保存中...' : '統計に残す'}
                </button>
              </div>
            )}

            {error && <p className="text-sm text-red-700">{error}</p>}
            {savedMsg && <p className="text-sm text-teal-800">{savedMsg}</p>}
          </form>
        )}
      </DraggableCatalogItem>
        </div>
        </MemoMobileReorderGestureRoot>
      </div>
    </li>
  )
}

function MemoStatsGrid({
  activeStats,
  showStatDiffs,
  trialValue,
  desktop = false,
}: {
  activeStats: FolderStats
  showStatDiffs: boolean
  trialValue: number | null
  desktop?: boolean
}) {
  const gridClass = desktop
    ? 'grid min-w-0 grid-cols-3 gap-x-1 gap-y-0.5 sm:gap-x-4'
    : 'grid min-w-0 w-full max-w-full grid-cols-3 gap-x-1 gap-y-0.5'
  return (
    <div className="min-w-0">
      <div className={gridClass}>
        <StatCell
          label="平均"
          value={activeStats.avg}
          basisLabel={showStatDiffs ? activeStats.valueLabel : undefined}
          desktop={desktop}
          trialDiff={
            showStatDiffs && trialValue != null
              ? diffVs(trialValue, activeStats.avg)
              : undefined
          }
        />
        <StatCell
          label="最安"
          value={activeStats.min}
          highlightMin={!showStatDiffs}
          desktop={desktop}
          trialDiff={
            showStatDiffs && trialValue != null
              ? diffVs(trialValue, activeStats.min)
              : undefined
          }
        />
        <StatCell
          label="直近"
          value={activeStats.latest}
          desktop={desktop}
          trialDiff={
            showStatDiffs && trialValue != null
              ? diffVs(trialValue, activeStats.latest)
              : undefined
          }
        />
      </div>
    </div>
  )
}

function StatCell({
  label,
  value,
  highlightMin,
  trialDiff,
  basisLabel,
  desktop = false,
}: {
  label: string
  value: number
  highlightMin?: boolean
  trialDiff?: number
  basisLabel?: string
  desktop?: boolean
}) {
  const comparing = trialDiff != null
  const cheaper = comparing && trialDiff < -0.005
  const same = comparing && isSameComparisonDiff(trialDiff)
  const displayLabel = comparing ? `${label}比` : label
  const diffLabel = comparing
    ? formatComparisonDiffLabel(trialDiff)
    : null

  const diffColorClass = same
    ? 'font-semibold text-stone-500'
    : cheaper
      ? 'font-bold text-teal-800'
      : 'font-bold text-amber-800'

  const statMainClass = highlightMin
    ? 'text-lg font-bold tabular-nums leading-tight text-teal-800 sm:text-xl'
    : 'text-lg font-semibold tabular-nums leading-tight text-stone-900 sm:text-xl'

  return (
    <div className="min-w-0 px-0.5">
      <p className="truncate text-[10px] tracking-wide text-stone-500">
        {displayLabel}
        {basisLabel ? (
          <span className="text-stone-400"> {basisLabel}</span>
        ) : null}
      </p>
      {comparing && diffLabel ? (
        <>
          <p
            className={`${diffColorClass} ${comparisonDiffFontClass(diffLabel, desktop)}`}
          >
            {diffLabel}
          </p>
          <p className="truncate text-[9px] tabular-nums text-stone-400">
            {formatYen(value, 1)}
          </p>
        </>
      ) : (
        <p className={statMainClass}>{formatYen(value, 1)}</p>
      )}
    </div>
  )
}
