import { supabase } from '@/lib/supabase'
import type { PriceRecord, PriceRecordInput } from '../types'

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
