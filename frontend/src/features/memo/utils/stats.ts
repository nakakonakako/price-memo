import type { PriceRecord, PriceUnit } from '@/features/records/types'
import {
  perHundredPrice,
  unitLabel,
  unitPrice,
} from '@/features/records/utils/unitPrice'
import {
  dominantUnit,
  toTrendPoints,
  type PriceBasis,
} from '@/features/trends/utils/aggregate'

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
  return unit === 'piece' ? 'per_unit' : 'per_100'
}

export function valueLabelFor(unit: PriceUnit, basis: PriceBasis): string {
  if (basis === 'per_100') return `円/100${unitLabel(unit)}`
  return `円/${unitLabel(unit)}`
}

export function computeFolderStats(
  records: PriceRecord[],
): FolderStats | null {
  const unit = dominantUnit(records)
  if (!unit) return null
  const basis = defaultBasis(unit)
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

/** 試算単位と統計単位が揃っているときだけ比較可能 */
export function canCompareToStats(
  trialUnit: PriceUnit,
  stats: FolderStats | null,
): boolean {
  if (!stats) return false
  if (trialUnit !== stats.unit) return false
  if (stats.basis === 'per_100' && trialUnit === 'piece') return false
  return true
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
