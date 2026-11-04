// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { resetAuthIdentityForTests } from '@/lib/authIdentity'

const listFolders = vi.fn()
const listMemoItems = vi.fn()
const listRecordsForFolders = vi.fn()

vi.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: () => false,
}))

vi.mock('@/features/folders/api/foldersApi', () => ({
  createFolder: vi.fn(),
  filterFolders: (folders: unknown[]) => folders,
  findFolderByName: vi.fn(),
  listFolders: () => listFolders(),
}))

vi.mock('@/features/records/api/recordsApi', () => ({
  listRecords: vi.fn(),
  listRecordsForFolders: (ids: string[]) => listRecordsForFolders(ids),
}))

vi.mock('../api/memoApi', () => ({
  addMemoItem: vi.fn(),
  removeMemoItem: vi.fn(),
  listMemoItems: () => listMemoItems(),
  reorderMemoItems: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: {
          session: {
            user: { id: 'user-a' },
            access_token: 'token-a',
            refresh_token: 'refresh',
          },
        },
      }),
      onAuthStateChange: vi.fn((cb) => {
        void cb('INITIAL_SESSION', {
          user: { id: 'user-a' },
          access_token: 'token-a',
          refresh_token: 'refresh',
        })
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      }),
    },
  },
}))

vi.mock('@/components/trash/TrashDragContext', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/components/trash/TrashDragContext')>()
  return {
    ...actual,
    useTrashDrag: () => ({
      registerList: vi.fn(),
      insertBeforeId: null,
      activeId: null,
      activeKind: null,
      dragOverTrash: false,
      dragging: false,
    }),
  }
})

vi.mock('@/components/trash/TrashDragProvider', () => ({
  TrashDragProvider: ({ children }: { children: React.ReactNode }) => children,
  MemoTrashZone: () => null,
}))

import { AuthProvider } from '@/contexts/AuthContext'
import { ShoppingMemoPage } from './ShoppingMemoPage'

describe('ShoppingMemoPage initial load', () => {
  beforeEach(() => {
    resetAuthIdentityForTests()
    listFolders.mockReset()
    listMemoItems.mockReset()
    listRecordsForFolders.mockReset()
    listMemoItems.mockResolvedValue([])
    listRecordsForFolders.mockResolvedValue([])
    listFolders.mockResolvedValue([])
  })

  afterEach(() => {
    cleanup()
    resetAuthIdentityForTests()
  })

  it('loads memo items and scoped records without listFolders until add panel opens', async () => {
    render(
      <AuthProvider>
        <ShoppingMemoPage active />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.queryByText('読み込み中...')).toBeNull()
    })

    expect(listMemoItems).toHaveBeenCalledTimes(1)
    expect(listRecordsForFolders).toHaveBeenCalledTimes(1)
    expect(listFolders).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /メモを追加/ }))

    await waitFor(() => {
      expect(listFolders).toHaveBeenCalledTimes(1)
    })
  })
})
