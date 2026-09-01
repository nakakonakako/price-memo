import { supabase } from '@/lib/supabase'
import type { PriceStore } from '../types'

import { equalsSearchQuery, matchesSearchQuery } from '@/lib/kanaSearch'

export async function listStores(): Promise<PriceStore[]> {
  const { data, error } = await supabase
    .from('price_stores')
    .select('*')
    .order('name', { ascending: true })

  if (error) throw error
  return (data ?? []) as PriceStore[]
}

export async function createStore(name: string): Promise<PriceStore> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError) throw userError
  if (!user) throw new Error('ログインが必要です')

  const trimmed = name.trim()
  if (!trimmed) throw new Error('店舗名を入力してください')

  const { data, error } = await supabase
    .from('price_stores')
    .insert({ name: trimmed, user_id: user.id })
    .select()
    .single()

  if (error) throw error
  return data as PriceStore
}

export async function renameStore(id: string, name: string): Promise<PriceStore> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError) throw userError
  if (!user) throw new Error('ログインが必要です')

  const trimmed = name.trim()
  if (!trimmed) throw new Error('店舗名を入力してください')

  const { data: current, error: fetchError } = await supabase
    .from('price_stores')
    .select('name')
    .eq('id', id)
    .single()
  if (fetchError) throw fetchError

  const { data, error } = await supabase
    .from('price_stores')
    .update({ name: trimmed })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error

  if (current.name !== trimmed) {
    const { error: recordsError } = await supabase
      .from('price_records')
      .update({ store_name: trimmed, updated_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('store_name', current.name)
    if (recordsError) throw recordsError
  }

  return data as PriceStore
}

export async function deleteStore(id: string): Promise<void> {
  const { error } = await supabase.from('price_stores').delete().eq('id', id)
  if (error) throw error
}
export async function ensureStore(name: string): Promise<string> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('店舗名を入力してください')

  const stores = await listStores()
  const existing = stores.find((s) => equalsSearchQuery(s.name, trimmed))
  if (existing) return existing.name

  const created = await createStore(trimmed)
  return created.name
}

export function findStoreByName(
  stores: PriceStore[],
  input: string,
): PriceStore | undefined {
  const nq = input.trim()
  if (!nq) return undefined
  return stores.find((s) => equalsSearchQuery(s.name, nq))
}

export function filterStores(stores: PriceStore[], query: string): PriceStore[] {
  const q = query.trim()
  if (!q) return stores
  return stores.filter((s) => matchesSearchQuery(s.name, q))
}
