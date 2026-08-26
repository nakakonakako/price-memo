import type { PriceUnit } from '../types'

export const UNIT_OPTIONS: { value: PriceUnit; label: string }[] = [
  { value: 'g', label: 'g' },
  { value: 'ml', label: 'ml' },
  { value: 'piece', label: '個' },
]

export function unitLabel(unit: PriceUnit): string {
  return UNIT_OPTIONS.find((o) => o.value === unit)?.label ?? unit
}

/** 円 / 単位量（例: 円/g） */
export function unitPrice(price: number, amount: number): number | null {
  if (!(amount > 0)) return null
  return price / amount
}

/** g / ml のとき 100 単位あたり。piece は null */
export function perHundredPrice(
  price: number,
  amount: number,
  unit: PriceUnit,
): number | null {
  if (unit === 'piece') return null
  const per = unitPrice(price, amount)
  if (per == null) return null
  return per * 100
}

export function formatYen(n: number, digits = 2): string {
  return `¥${n.toLocaleString('ja-JP', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  })}`
}

export function todayISODate(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
