import { equalsSearchQuery } from '@/lib/kanaSearch'
import { bumpStoresRevision } from '@/lib/catalogSync'
import { createStore, listStores } from './storesApi'
import type { PriceStore } from '../types'

let cache: PriceStore[] | null = null
let inflight: Promise<PriceStore[]> | null = null
let inflightEpoch = 0
let cacheEpoch = 0
/** Bumped on local cache writes; fences stale listStores adoption without changing cacheEpoch. */
let cacheAdoptionGeneration = 0
/** Latest force-refresh listStores id; only that response may adopt into cache. */
let forceListStoresRequestId = 0
/** Fences every listStores response by start order, including normal/force overlap. */
let latestStoresRequestId = 0
let ownerUserId: string | null = null
let realtimeRefresh: Promise<PriceStore[]> | null = null
let realtimeRefreshRequested = false
const realtimeRefreshListeners = new Set<(stores: PriceStore[]) => void>()

export class StoresCacheStaleError extends Error {
  constructor() {
    super('Stores cache is stale')
    this.name = 'StoresCacheStaleError'
  }
}

function isCurrentEpoch(epoch: number): boolean {
  return epoch === cacheEpoch
}

function isCurrentAdoptionGeneration(generation: number): boolean {
  return generation === cacheAdoptionGeneration
}

function bumpCacheAdoptionGeneration(): void {
  cacheAdoptionGeneration += 1
}

export function getStoresCacheEpoch(): number {
  return cacheEpoch
}

export function getStoresCacheAdoptionGeneration(): number {
  return cacheAdoptionGeneration
}

export function getStoresCacheOwnerUserId(): string | null {
  return ownerUserId
}

export function resetStoresCacheForUser(userId: string | null): void {
  if (userId === ownerUserId) return
  ownerUserId = userId
  cache = null
  inflight = null
  inflightEpoch = 0
  cacheEpoch += 1
  cacheAdoptionGeneration = 0
  forceListStoresRequestId = 0
  latestStoresRequestId = 0
  realtimeRefresh = null
  realtimeRefreshRequested = false
}

/** @internal test helper */
export function resetStoresCacheForTests(): void {
  cache = null
  inflight = null
  inflightEpoch = 0
  cacheEpoch = 0
  cacheAdoptionGeneration = 0
  forceListStoresRequestId = 0
  latestStoresRequestId = 0
  realtimeRefresh = null
  ownerUserId = null
  realtimeRefreshListeners.clear()
  realtimeRefreshRequested = false
}

/** Shared in-memory store list. Dedupes concurrent fetches. */
export async function getStoresCached(
  options?: { force?: boolean },
): Promise<PriceStore[]> {
  const startEpoch = cacheEpoch

  if (!options?.force && cache !== null && isCurrentEpoch(startEpoch)) {
    return cache
  }

  if (
    !options?.force &&
    inflight !== null &&
    inflightEpoch === startEpoch
  ) {
    const result = await inflight
    if (!isCurrentEpoch(startEpoch)) {
      throw new StoresCacheStaleError()
    }
    return result
  }

  const requestEpoch = cacheEpoch
  const adoptionAtRequest = cacheAdoptionGeneration
  const requestId = ++latestStoresRequestId
  const forceRequestId = options?.force ? ++forceListStoresRequestId : null
  const request = listStores()
    .then((stores) => {
      if (!isCurrentEpoch(requestEpoch)) {
        throw new StoresCacheStaleError()
      }
      if (requestId !== latestStoresRequestId) {
        if (cache !== null && isCurrentEpoch(requestEpoch)) {
          return cache
        }
        throw new StoresCacheStaleError()
      }
      if (
        forceRequestId !== null &&
        forceRequestId !== forceListStoresRequestId
      ) {
        if (cache !== null && isCurrentEpoch(requestEpoch)) {
          return cache
        }
        throw new StoresCacheStaleError()
      }
      if (!isCurrentAdoptionGeneration(adoptionAtRequest)) {
        if (cache !== null && isCurrentEpoch(requestEpoch)) {
          return cache
        }
        throw new StoresCacheStaleError()
      }
      cache = stores
      return stores
    })
    .finally(() => {
      if (inflight === request) {
        inflight = null
        inflightEpoch = 0
      }
    })

  inflight = request
  inflightEpoch = requestEpoch

  const result = await request
  if (!isCurrentEpoch(startEpoch)) {
    throw new StoresCacheStaleError()
  }
  return result
}

export function peekStoresCache(): PriceStore[] | null {
  return cache
}

