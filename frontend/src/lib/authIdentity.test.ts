import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Session } from '@supabase/supabase-js'
import {
  applyAuthIdentity,
  resetAuthIdentityForTests,
  sessionUserId,
} from './authIdentity'
import {
  getStoresCacheOwnerUserId,
  peekStoresCache,
  resetStoresCacheForTests,
  setStoresCache,
} from '@/features/stores/api/storesCache'
import { getCatalogRevisions } from './catalogSync'
import type { PriceStore } from '@/features/stores/types'

function mockSession(userId: string): Session {
  return {
    access_token: `token-${userId}`,
    refresh_token: 'refresh',
    expires_in: 3600,
    token_type: 'bearer',
    user: {
      id: userId,
      aud: 'authenticated',
      role: 'authenticated',
      email: `${userId}@example.com`,
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-01-01T00:00:00Z',
    },
  }
}

function store(id: string, name: string): PriceStore {
  return {
    id,
    name,
    user_id: 'user',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

describe('authIdentity', () => {
  beforeEach(() => {
    resetAuthIdentityForTests()
    resetStoresCacheForTests()
  })

  afterEach(() => {
    resetAuthIdentityForTests()
    resetStoresCacheForTests()
  })

  it('extracts session user id', () => {
    expect(sessionUserId(null)).toBeNull()
    expect(sessionUserId(mockSession('user-a'))).toBe('user-a')
  })

  it('resets shared caches when user id changes', () => {
    applyAuthIdentity(mockSession('user-a'))
    setStoresCache([store('1', 'Alpha')])
    expect(getStoresCacheOwnerUserId()).toBe('user-a')
    expect(peekStoresCache()).toHaveLength(1)

    applyAuthIdentity(mockSession('user-b'))
    expect(getStoresCacheOwnerUserId()).toBe('user-b')
    expect(peekStoresCache()).toBeNull()
    expect(getCatalogRevisions()).toEqual({
      folders: 0,
      records: 0,
      stores: 0,
    })
  })

  it('does not reset caches on same-user token refresh', () => {
    applyAuthIdentity(mockSession('user-a'))
    setStoresCache([store('1', 'Alpha')])
    const revisionsAfterLogin = getCatalogRevisions()

    applyAuthIdentity({
      ...mockSession('user-a'),
      access_token: 'refreshed-token',
    })

    expect(getStoresCacheOwnerUserId()).toBe('user-a')
    expect(peekStoresCache()).toEqual([store('1', 'Alpha')])
    expect(getCatalogRevisions()).toEqual(revisionsAfterLogin)
  })

  it('clears caches on logout', () => {
    applyAuthIdentity(mockSession('user-a'))
    setStoresCache([store('1', 'Alpha')])

    applyAuthIdentity(null)

    expect(getStoresCacheOwnerUserId()).toBeNull()
    expect(peekStoresCache()).toBeNull()
  })
})
