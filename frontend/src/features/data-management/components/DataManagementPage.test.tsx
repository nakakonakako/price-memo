// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const rpc = vi.fn()
const getCurrentAuthUserId = vi.fn()
const invalidateStoresCache = vi.fn()
const resetCatalogSync = vi.fn()
const useAuth = vi.fn()

vi.mock('@/lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}))
vi.mock('@/lib/authIdentity', () => ({
  getCurrentAuthUserId: () => getCurrentAuthUserId(),
}))
vi.mock('@/features/stores/api/storesCache', () => ({
  invalidateStoresCache: () => invalidateStoresCache(),
}))
vi.mock('@/lib/catalogSync', () => ({
  resetCatalogSync: () => resetCatalogSync(),
}))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => useAuth() }))
vi.mock('@/components/DialogShell', () => ({
  DialogShell: ({
    open,
    title,
    children,
  }: {
    open: boolean
    title: string
    children: React.ReactNode
  }) => open ? (
    <div role="alertdialog" aria-label={title}>
      <h2>{title}</h2>
      {children}
    </div>
  ) : null,
}))

import { DATA_HANDLING_DISCLOSURE_TEST_ID } from './DataHandlingDisclosureContent'
import { DataManagementPage } from './DataManagementPage'

describe('DataManagementPage', () => {
  beforeEach(() => {
    rpc.mockReset()
    getCurrentAuthUserId.mockReset().mockReturnValue('user-a')
    invalidateStoresCache.mockReset()
    resetCatalogSync.mockReset()
    useAuth.mockReset().mockReturnValue({ session: { user: { id: 'user-a' } } })
  })

  afterEach(() => cleanup())

  it('opens the shared data-handling disclosure without calling delete RPC', () => {
    render(<DataManagementPage onDataDeleted={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'データの取り扱い' }))

    expect(screen.getByTestId(DATA_HANDLING_DISCLOSURE_TEST_ID)).toBeTruthy()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('requires confirmation, resets caches, and delegates success notification', async () => {
    let resolveRpc: ((value: { error: null }) => void) | undefined
    rpc.mockImplementation(() => new Promise((resolve) => { resolveRpc = resolve }))
    const onDataDeleted = vi.fn()
    render(<DataManagementPage onDataDeleted={onDataDeleted} />)

    fireEvent.click(screen.getByRole('button', { name: 'すべてのデータを削除' }))
    const confirm = await screen.findByRole('button', { name: '削除を確定する' })
    fireEvent.click(confirm)
    fireEvent.click(confirm)

    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('delete_my_price_memo_data')
    expect((confirm as HTMLButtonElement).disabled).toBe(true)

    await act(async () => resolveRpc?.({ error: null }))

    await waitFor(() => expect(onDataDeleted).toHaveBeenCalledTimes(1))
    expect(invalidateStoresCache).toHaveBeenCalledOnce()
    expect(resetCatalogSync).toHaveBeenCalledOnce()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('shows an error without resetting state or reporting success', async () => {
    rpc.mockResolvedValue({ error: { message: 'database failure' } })
    const onDataDeleted = vi.fn()
    render(<DataManagementPage onDataDeleted={onDataDeleted} />)

    fireEvent.click(screen.getByRole('button', { name: 'すべてのデータを削除' }))
    fireEvent.click(await screen.findByRole('button', { name: '削除を確定する' }))

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
    expect(onDataDeleted).not.toHaveBeenCalled()
    expect(invalidateStoresCache).not.toHaveBeenCalled()
    expect(resetCatalogSync).not.toHaveBeenCalled()
  })

  it('does not report the old request as successful after an account switch', async () => {
    let resolveRpc: ((value: { error: null }) => void) | undefined
    rpc.mockImplementation(() => new Promise((resolve) => { resolveRpc = resolve }))
    const onDataDeleted = vi.fn()
    render(<DataManagementPage onDataDeleted={onDataDeleted} />)

    fireEvent.click(screen.getByRole('button', { name: 'すべてのデータを削除' }))
    fireEvent.click(await screen.findByRole('button', { name: '削除を確定する' }))
    getCurrentAuthUserId.mockReturnValue('user-b')
    await act(async () => resolveRpc?.({ error: null }))

    expect(onDataDeleted).not.toHaveBeenCalled()
    expect(invalidateStoresCache).not.toHaveBeenCalled()
    expect(resetCatalogSync).not.toHaveBeenCalled()
    expect(screen.queryByRole('status')).toBeNull()
  })
})
