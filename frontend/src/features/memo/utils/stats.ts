import type { PriceRecord, PriceUnit } from '@/features/records/types'
import {
  perHundredPrice,
  supportsPerHundred,
  unitLabel,
  unitPrice,
} from '@/features/records/utils/unitPrice'
import { toTrendPoints, type PriceBasis } from '@/features/trends/utils/aggregate'

export type FolderStats = {
  unit: PriceUnit
  basis: PriceBasis
  valueLabel: string
  count: number
  avg: number
  min: number
  latest: number
  latestDate: string
}

export function defaultBasis(unit: PriceUnit): PriceBasis {
  return supportsPerHundred(unit) ? 'per_100' : 'per_unit'
}

export function valueLabelFor(unit: PriceUnit, basis: PriceBasis): string {
  if (basis === 'per_100') return `円/100${unitLabel(unit)}`
  return `円/${unitLabel(unit)}`
}

export function unitsInRecords(records: PriceRecord[]): PriceUnit[] {
  const set = new Set<string>()
  for (const r of records) {
    const u = r.unit.trim()
    if (u) set.add(u)
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'ja'))
}

export function recordsForStoreScope(
  records: PriceRecord[],
  storeName: string,
): PriceRecord[] {
  const name = storeName.trim()
  if (!name) return records
  return records.filter((r) => r.store_name === name)
}

/** 当該フォルダ記録に実在する store_name の重複なし一覧（出現順）。 */
export function uniqueStoreNamesInRecords(records: PriceRecord[]): string[] {
  const seen = new Set<string>()
  const names: string[] = []
  for (const r of records) {
    const name = r.store_name
    if (!name.trim() || seen.has(name)) continue
    seen.add(name)
    names.push(name)
  }
  return names
}

export function computeStatsForUnit(
  records: PriceRecord[],
  unit: PriceUnit,
  basis: PriceBasis = defaultBasis(unit),
): FolderStats | null {
  const points = toTrendPoints(records, unit, basis)
  if (points.length === 0) return null

  const values = points.map((p) => p.value)
  const latest = [...points].sort((a, b) => b.date.localeCompare(a.date))[0]

  return {
    unit,
    basis,
    valueLabel: valueLabelFor(unit, basis),
    count: points.length,
    avg: values.reduce((a, b) => a + b, 0) / values.length,
    min: Math.min(...values),
    latest: latest.value,
    latestDate: latest.date,
  }
}

export function computeAllFolderStats(records: PriceRecord[]): FolderStats[] {
  return unitsInRecords(records)
    .map((unit) => computeStatsForUnit(records, unit))
    .filter((s): s is FolderStats => s != null)
}

/** Empty input is not a trial price; explicit `0` is valid. */
export function parseTrialPriceInput(raw: string): number | null {
  if (raw.trim() === '') return null
  const n = Number(raw)
  if (!Number.isFinite(n)) return null
  return n
}

export function trialDisplayValue(
  price: number,
  amount: number,
  unit: PriceUnit,
  basis: PriceBasis,
): number | null {
  if (!(price >= 0) || !(amount > 0)) return null
  if (basis === 'per_100') {
    return perHundredPrice(price, amount, unit)
  }
  return unitPrice(price, amount)
}

export function canCompareToStats(
  trialUnit: PriceUnit,
  stats: FolderStats | null,
): boolean {
  if (!stats) return false
  return trialUnit === stats.unit
}

export function diffVs(current: number, baseline: number): number {
  return current - baseline
}

export function formatDiff(diff: number, digits = 1): string {
  const sign = diff > 0 ? '+' : ''
  return `${sign}${diff.toLocaleString('ja-JP', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  })}`
}

export function isSameComparisonDiff(diff: number): boolean {
  return diff >= -0.005 && diff <= 0.005
}

export function formatComparisonDiffLabel(diff: number, digits = 1): string {
  if (isSameComparisonDiff(diff)) return '±0円'
  const cheaper = diff < -0.005
  return `${formatDiff(diff, digits)}円${cheaper ? '↓' : '↑'}`
}

/** Keeps long mobile diffs on one line within a ~⅓ card column. */
export function comparisonDiffFontClass(label: string, desktop: boolean): string {
  const base = 'max-w-full overflow-hidden text-ellipsis whitespace-nowrap tabular-nums leading-tight'
  if (desktop) {
    return `${base} text-base sm:text-lg`
  }
  const len = label.length
  if (len <= 9) return `${base} text-base`
  if (len <= 11) return `${base} text-sm leading-none`
  if (len <= 13) return `${base} text-xs leading-none`
  return `${base} text-[10px] leading-none`
}

export function recordsByFolderId(
  records: PriceRecord[],
): Map<string, PriceRecord[]> {
  const map = new Map<string, PriceRecord[]>()
  for (const r of records) {
    const list = map.get(r.folder_id) ?? []
    list.push(r)
    map.set(r.folder_id, list)
  }
  return map
}
