import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PriceStore } from '../types'
import { applyAuthIdentity, resetAuthIdentityForTests } from '@/lib/authIdentity'
import {
  resetStoresCacheForTests,
  resetStoresCacheForUser,
  StoresCacheStaleError,
} from './storesCache'

const getUser = vi.fn()
const insert = vi.fn()

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: () => getUser(),
    },
    from: () => ({
      insert: () => ({
        select: () => ({
          single: () => insert(),
        }),
      }),
    }),
  },
}))

import { createStore } from './storesApi'

function store(id: string, name: string): PriceStore {
  return {
    id,
    name,
    user_id: 'user-a',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

describe('createStore epoch guard', () => {
  beforeEach(() => {
    resetAuthIdentityForTests()
    resetStoresCacheForTests()
    getUser.mockReset()
    insert.mockReset()
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

  it('rejects insert when auth identity changes before pre-insert boundary', async () => {
    let resolveUser: (value: {
      data: { user: { id: string } }
      error: null
    }) => void = () => {}
    getUser.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUser = resolve
        }),
    )

    const pending = createStore('New Store')
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

    resolveUser({ data: { user: { id: 'user-a' } }, error: null })

    await expect(pending).rejects.toBeInstanceOf(StoresCacheStaleError)
    expect(insert).not.toHaveBeenCalled()
  })

  it('creates a store for the same user when identity is unchanged', async () => {
    getUser.mockResolvedValue({
      data: { user: { id: 'user-a' } },
      error: null,
    })
    insert.mockResolvedValue({
      data: store('1', 'New Store'),
      error: null,
    })

    const created = await createStore('New Store')

    expect(created).toEqual(store('1', 'New Store'))
    expect(insert).toHaveBeenCalledTimes(1)
  })
})
