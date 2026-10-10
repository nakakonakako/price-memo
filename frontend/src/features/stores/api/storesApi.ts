import { getCurrentAuthUserId } from '@/lib/authIdentity'
import { bumpRecordsRevision, bumpStoresRevision } from '@/lib/catalogSync'
import { supabase } from '@/lib/supabase'
import type { PriceStore } from '../types'
import { equalsSearchQuery, matchesSearchQuery } from '@/lib/kanaSearch'
import {
  getStoresCacheEpoch,
  setStoresCache,
  StoresCacheStaleError,
} from './storesCache'

export async function listStores(): Promise<PriceStore[]> {
  const { data, error } = await supabase
    .from('price_stores')
    .select('*')
    .order('name', { ascending: true })

  if (error) throw error
  return (data ?? []) as PriceStore[]
}

function assertStoresMutationEpoch(startEpoch: number, userId: string): void {
  if (
    getStoresCacheEpoch() !== startEpoch ||
    getCurrentAuthUserId() !== userId
  ) {
    throw new StoresCacheStaleError()
  }
}

function parseRenameStoreRpcResult(
  data: unknown,
  expectedId: string,
  expectedUserId: string,
  expectedName: string,
): PriceStore {
  const rowValue = Array.isArray(data)
    ? data.length === 1
      ? data[0]
      : null
    : data
  if (!rowValue || typeof rowValue !== 'object') {
    throw new Error('店舗名の変更に失敗しました。')
  }
  const row = rowValue as Record<string, unknown>
  const id = row.id
  const user_id = row.user_id
  const name = row.name
  const created_at = row.created_at
  if (
    typeof id !== 'string' ||
    typeof user_id !== 'string' ||
    typeof name !== 'string' ||
    typeof created_at !== 'string' ||
    !id ||
    !name
  ) {
    throw new Error('店舗名の変更に失敗しました。')
  }
  if (user_id !== expectedUserId) throw new StoresCacheStaleError()
  if (id !== expectedId || name !== expectedName) {
    throw new Error('店舗名の変更に失敗しました。')
  }
  return { id, user_id, name, created_at }
}

async function reconcileRenameAfterFailure(
  startEpoch: number,
  userId: string,
): Promise<void> {
  try {
    assertStoresMutationEpoch(startEpoch, userId)
    const stores = await listStores()
    assertStoresMutationEpoch(startEpoch, userId)
    setStoresCache(stores, startEpoch)
  } catch {
    // The original RPC error remains authoritative; a failed read must not
    // turn it into a success or apply data from a different account.
  }
  if (
    getStoresCacheEpoch() !== startEpoch ||
    getCurrentAuthUserId() !== userId
  ) {
    return
  }
  bumpStoresRevision()
  bumpRecordsRevision()
}

export async function createStore(name: string): Promise<PriceStore> {
  const startEpoch = getStoresCacheEpoch()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError) throw userError
  if (!user) throw new Error('ログインが必要です')

  assertStoresMutationEpoch(startEpoch, user.id)

  const trimmed = name.trim()
  if (!trimmed) throw new Error('店舗名を入力してください')

  assertStoresMutationEpoch(startEpoch, user.id)

  const { data, error } = await supabase
    .from('price_stores')
    .insert({ name: trimmed, user_id: user.id })
    .select()
    .single()

  if (error) throw error
  return data as PriceStore
}

export async function renameStore(id: string, name: string): Promise<PriceStore> {
  const startEpoch = getStoresCacheEpoch()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError) throw userError
  if (!user) throw new Error('ログインが必要です')

  assertStoresMutationEpoch(startEpoch, user.id)

  const trimmed = name.trim()
  if (!trimmed) throw new Error('店舗名を入力してください')

  assertStoresMutationEpoch(startEpoch, user.id)

  const { data, error } = await supabase.rpc('rename_price_store', {
    p_store_id: id,
    p_name: trimmed,
  })
  if (error) {
    await reconcileRenameAfterFailure(startEpoch, user.id)
    throw error
  }

  assertStoresMutationEpoch(startEpoch, user.id)

  let updated: PriceStore
  try {
    updated = parseRenameStoreRpcResult(data, id, user.id, trimmed)
  } catch (parseError) {
    await reconcileRenameAfterFailure(startEpoch, user.id)
    throw parseError
  }

  bumpRecordsRevision()
  return updated
}

export async function deleteStore(id: string): Promise<void> {
  const { error } = await supabase.from('price_stores').delete().eq('id', id)
  if (error) throw error
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

export {
  getStoresCached,
  getStoresCacheEpoch,
  peekStoresCache,
  invalidateStoresCache,
  setStoresCache,
  upsertStoresCache,
  removeFromStoresCache,
  ensureStore,
} from './storesCache'
