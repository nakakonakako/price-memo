import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PriceStore } from '../types'
import { applyAuthIdentity, resetAuthIdentityForTests } from '@/lib/authIdentity'
import {
  resetStoresCacheForTests,
  resetStoresCacheForUser,
  peekStoresCache,
  StoresCacheStaleError,
} from './storesCache'

const getUser = vi.fn()
const rpc = vi.fn()
const from = vi.fn()
const readStores = vi.fn()
const bumpRecordsRevision = vi.fn()
const bumpStoresRevision = vi.fn()

vi.mock('@/lib/catalogSync', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/catalogSync')>()
  return {
    ...actual,
    bumpRecordsRevision: () => bumpRecordsRevision(),
    bumpStoresRevision: () => bumpStoresRevision(),
  }
})

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: () => getUser(),
    },
    from: (...args: unknown[]) => from(...args),
    rpc: (...args: unknown[]) => rpc(...args),
  },
}))

import { renameStore } from './storesApi'

function store(id: string, name: string): PriceStore {
  return {
    id,
    name,
    user_id: 'user-a',
    created_at: '2026-01-01T00:00:00Z',
  }
}

describe('renameStore RPC', () => {
  beforeEach(() => {
    resetAuthIdentityForTests()
    resetStoresCacheForTests()
    getUser.mockReset()
    rpc.mockReset()
    from.mockReset()
    readStores.mockReset()
    bumpRecordsRevision.mockReset()
    bumpStoresRevision.mockReset()
    readStores.mockResolvedValue({
      data: [store('store-1', 'Old')],
      error: null,
    })
    from.mockReturnValue({
      select: () => ({ order: () => readStores() }),
    })
    resetStoresCacheForUser('user-a')
    applyAuthIdentity({
      access_token: 'token-a',
      refresh_token: 'refresh',
      expires_in: 3600,
      token_type: 'bearer',
      user: {
        id: 'user-a',
        aud: 'authenticated',
        role: 'authenticated',
        email: 'a@example.com',
        app_metadata: {},
        user_metadata: {},
        created_at: '2026-01-01T00:00:00Z',
      },
    })
  })

  afterEach(() => {
    resetAuthIdentityForTests()
    resetStoresCacheForTests()
  })

  it('rejects empty names before RPC', async () => {
    getUser.mockResolvedValue({
      data: { user: { id: 'user-a' } },
      error: null,
    })

    await expect(renameStore('store-1', '   ')).rejects.toThrow(
      '店舗名を入力してください',
    )
    expect(rpc).not.toHaveBeenCalled()
  })

  it('calls rename_price_store and normalizes the composite row', async () => {
    getUser.mockResolvedValue({
      data: { user: { id: 'user-a' } },
      error: null,
    })
    rpc.mockResolvedValue({
      data: store('store-1', 'Renamed'),
      error: null,
    })

    const updated = await renameStore('store-1', ' Renamed ')

    expect(rpc).toHaveBeenCalledWith('rename_price_store', {
      p_store_id: 'store-1',
      p_name: 'Renamed',
    })
    expect(updated).toEqual(store('store-1', 'Renamed'))
    expect(bumpRecordsRevision).toHaveBeenCalledTimes(1)
  })

  it('normalizes a one-row PostgREST representation array', async () => {
    getUser.mockResolvedValue({
      data: { user: { id: 'user-a' } },
      error: null,
    })
    rpc.mockResolvedValue({
      data: [store('store-1', 'Renamed')],
      error: null,
    })

    await expect(renameStore('store-1', 'Renamed')).resolves.toEqual(
      store('store-1', 'Renamed'),
    )
  })

  it('throws when RPC returns an invalid composite row', async () => {
    getUser.mockResolvedValue({
      data: { user: { id: 'user-a' } },
      error: null,
    })
    rpc.mockResolvedValue({
      data: { id: 'store-1', name: 'Renamed' },
      error: null,
    })

    await expect(renameStore('store-1', 'Renamed')).rejects.toThrow(
      '店舗名の変更に失敗しました。',
    )
    expect(readStores).toHaveBeenCalledTimes(1)
    expect(bumpStoresRevision).toHaveBeenCalledTimes(1)
    expect(bumpRecordsRevision).toHaveBeenCalledTimes(1)
  })

  it('surfaces RPC errors without reporting success', async () => {
    getUser.mockResolvedValue({
      data: { user: { id: 'user-a' } },
      error: null,
    })
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'store not found', code: 'P0002' },
    })

    await expect(renameStore('store-1', 'Renamed')).rejects.toMatchObject({
      code: 'P0002',
    })
    expect(from).toHaveBeenCalledWith('price_stores')
    expect(peekStoresCache()).toEqual([store('store-1', 'Old')])
    expect(bumpStoresRevision).toHaveBeenCalledTimes(1)
    expect(bumpRecordsRevision).toHaveBeenCalledTimes(1)
  })

  it('rejects when auth identity changes before RPC completes', async () => {
    let resolveRpc: (value: { data: PriceStore; error: null }) => void =
      () => {}
    getUser.mockResolvedValue({
      data: { user: { id: 'user-a' } },
      error: null,
    })
    rpc.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRpc = resolve
        }),
    )

    const pending = renameStore('store-1', 'Renamed')
    resetStoresCacheForUser('user-b')
    applyAuthIdentity({
      access_token: 'token-b',
      refresh_token: 'refresh',
      expires_in: 3600,
      token_type: 'bearer',
      user: {
        id: 'user-b',
        aud: 'authenticated',
        role: 'authenticated',
        email: 'b@example.com',
        app_metadata: {},
        user_metadata: {},
        created_at: '2026-01-01T00:00:00Z',
      },
    })
    resolveRpc({ data: store('store-1', 'Renamed'), error: null })

    await expect(pending).rejects.toBeInstanceOf(StoresCacheStaleError)
    expect(bumpRecordsRevision).not.toHaveBeenCalled()
  })

  it('rejects when returned row belongs to another user', async () => {
    getUser.mockResolvedValue({
      data: { user: { id: 'user-a' } },
      error: null,
    })
    rpc.mockResolvedValue({
      data: {
        id: 'store-1',
        user_id: 'user-other',
        name: 'Renamed',
        created_at: '2026-01-01T00:00:00Z',
      },
      error: null,
    })

    await expect(renameStore('store-1', 'Renamed')).rejects.toBeInstanceOf(
      StoresCacheStaleError,
    )
    expect(readStores).toHaveBeenCalledTimes(1)
    expect(bumpRecordsRevision).toHaveBeenCalledTimes(1)
  })
})
