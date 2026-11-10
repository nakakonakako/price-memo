import type {
  PriceRecord,
  PriceRecordInput,
  PriceUnit,
} from '../types'
import { todayISODate } from '../utils/unitPrice'

export type RecordFormState = {
  recorded_at: string
  store_name: string
  price: string
  amount: string
  unit: PriceUnit
  note: string
}

export function emptyRecordForm(): RecordFormState {
  return {
    recorded_at: todayISODate(),
    store_name: '',
    price: '',
    amount: '',
    unit: 'g',
    note: '',
  }
}

export function recordToFormState(record: PriceRecord): RecordFormState {
  return {
    recorded_at: record.recorded_at,
    store_name: record.store_name,
    price: String(record.price),
    amount: String(record.amount),
    unit: record.unit,
    note: record.note ?? '',
  }
}

/** Pre-fill a new record from an existing one (today's date, no receipt link). */
export function recordToCopyFormState(record: PriceRecord): RecordFormState {
  return {
    recorded_at: todayISODate(),
    store_name: record.store_name,
    price: String(record.price),
    amount: String(record.amount),
    unit: record.unit,
    note: record.note ?? '',
  }
}

export function parseRecordForm(
  folderId: string,
  form: RecordFormState,
): PriceRecordInput | string {
  const price = Number(form.price)
  const amount = Number(form.amount)
  if (!form.recorded_at) return '購入日を入力してください'
  if (!form.store_name.trim()) return '店舗名を入力してください'
  if (!Number.isFinite(price) || price < 0) return '価格が不正です'
  if (!Number.isInteger(price)) return '価格は整数（円）で入力してください'
  if (!Number.isFinite(amount) || amount <= 0) return '数量が不正です'
  if (!form.unit.trim()) return '単位を入力してください'
  return {
    folder_id: folderId,
    recorded_at: form.recorded_at,
    store_name: form.store_name,
    price,
    amount,
    unit: form.unit.trim(),
    note: form.note,
  }
}
