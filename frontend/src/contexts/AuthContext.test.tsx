// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { AuthProvider, useAuth } from './AuthContext'
import { resetAuthIdentityForTests } from '@/lib/authIdentity'
import { resetStoresCacheForTests } from '@/features/stores/api/storesCache'

const getSession = vi.fn()
const onAuthStateChange = vi.fn()
const signOut = vi.fn()

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => getSession(),
      onAuthStateChange: (cb: (event: string, session: unknown) => void) =>
        onAuthStateChange(cb),
      signOut: () => signOut(),
    },
  },
}))

function AuthProbe() {
  const { session, isLoading } = useAuth()
  if (isLoading) return <div data-testid="loading" />
  return (
    <div data-testid="session" data-user-id={session?.user?.id ?? 'none'} />
  )
}

describe('AuthContext', () => {
  let authCallback: ((event: string, session: unknown) => void) | null = null

  beforeEach(() => {
    resetAuthIdentityForTests()
    resetStoresCacheForTests()
    getSession.mockReset()
    onAuthStateChange.mockReset()
    signOut.mockReset()
    authCallback = null
    onAuthStateChange.mockImplementation((cb) => {
      authCallback = cb
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    })
  })

  afterEach(() => {
    cleanup()
    resetAuthIdentityForTests()
    resetStoresCacheForTests()
  })

  it('does not let a late getSession overwrite a newer auth event', async () => {
    let resolveSession: (value: {
      data: { session: { user: { id: string } } | null }
    }) => void = () => {}
    getSession.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSession = resolve
        }),
    )

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    )

    expect(screen.getByTestId('loading')).toBeTruthy()

    await act(async () => {
      authCallback?.('SIGNED_IN', { user: { id: 'user-b' } })
    })

    await waitFor(() => {
      expect(screen.getByTestId('session').dataset.userId).toBe('user-b')
    })

    await act(async () => {
      resolveSession({ data: { session: { user: { id: 'user-a' } } } })
    })

    expect(screen.getByTestId('session').dataset.userId).toBe('user-b')
  })

  it('uses getSession when the auth listener has not fired yet', async () => {
    getSession.mockResolvedValue({
      data: { session: { user: { id: 'user-a' } } },
    })

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('session').dataset.userId).toBe('user-a')
    })
  })
})
