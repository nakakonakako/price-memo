// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { applyAuthIdentity, resetAuthIdentityForTests } from '@/lib/authIdentity'
import { AuthProvider } from '@/contexts/AuthContext'

const listFolders = vi.fn()
const listMemoItems = vi.fn()
const listRecordsForFolders = vi.fn()
const reorderMemoItems = vi.fn()
const getSession = vi.fn()
const onAuthStateChange = vi.fn()

vi.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: () => true,
}))

vi.mock('@/features/folders/api/foldersApi', () => ({
  createFolder: vi.fn(),
  listFolders: () => listFolders(),
}))

vi.mock('@/features/records/api/recordsApi', () => ({
  listRecords: vi.fn(),
  listRecordsForFolders: (ids: string[]) => listRecordsForFolders(ids),
}))

vi.mock('../api/memoApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/memoApi')>()
  return {
    ...actual,
    addMemoItem: vi.fn(),
    removeMemoItem: vi.fn(),
    listMemoItems: () => listMemoItems(),
    reorderMemoItems: (...args: unknown[]) => reorderMemoItems(...args),
  }
})

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => getSession(),
      onAuthStateChange: (cb: (event: string, session: unknown) => void) =>
        onAuthStateChange(cb),
    },
  },
}))

import { ShoppingMemoPage } from './ShoppingMemoPage'

const folderA = {
  id: 'folder-a',
  user_id: 'user-a',
  name: 'A',
  created_at: '2026-01-01T00:00:00Z',
}
const folderB = {
  id: 'folder-b',
  user_id: 'user-a',
  name: 'B',
  created_at: '2026-01-01T00:00:00Z',
}

function memoItem(folderId: string, sortOrder: number) {
  return {
    id: `memo-${folderId}`,
    user_id: 'user-a',
    folder_id: folderId,
    sort_order: sortOrder,
    created_at: '2026-01-01T00:00:00Z',
    folder: folderId === 'folder-a' ? folderA : folderB,
  }
}

function renderPage() {
  return render(
    <AuthProvider>
      <ShoppingMemoPage active />
    </AuthProvider>,
  )
}

describe('ShoppingMemoPage mobile reorder', () => {
  beforeEach(() => {
    resetAuthIdentityForTests()
    listFolders.mockReset()
    listMemoItems.mockReset()
    listRecordsForFolders.mockReset()
    reorderMemoItems.mockReset()
    getSession.mockReset()
    onAuthStateChange.mockReset()

    onAuthStateChange.mockImplementation(() => {
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    })
    getSession.mockResolvedValue({
      data: {
        session: {
          user: { id: 'user-a' },
          access_token: 'token-a',
          refresh_token: 'refresh',
        },
      },
    })

    listFolders.mockResolvedValue([folderA, folderB])
    listRecordsForFolders.mockResolvedValue([])
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
    cleanup()
    resetAuthIdentityForTests()
  })

  it('shows reorder handles and moves item with arrow key', async () => {
    listMemoItems.mockResolvedValue([memoItem('folder-a', 0), memoItem('folder-b', 1)])
    reorderMemoItems.mockResolvedValue(undefined)

    renderPage()

    await waitFor(() => {
      expect(screen.getByLabelText('Aの並べ替え')).toBeTruthy()
    })

    const handle = screen.getByLabelText('Bの並べ替え')
    handle.focus()
    await act(async () => {
      fireEvent.keyDown(handle, { key: 'ArrowUp' })
    })

    await waitFor(() => {
      expect(reorderMemoItems).toHaveBeenCalledWith(
        ['folder-a', 'folder-b'],
        ['folder-b', 'folder-a'],
      )
    })
  })
})
