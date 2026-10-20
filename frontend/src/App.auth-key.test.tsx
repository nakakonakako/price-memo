// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import type { Session } from '@supabase/supabase-js'

const useAuth = vi.fn()
const realtimeMocks = vi.hoisted(() => ({
  subscribe: vi.fn(),
  refreshStores: vi.fn(),
}))

vi.mock('@/lib/priceMemoRealtime', () => ({
  subscribePriceMemoRealtime: realtimeMocks.subscribe,
}))

vi.mock('@/lib/externalSync', () => ({
  clearPendingExternalSync: vi.fn(),
  requestExternalSync: vi.fn(),
  subscribeExternalSync: vi.fn(() => vi.fn()),
}))

vi.mock('@/features/stores/api/storesCache', () => ({
  refreshStoresCacheFromRealtime: realtimeMocks.refreshStores,
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => useAuth(),
}))

vi.mock('@/components/Auth', () => ({
  Auth: () => <div data-testid="auth" />,
}))

vi.mock('@/components/MainLayout', () => ({
  MainLayout: ({ children, onTabChange }: {
    children: React.ReactNode
    onTabChange: (tab: 'data') => void
  }) => (
    <div data-testid="main-layout">
      <button onClick={() => onTabChange('data')}>データ管理</button>
      {children}
    </div>
  ),
}))

vi.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: () => false,
}))

vi.mock('@/features/memo/components/ShoppingMemoPage', () => ({
  ShoppingMemoPage: () => {
    const [marker] = useState(() => String(Math.random()))
    return <div data-testid="page-state" data-marker={marker} />
  },
}))

vi.mock('@/features/folders/components/FoldersPage', () => ({
  FoldersPage: () => <div data-testid="folders-page" />,
}))

vi.mock('@/features/trends/components/TrendsPage', () => ({
  TrendsPage: () => <div data-testid="trends-page" />,
}))

vi.mock('@/features/guide/components/HowToPage', () => ({
  HowToPage: () => <div data-testid="howto-page" />,
}))

vi.mock('@/features/data-management/components/DataManagementPage', () => ({
  DataManagementPage: ({ onDataDeleted }: { onDataDeleted: () => void }) => (
    <button data-testid="delete-data" onClick={onDataDeleted}>
      削除完了
    </button>
  ),
}))

import App from './App'

function mockSession(userId: string, token = 'token'): Session {
  return {
    access_token: token,
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

function getPageMarker(): string {
  const el = screen.getByTestId('page-state')
  const marker = el.getAttribute('data-marker')
  if (!marker) throw new Error('page marker missing')
  return marker
}

describe('App auth-keyed remount', () => {
  beforeEach(() => {
    realtimeMocks.subscribe.mockReset().mockReturnValue(vi.fn())
    realtimeMocks.refreshStores.mockReset().mockResolvedValue([])
    useAuth.mockReturnValue({
      session: mockSession('user-a', 'token-a'),
      isLoading: false,
      logout: vi.fn(),
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('logout then login as another user destroys prior page state', () => {
    const { rerender } = render(<App />)
    const markerA = getPageMarker()

    useAuth.mockReturnValue({
      session: null,
      isLoading: false,
      logout: vi.fn(),
    })
    rerender(<App />)
    expect(screen.getByTestId('auth')).toBeTruthy()

    useAuth.mockReturnValue({
      session: mockSession('user-b', 'token-b'),
      isLoading: false,
      logout: vi.fn(),
    })
    rerender(<App />)

    const markerB = getPageMarker()
    expect(markerB).not.toBe(markerA)
  })

  it('direct user A to user B remounts page state', () => {
    const { rerender } = render(<App />)
    const markerA = getPageMarker()

    useAuth.mockReturnValue({
      session: mockSession('user-b', 'token-b'),
      isLoading: false,
      logout: vi.fn(),
    })
    rerender(<App />)

    expect(getPageMarker()).not.toBe(markerA)
    expect(screen.getByTestId('main-layout')).toBeTruthy()
  })

  it('same-user token refresh preserves page state', () => {
    const { rerender } = render(<App />)
    const markerA = getPageMarker()

    useAuth.mockReturnValue({
      session: mockSession('user-a', 'token-refreshed'),
      isLoading: false,
      logout: vi.fn(),
    })
    rerender(<App />)

    expect(getPageMarker()).toBe(markerA)
    expect(realtimeMocks.subscribe).toHaveBeenCalledTimes(1)
  })

  it('moves the private subscription on user switch and removes it on logout', () => {
    const unsubscribeA = vi.fn()
    realtimeMocks.subscribe.mockReturnValueOnce(unsubscribeA).mockReturnValue(vi.fn())
    const { rerender } = render(<App />)
    expect(realtimeMocks.subscribe).toHaveBeenCalledTimes(1)

    useAuth.mockReturnValue({
      session: mockSession('user-b', 'token-b'),
      isLoading: false,
      logout: vi.fn(),
    })
    rerender(<App />)
    expect(unsubscribeA).toHaveBeenCalledTimes(1)
    expect(realtimeMocks.subscribe).toHaveBeenCalledTimes(2)
    expect(realtimeMocks.subscribe.mock.calls[1][0]).toBe('user-b')

    useAuth.mockReturnValue({ session: null, isLoading: false, logout: vi.fn() })
    rerender(<App />)
    expect(realtimeMocks.subscribe.mock.results[1].value).toHaveBeenCalledTimes(1)
  })

  it('returns to a fresh memo screen after successful data deletion', () => {
    render(<App />)
    const beforeDeletion = getPageMarker()

    fireEvent.click(screen.getByRole('button', { name: 'データ管理' }))
    fireEvent.click(screen.getByTestId('delete-data'))

    expect(getPageMarker()).not.toBe(beforeDeletion)
    expect(screen.getByRole('status').textContent).toContain('削除しました')
  })
})