/** Subscribe to fresh server snapshots without changing local catalog revisions. */
export function subscribeStoresCacheRefresh(
  listener: (stores: PriceStore[]) => void,
): () => void {
  realtimeRefreshListeners.add(listener)
  return () => realtimeRefreshListeners.delete(listener)
}

/** Share the Realtime-triggered force read across forms and keep-alive pages. */
export function refreshStoresCacheFromRealtime(): Promise<PriceStore[]> {
  if (realtimeRefresh !== null) {
    realtimeRefreshRequested = true
    return realtimeRefresh
  }
  const requestEpoch = cacheEpoch
  const requestOwner = ownerUserId
  const request = (async () => {
    let stores: PriceStore[] = []
    let adoptionRetries = 0
    do {
      realtimeRefreshRequested = false
      const adoptionAtStart = cacheAdoptionGeneration
      const expectedForceRequestId = forceListStoresRequestId + 1
      try {
        stores = await getStoresCached({ force: true })
      } catch (error) {
        if (requestEpoch !== cacheEpoch || requestOwner !== ownerUserId) {
          throw new StoresCacheStaleError()
        }
        if (
          realtimeRefreshRequested ||
          forceListStoresRequestId !== expectedForceRequestId
        ) {
          realtimeRefreshRequested = true
          continue
        }
        throw error
      }
      if (requestEpoch !== cacheEpoch || requestOwner !== ownerUserId) {
        throw new StoresCacheStaleError()
      }
      // A concurrent force read superseded this one. Read again after it so
      // this shared notification promise cannot publish an older snapshot.
      if (forceListStoresRequestId !== expectedForceRequestId) {
        realtimeRefreshRequested = true
      }
      // Keep the existing local-write fence: retry once if an optimistic
      // create/rename/delete changed the cache while this request was running.
      if (
        adoptionAtStart !== cacheAdoptionGeneration &&
        adoptionRetries < 1
      ) {
        adoptionRetries += 1
        realtimeRefreshRequested = true
      }
    } while (realtimeRefreshRequested)
    const current = cache ?? stores
    for (const listener of realtimeRefreshListeners) listener(current)
    return current
  })()
    .finally(() => {
      if (realtimeRefresh === request) realtimeRefresh = null
    })
  realtimeRefresh = request
  return request
}

export function setStoresCache(stores: PriceStore[], epoch?: number) {
  if (epoch !== undefined && !isCurrentEpoch(epoch)) return
  cache = stores
  bumpCacheAdoptionGeneration()
}

export function invalidateStoresCache() {
  cache = null
  inflight = null
  inflightEpoch = 0
  cacheEpoch += 1
  forceListStoresRequestId = 0
  latestStoresRequestId = 0
  bumpCacheAdoptionGeneration()
}

export function upsertStoresCache(store: PriceStore, epoch?: number) {
  if (epoch !== undefined && !isCurrentEpoch(epoch)) return
  const base = cache ?? []
  const withoutId = base.filter((s) => s.id !== store.id)
  const next = [...withoutId, store].sort((a, b) =>
    a.name.localeCompare(b.name, 'ja'),
  )
  cache = next
  bumpCacheAdoptionGeneration()
  bumpStoresRevision()
}

export function removeFromStoresCache(id: string, epoch?: number) {
  if (epoch !== undefined && !isCurrentEpoch(epoch)) return
  if (!cache) return
  if (!cache.some((store) => store.id === id)) return
  cache = cache.filter((s) => s.id !== id)
  bumpCacheAdoptionGeneration()
  bumpStoresRevision()
}

/**
 * Resolve store name without a full listStores round-trip when cache is warm.
 * Falls back to force-refresh once if not found (stale cache).
 */
export async function ensureStore(name: string): Promise<string> {
  const epoch = cacheEpoch
  const trimmed = name.trim()
  if (!trimmed) throw new Error('店舗名を入力してください')

  const match = (stores: PriceStore[]) =>
    stores.find((s) => equalsSearchQuery(s.name, trimmed))

  let stores = await getStoresCached()
  if (!isCurrentEpoch(epoch)) throw new StoresCacheStaleError()

  let existing = match(stores)
  if (!existing) {
    stores = await getStoresCached({ force: true })
    if (!isCurrentEpoch(epoch)) throw new StoresCacheStaleError()
    existing = match(stores)
  }
  if (existing) return existing.name

  const created = await createStore(trimmed)
  if (!isCurrentEpoch(epoch)) throw new StoresCacheStaleError()
  upsertStoresCache(created, epoch)
  return created.name
}
