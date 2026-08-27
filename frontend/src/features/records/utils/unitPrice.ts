import type { PriceUnit } from '../types'

/** Built-in presets. DB accepts any non-blank unit string. */
export const UNIT_PRESETS: { value: PriceUnit; label: string }[] = [
  { value: 'g', label: 'g' },
  { value: 'ml', label: 'ml' },
  { value: 'piece', label: '個' },
]

/** @deprecated use UNIT_PRESETS */
export const UNIT_OPTIONS = UNIT_PRESETS

export const CUSTOM_UNIT_VALUE = '__custom__'

export function unitLabel(unit: PriceUnit): string {
  if (unit === 'piece') return '個'
  return UNIT_PRESETS.find((o) => o.value === unit)?.label ?? unit
}

/** Only g / ml use 100-unit basis by default */
export function supportsPerHundred(unit: PriceUnit): boolean {
  return unit === 'g' || unit === 'ml'
}

/** 円 / 単位量（例: 円/g） */
export function unitPrice(price: number, amount: number): number | null {
  if (!(amount > 0)) return null
  return price / amount
}

/** g / ml のとき 100 単位あたり。それ以外は null */
export function perHundredPrice(
  price: number,
  amount: number,
  unit: PriceUnit,
): number | null {
  if (!supportsPerHundred(unit)) return null
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

/**
 * Options ordered as: used units first (folder history), then remaining presets.
 * `current` is always included.
 */
export function mergeUnitOptions(
  usedUnits: Iterable<PriceUnit> = [],
  current?: PriceUnit,
): { value: PriceUnit; label: string }[] {
  const result: { value: PriceUnit; label: string }[] = []
  const seen = new Set<string>()

  const push = (raw: PriceUnit) => {
    const value = raw.trim()
    if (!value || seen.has(value)) return
    seen.add(value)
    result.push({ value, label: unitLabel(value) })
  }

  for (const u of usedUnits) push(u)
  if (current) push(current)
  for (const p of UNIT_PRESETS) push(p.value)
  return result
}
