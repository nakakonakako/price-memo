import { supabase } from '@/lib/supabase'
import type { PriceRecord, PriceRecordInput, ReceiptItemRef } from '../types'

function asNumber(value: unknown): number {
  return typeof value === 'number' ? value : Number(value)
}

function normalize(row: PriceRecord): PriceRecord {
  return {
    ...row,
    price: asNumber(row.price),
    amount: asNumber(row.amount),
  }
}

export async function listRecords(folderId: string): Promise<PriceRecord[]> {
  const { data, error } = await supabase
    .from('price_records')
    .select('*')
    .eq('folder_id', folderId)
    .order('recorded_at', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []).map((row) => normalize(row as PriceRecord))
}

export async function listAllRecords(): Promise<PriceRecord[]> {
  const { data, error } = await supabase
    .from('price_records')
    .select('*')
    .order('recorded_at', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []).map((row) => normalize(row as PriceRecord))
}

export async function createRecord(
  input: PriceRecordInput,
): Promise<PriceRecord> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError) throw userError
  if (!user) throw new Error('ログインが必要です')

  const store = input.store_name.trim()
  if (!store) throw new Error('店舗名を入力してください')
  if (!(input.price >= 0)) throw new Error('価格は 0 以上にしてください')
  if (!(input.amount > 0)) throw new Error('数量は 0 より大きくしてください')

  const { data, error } = await supabase
    .from('price_records')
    .insert({
      user_id: user.id,
      folder_id: input.folder_id,
      recorded_at: input.recorded_at,
      store_name: store,
      price: input.price,
      amount: input.amount,
      unit: input.unit,
      note: input.note?.trim() || null,
      receipt_item_id: input.receipt_item_id ?? null,
    })
    .select()
    .single()

  if (error) throw error
  return normalize(data as PriceRecord)
}

export async function updateRecord(
  id: string,
  input: Omit<PriceRecordInput, 'folder_id'> & { folder_id?: string },
): Promise<PriceRecord> {
  const store = input.store_name.trim()
  if (!store) throw new Error('店舗名を入力してください')
  if (!(input.price >= 0)) throw new Error('価格は 0 以上にしてください')
  if (!(input.amount > 0)) throw new Error('数量は 0 より大きくしてください')

  const payload: Record<string, unknown> = {
    recorded_at: input.recorded_at,
    store_name: store,
    price: input.price,
    amount: input.amount,
    unit: input.unit,
    note: input.note?.trim() || null,
    updated_at: new Date().toISOString(),
  }
  if (input.folder_id) payload.folder_id = input.folder_id
  if (input.receipt_item_id !== undefined) {
    payload.receipt_item_id = input.receipt_item_id
  }

  const { data, error } = await supabase
    .from('price_records')
    .update(payload)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return normalize(data as PriceRecord)
}

export async function deleteRecord(id: string): Promise<void> {
  const { error } = await supabase.from('price_records').delete().eq('id', id)
  if (error) throw error
}

export async function linkReceiptItemToRecord(
  recordId: string,
  receiptItemId: string | null,
): Promise<PriceRecord> {
  const { data, error } = await supabase
    .from('price_records')
    .update({
      receipt_item_id: receiptItemId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', recordId)
    .select('*')
    .single()

  if (error) throw error
  return normalize(data as PriceRecord)
}

export type ReceiptSearchParams = {
  q?: string
  store?: string
  from?: string
  to?: string
  limit?: number
}

export async function searchReceiptItems(
  params: ReceiptSearchParams,
): Promise<ReceiptItemRef[]> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError) throw userError
  if (!user) throw new Error('ログインが必要です')

  let query = supabase
    .from('receipt_items')
    .select(
      `
      id,
      item_name,
      price,
      main_category,
      sub_category,
      receipt_id,
      receipts!inner(id, date, store_name, total_amount)
    `,
    )
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(params.limit ?? 50)

  if (params.q?.trim()) {
    query = query.ilike('item_name', `%${params.q.trim()}%`)
  }

  if (params.store?.trim()) {
    query = query.ilike('receipts.store_name', `%${params.store.trim()}%`)
  }

  if (params.from) {
    query = query.gte('receipts.date', params.from)
  }

  if (params.to) {
    query = query.lte('receipts.date', params.to)
  }

  const { data, error } = await query
  if (error) throw error

  const rows = (data ?? []) as Array<
    Omit<ReceiptItemRef, 'receipts'> & {
      receipts:
        | ReceiptItemRef['receipts']
        | Array<NonNullable<ReceiptItemRef['receipts']>>
        | null
    }
  >

  return rows.map((row) => {
    const receipt = Array.isArray(row.receipts)
      ? row.receipts[0] ?? null
      : row.receipts

    return {
      ...row,
      price: asNumber(row.price),
      receipts: receipt
        ? {
            ...receipt,
            total_amount: asNumber(receipt.total_amount),
          }
        : null,
    }
  })
}
