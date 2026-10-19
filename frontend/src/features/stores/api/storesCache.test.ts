import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PriceStore } from '../types'
import { getCatalogRevisions, resetCatalogSync } from '@/lib/catalogSync'

const listStores = vi.fn<() => Promise<PriceStore[]>>()
const createStore = vi.fn<(name: string) => Promise<PriceStore>>()

vi.mock('./storesApi', () => ({
  listStores: () => listStores(),
  createStore: (name: string) => createStore(name),
}))

import {
  getStoresCached,
  getStoresCacheEpoch,
  invalidateStoresCache,
  peekStoresCache,
  resetStoresCacheForTests,
  resetStoresCacheForUser,
  setStoresCache,
  StoresCacheStaleError,
  removeFromStoresCache,
  upsertStoresCache,
  refreshStoresCacheFromRealtime,
  subscribeStoresCacheRefresh,
} from './storesCache'

function store(id: string, name: string): PriceStore {
  return {
    id,
    name,
    user_id: 'user',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

describe('storesCache', () => {
  beforeEach(() => {
    resetStoresCacheForTests()
    resetCatalogSync()
    listStores.mockReset()
    createStore.mockReset()
  })

  afterEach(() => {
    resetStoresCacheForTests()
  })

  it('dedupes concurrent fetches for the same user', async () => {
    resetStoresCacheForUser('user-a')
    const storesA = [store('1', 'Alpha')]
    listStores.mockResolvedValue(storesA)

    const [first, second] = await Promise.all([
      getStoresCached(),
      getStoresCached(),
    ])

    expect(first).toEqual(storesA)
    expect(second).toEqual(storesA)
    expect(listStores).toHaveBeenCalledTimes(1)
    expect(peekStoresCache()).toEqual(storesA)
  })

  it('does not return user A data after switching to user B', async () => {
    resetStoresCacheForUser('user-a')
    let resolveA: (stores: PriceStore[]) => void = () => {}
    listStores.mockImplementationOnce(
      () =>
        new Promise<PriceStore[]>((resolve) => {
          resolveA = resolve
        }),
    )

    const pendingA = getStoresCached()
    resetStoresCacheForUser('user-b')
    listStores.mockResolvedValueOnce([store('2', 'Beta')])

    resolveA([store('1', 'Alpha')])
    const forB = await getStoresCached()

    await expect(pendingA).rejects.toBeInstanceOf(StoresCacheStaleError)
    expect(forB).toEqual([store('2', 'Beta')])
    expect(peekStoresCache()).toEqual([store('2', 'Beta')])
    expect(listStores).toHaveBeenCalledTimes(2)
  })

  it('does not let an invalidated in-flight response refill the cache', async () => {
    resetStoresCacheForUser('user-a')
    let resolveSlow: (stores: PriceStore[]) => void = () => {}
    listStores.mockImplementationOnce(
      () =>
        new Promise<PriceStore[]>((resolve) => {
          resolveSlow = resolve
        }),
    )

    const pending = getStoresCached()
    invalidateStoresCache()
    listStores.mockResolvedValueOnce([store('3', 'Fresh')])

    resolveSlow([store('9', 'Stale')])
    const fresh = await getStoresCached()

    await expect(pending).rejects.toBeInstanceOf(StoresCacheStaleError)
    expect(fresh).toEqual([store('3', 'Fresh')])
    expect(peekStoresCache()).toEqual([store('3', 'Fresh')])
    expect(peekStoresCache()).not.toEqual([store('9', 'Stale')])
  })

  it('blocks stale upsert after user switch', async () => {
    resetStoresCacheForUser('user-a')
    const epoch = getStoresCacheEpoch()
    setStoresCache([store('1', 'Alpha')])
    resetStoresCacheForUser('user-b')
    listStores.mockResolvedValueOnce([store('2', 'Beta')])
    await getStoresCached()

    upsertStoresCache(store('1', 'Leaked'), epoch)

    expect(peekStoresCache()).toEqual([store('2', 'Beta')])
  })

  it('preserves cache on same-user token refresh (no owner reset)', async () => {
    resetStoresCacheForUser('user-a')
    listStores.mockResolvedValueOnce([store('1', 'Alpha')])
    await getStoresCached()
    const epochBefore = getStoresCacheEpoch()

    resetStoresCacheForUser('user-a')

    expect(getStoresCacheEpoch()).toBe(epochBefore)
    expect(peekStoresCache()).toEqual([store('1', 'Alpha')])
    expect(listStores).toHaveBeenCalledTimes(1)
  })

  it('clears owner cache on logout', async () => {
    resetStoresCacheForUser('user-a')
    listStores.mockResolvedValueOnce([store('1', 'Alpha')])
    await getStoresCached()

    resetStoresCacheForUser(null)
    expect(peekStoresCache()).toBeNull()
  })

  it('does not let a stale listStores response overwrite a local upsert', async () => {
    resetStoresCacheForUser('user-a')
    let resolveSlow: (stores: PriceStore[]) => void = () => {}
    listStores.mockImplementationOnce(
      () =>
        new Promise<PriceStore[]>((resolve) => {
          resolveSlow = resolve
        }),
    )

    const pending = getStoresCached()
    upsertStoresCache(store('2', 'Local'))

    resolveSlow([store('9', 'Stale')])
    const result = await pending

    expect(result).toEqual([store('2', 'Local')])
    expect(peekStoresCache()).toEqual([store('2', 'Local')])
  })

  it('does not let an older force refresh overwrite a newer force refresh result', async () => {
    resetStoresCacheForUser('user-a')
    setStoresCache([store('1', 'Seed')])

    let resolveFirst: (stores: PriceStore[]) => void = () => {}
    let resolveSecond: (stores: PriceStore[]) => void = () => {}
    listStores
      .mockImplementationOnce(
        () =>
          new Promise<PriceStore[]>((resolve) => {
            resolveFirst = resolve
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<PriceStore[]>((resolve) => {
            resolveSecond = resolve
          }),
      )

    const first = getStoresCached({ force: true })
    const second = getStoresCached({ force: true })

    resolveSecond([store('2', 'Fresh')])
    const fresh = await second
    expect(fresh).toEqual([store('2', 'Fresh')])
    expect(peekStoresCache()).toEqual([store('2', 'Fresh')])

    resolveFirst([store('9', 'Stale')])
    const stale = await first
    expect(stale).toEqual([store('2', 'Fresh')])
    expect(peekStoresCache()).toEqual([store('2', 'Fresh')])
    expect(listStores).toHaveBeenCalledTimes(2)
  })

  it('does not let a stale listStores response restore a locally removed store', async () => {
    resetStoresCacheForUser('user-a')
    setStoresCache([store('1', 'Alpha'), store('2', 'Beta')])
    let resolveSlow: (stores: PriceStore[]) => void = () => {}
    listStores.mockImplementationOnce(
      () =>
        new Promise<PriceStore[]>((resolve) => {
          resolveSlow = resolve
        }),
    )

    const pending = getStoresCached({ force: true })
    removeFromStoresCache('2')

    resolveSlow([store('1', 'Alpha'), store('2', 'Beta')])
    const result = await pending

    expect(result).toEqual([store('1', 'Alpha')])
    expect(peekStoresCache()).toEqual([store('1', 'Alpha')])
  })

  it('refreshes the store cache without changing local revisions', async () => {
    resetStoresCacheForUser('user-a')
    setStoresCache([store('1', 'Old')])
    const fresh = [store('1', 'Renamed'), store('2', 'New')]
    listStores.mockResolvedValueOnce(fresh)
    const listener = vi.fn()
    const unsubscribe = subscribeStoresCacheRefresh(listener)
    const before = getCatalogRevisions()

    const first = await refreshStoresCacheFromRealtime()

    expect(first).toEqual(fresh)
    expect(listStores).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith(fresh)
    expect(getCatalogRevisions()).toEqual(before)
    expect(peekStoresCache()).toEqual(fresh)
    unsubscribe()
  })

  it('reruns one shared refresh when store changes arrive during its read', async () => {
    resetStoresCacheForUser('user-a')
    setStoresCache([store('1', 'Before')])
    let resolveFirst: (stores: PriceStore[]) => void = () => {}
    let resolveSecond: (stores: PriceStore[]) => void = () => {}
    listStores
      .mockImplementationOnce(
        () =>
          new Promise<PriceStore[]>((resolve) => {
            resolveFirst = resolve
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<PriceStore[]>((resolve) => {
            resolveSecond = resolve
          }),
      )
    const storeFieldListener = vi.fn()
    const foldersPageListener = vi.fn()
    const unsubscribeStoreField = subscribeStoresCacheRefresh(storeFieldListener)
    const unsubscribeFoldersPage = subscribeStoresCacheRefresh(foldersPageListener)

    const refresh = refreshStoresCacheFromRealtime()
    const duplicateRefreshes = [
      refreshStoresCacheFromRealtime(),
      refreshStoresCacheFromRealtime(),
    ]
    resolveFirst([store('1', 'Before second change')])

    await vi.waitFor(() => expect(listStores).toHaveBeenCalledTimes(2))
    resolveSecond([store('1', 'Latest')])
    const results = await Promise.all([refresh, ...duplicateRefreshes])

    expect(results).toEqual([
      [store('1', 'Latest')],
      [store('1', 'Latest')],
      [store('1', 'Latest')],
    ])
    expect(peekStoresCache()).toEqual([store('1', 'Latest')])
    expect(storeFieldListener).toHaveBeenCalledTimes(1)
    expect(storeFieldListener).toHaveBeenCalledWith([store('1', 'Latest')])
    expect(foldersPageListener).toHaveBeenCalledTimes(1)
    expect(foldersPageListener).toHaveBeenCalledWith([store('1', 'Latest')])
    expect(listStores).toHaveBeenCalledTimes(2)
    unsubscribeStoreField()
    unsubscribeFoldersPage()
  })

  it('does not let a normal read started before Realtime overwrite its snapshot', async () => {
    resetStoresCacheForUser('user-a')
    let resolveNormal: (stores: PriceStore[]) => void = () => {}
    let resolveRealtime: (stores: PriceStore[]) => void = () => {}
    listStores
      .mockImplementationOnce(
        () =>
          new Promise<PriceStore[]>((resolve) => {
            resolveNormal = resolve
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<PriceStore[]>((resolve) => {
            resolveRealtime = resolve
          }),
      )

    const normalRead = getStoresCached()
    const realtimeRead = refreshStoresCacheFromRealtime()
    resolveRealtime([store('1', 'Realtime latest')])
    await expect(realtimeRead).resolves.toEqual([
      store('1', 'Realtime latest'),
    ])

    resolveNormal([store('1', 'Normal stale')])
    await expect(normalRead).resolves.toEqual([
      store('1', 'Realtime latest'),
    ])
    expect(peekStoresCache()).toEqual([store('1', 'Realtime latest')])
  })

  it('rechecks after another force read supersedes its Realtime request', async () => {
    resetStoresCacheForUser('user-a')
    setStoresCache([store('1', 'Seed')])
    let resolveRealtimeFirst: (stores: PriceStore[]) => void = () => {}
    let resolveOtherForce: (stores: PriceStore[]) => void = () => {}
    let resolveRealtimeFollowup: (stores: PriceStore[]) => void = () => {}
    listStores
      .mockImplementationOnce(
        () =>
          new Promise<PriceStore[]>((resolve) => {
            resolveRealtimeFirst = resolve
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<PriceStore[]>((resolve) => {
            resolveOtherForce = resolve
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<PriceStore[]>((resolve) => {
            resolveRealtimeFollowup = resolve
          }),
      )

    const realtimeRead = refreshStoresCacheFromRealtime()
    const otherForceRead = getStoresCached({ force: true })
    resolveOtherForce([store('1', 'Force latest')])
    await expect(otherForceRead).resolves.toEqual([store('1', 'Force latest')])
    resolveRealtimeFirst([store('1', 'Realtime stale')])
    await vi.waitFor(() => expect(listStores).toHaveBeenCalledTimes(3))
    resolveRealtimeFollowup([store('1', 'Final latest')])

    await expect(realtimeRead).resolves.toEqual([store('1', 'Final latest')])
    expect(peekStoresCache()).toEqual([store('1', 'Final latest')])
  })

  it('preserves the store cache when a Realtime-triggered refresh fails', async () => {
    resetStoresCacheForUser('user-a')
    const existing = [store('1', 'Existing')]
    setStoresCache(existing)
    listStores.mockRejectedValueOnce(new Error('network'))
    const listener = vi.fn()
    const unsubscribe = subscribeStoresCacheRefresh(listener)

    await expect(refreshStoresCacheFromRealtime()).rejects.toThrow('network')

    expect(peekStoresCache()).toEqual(existing)
    expect(listener).not.toHaveBeenCalled()
    unsubscribe()
  })

  it('retries a Realtime refresh when a local cache write races the request', async () => {
    resetStoresCacheForUser('user-a')
    setStoresCache([store('1', 'Seed')])
    let resolveFirst: (stores: PriceStore[]) => void = () => {}
    listStores
      .mockImplementationOnce(
        () =>
          new Promise<PriceStore[]>((resolve) => {
            resolveFirst = resolve
          }),
      )
      .mockResolvedValueOnce([
        store('3', 'Local'),
        store('2', 'Remote'),
        store('1', 'Seed'),
      ])

    const refresh = refreshStoresCacheFromRealtime()
    upsertStoresCache(store('3', 'Local'))
    resolveFirst([store('1', 'Stale')])

    await expect(refresh).resolves.toEqual([
      store('3', 'Local'),
      store('2', 'Remote'),
      store('1', 'Seed'),
    ])
    expect(listStores).toHaveBeenCalledTimes(2)
    expect(peekStoresCache()).toEqual([
      store('3', 'Local'),
      store('2', 'Remote'),
      store('1', 'Seed'),
    ])
  })
})
