import { equalsSearchQuery } from '@/lib/kanaSearch'
import { createStore, listStores } from './storesApi'
import type { PriceStore } from '../types'

let cache: PriceStore[] | null = null
let inflight: Promise<PriceStore[]> | null = null

/** Shared in-memory store list. Dedupes concurrent fetches. */
export async function getStoresCached(
  options?: { force?: boolean },
): Promise<PriceStore[]> {
  if (!options?.force && cache) return cache
  if (!options?.force && inflight) return inflight

  const request = listStores()
    .then((stores) => {
      cache = stores
      return stores
    })
    .finally(() => {
      if (inflight === request) inflight = null
    })

  inflight = request
  return request
}

export function peekStoresCache(): PriceStore[] | null {
  return cache
}

export function setStoresCache(stores: PriceStore[]) {
  cache = stores
}

export function invalidateStoresCache() {
  cache = null
  inflight = null
}

export function upsertStoresCache(store: PriceStore) {
  if (!cache) {
    cache = [store]
    return
  }
  const idx = cache.findIndex((s) => s.id === store.id)
  const next =
    idx >= 0
      ? cache.map((s, i) => (i === idx ? store : s))
      : [...cache, store]
  next.sort((a, b) => a.name.localeCompare(b.name, 'ja'))
  cache = next
}

export function removeFromStoresCache(id: string) {
  if (!cache) return
  cache = cache.filter((s) => s.id !== id)
}

/**
 * Resolve store name without a full listStores round-trip when cache is warm.
 * Falls back to force-refresh once if not found (stale cache).
 */
export async function ensureStore(name: string): Promise<string> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('店舗名を入力してください')

  const match = (stores: PriceStore[]) =>
    stores.find((s) => equalsSearchQuery(s.name, trimmed))

  let stores = await getStoresCached()
  let existing = match(stores)
  if (!existing) {
    stores = await getStoresCached({ force: true })
    existing = match(stores)
  }
  if (existing) return existing.name

  const created = await createStore(trimmed)
  upsertStoresCache(created)
  return created.name
}
