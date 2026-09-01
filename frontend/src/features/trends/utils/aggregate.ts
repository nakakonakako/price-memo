import type { PriceRecord, PriceUnit } from '@/features/records/types'
import {
  perHundredPrice,
  supportsPerHundred,
  unitPrice,
} from '@/features/records/utils/unitPrice'

export type PriceBasis = 'per_unit' | 'per_100'

export type TrendPoint = {
  id: string
  date: string
  store: string
  value: number
  price: number
  amount: number
  unit: PriceUnit
}

export type StoreSummary = {
  store: string
  count: number
  avg: number
  min: number
}

export function dominantUnit(records: PriceRecord[]): PriceUnit | null {
  if (records.length === 0) return null
  const counts = new Map<PriceUnit, number>()
  for (const r of records) {
    counts.set(r.unit, (counts.get(r.unit) ?? 0) + 1)
  }
  let best: PriceUnit | null = null
  let bestCount = -1
  for (const [unit, count] of counts) {
    if (count > bestCount) {
      best = unit
      bestCount = count
    }
  }
  return best
}

export function recordValue(
  record: PriceRecord,
  basis: PriceBasis,
): number | null {
  if (basis === 'per_100') {
    if (!supportsPerHundred(record.unit)) return null
    return perHundredPrice(record.price, record.amount, record.unit)
  }
  return unitPrice(record.price, record.amount)
}

export function toTrendPoints(
  records: PriceRecord[],
  unit: PriceUnit,
  basis: PriceBasis,
): TrendPoint[] {
  const points: TrendPoint[] = []
  for (const r of records) {
    if (r.unit !== unit) continue
    const value = recordValue(r, basis)
    if (value == null) continue
    points.push({
      id: r.id,
      date: r.recorded_at,
      store: r.store_name,
      value,
      price: r.price,
      amount: r.amount,
      unit: r.unit,
    })
  }
  return points.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date)
    return a.store.localeCompare(b.store, 'ja')
  })
}

/** 時系列順に点を並べ、線で結ぶ Recharts 用データ */
export function toChronologicalChartData(
  points: TrendPoint[],
): { date: string; value: number; store: string }[] {
  return points.map((p) => ({
    date: p.date,
    value: p.value,
    store: p.store,
  }))
}

/** Recharts 用: 日付行 × 店舗列（欠けは null） */
export function toMultiStoreChartData(
  points: TrendPoint[],
): { dates: string[]; stores: string[]; rows: Record<string, string | number | null>[] } {
  const stores = [...new Set(points.map((p) => p.store))].sort((a, b) =>
    a.localeCompare(b, 'ja'),
  )
  const dates = [...new Set(points.map((p) => p.date))].sort()
  const rows = dates.map((date) => {
    const row: Record<string, string | number | null> = { date }
    for (const store of stores) {
      const matches = points.filter((p) => p.date === date && p.store === store)
      if (matches.length === 0) {
        row[store] = null
      } else {
        // 同日同店が複数なら平均
        row[store] =
          matches.reduce((sum, p) => sum + p.value, 0) / matches.length
      }
    }
    return row
  })
  return { dates, stores, rows }
}

export function summarizeByStore(points: TrendPoint[]): StoreSummary[] {
  const byStore = new Map<string, TrendPoint[]>()
  for (const p of points) {
    const list = byStore.get(p.store) ?? []
    list.push(p)
    byStore.set(p.store, list)
  }

  const summaries: StoreSummary[] = []
  for (const [store, list] of byStore) {
    const values = list.map((p) => p.value)
    summaries.push({
      store,
      count: list.length,
      avg: values.reduce((a, b) => a + b, 0) / values.length,
      min: Math.min(...values),
    })
  }

  return summaries.sort((a, b) => a.store.localeCompare(b.store, 'ja'))
}

export const STORE_COLORS = [
  '#1c1917',
  '#b45309',
  '#0f766e',
  '#1d4ed8',
  '#7c3aed',
  '#be123c',
  '#365314',
  '#9a3412',
]
