// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { applyAuthIdentity, resetAuthIdentityForTests } from '@/lib/authIdentity'
import {
  bumpFoldersRevision,
  bumpRecordsRevision,
  resetCatalogSync,
} from '@/lib/catalogSync'
import { AuthProvider } from '@/contexts/AuthContext'
import type { PriceRecord } from '@/features/records/types'

const listFolders = vi.fn()
const listMemoItems = vi.fn()
const listRecordsForFolders = vi.fn()
const removeMemoItem = vi.fn()
const getSession = vi.fn()
const onAuthStateChange = vi.fn()

vi.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: () => false,
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
    removeMemoItem: (...args: unknown[]) => removeMemoItem(...args),
    listMemoItems: () => listMemoItems(),
    reorderMemoItems: vi.fn(),
  }
})

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
  TrashDragProvider: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  MemoTrashZone: () => null,
}))

vi.mock('./FolderMemoCard', () => ({
  FolderMemoCard: ({
    folderId,
    records,
    onRemoveFromMemo,
  }: {
    folderId: string
    records: PriceRecord[]
    onRemoveFromMemo?: () => void
  }) => (
    <li data-testid={`memo-card-${folderId}`} data-record-count={records.length}>
      {folderId}
      {onRemoveFromMemo ? (
        <button type="button" data-testid={`remove-${folderId}`} onClick={onRemoveFromMemo}>
          remove
        </button>
      ) : null}
    </li>
  ),
}))

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
const folderC = {
  id: 'folder-c',
  user_id: 'user-a',
  name: 'C',
  created_at: '2026-01-01T00:00:00Z',
}

function memoItem(folderId: string, sortOrder: number) {
  const folder =
    folderId === 'folder-a'
      ? folderA
      : folderId === 'folder-b'
        ? folderB
        : folderC
  return {
    id: `memo-${folderId}`,
    user_id: 'user-a',
    folder_id: folderId,
    sort_order: sortOrder,
    created_at: '2026-01-01T00:00:00Z',
    folder,
  }
}

function recordRow(folderId: string, id: string): PriceRecord {
  return {
    id,
    user_id: 'user-a',
    folder_id: folderId,
    store_name: 'store',
    price_yen: 100,
    amount: 1,
    unit: 'g',
    recorded_at: '2026-01-01',
    note: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

function renderPage(active: boolean) {
  return render(
    <AuthProvider>
      <ShoppingMemoPage active={active} />
    </AuthProvider>,
  )
}

async function waitForInitialLoad() {
  await waitFor(() => {
    expect(screen.getByTestId('memo-card-folder-a')).toBeTruthy()
  })
}

describe('ShoppingMemoPage catalog refresh', () => {
  beforeEach(() => {
    resetAuthIdentityForTests()
    resetCatalogSync()
    listFolders.mockReset()
    listMemoItems.mockReset()
    listRecordsForFolders.mockReset()
    removeMemoItem.mockReset()
    getSession.mockReset()
    onAuthStateChange.mockReset()

    onAuthStateChange.mockImplementation((cb) => {
      void cb
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

    listFolders.mockResolvedValue([folderA, folderB, folderC])
    listMemoItems.mockResolvedValue([
      memoItem('folder-a', 0),
      memoItem('folder-b', 1),
    ])
    listRecordsForFolders.mockResolvedValue([
      recordRow('folder-a', 'rec-a'),
      recordRow('folder-b', 'rec-b'),
    ])
    removeMemoItem.mockResolvedValue(undefined)
  })

  afterEach(() => {
    cleanup()
    resetAuthIdentityForTests()
    resetCatalogSync()
  })

  async function returnToMemoAfterCatalogChange(
    change: () => void,
    nextMocks?: () => void,
  ) {
    const view = renderPage(true)
    await waitForInitialLoad()

    view.rerender(
      <AuthProvider>
        <ShoppingMemoPage active={false} />
      </AuthProvider>,
    )

    change()
    nextMocks?.()

    view.rerender(
      <AuthProvider>
        <ShoppingMemoPage active={true} />
      </AuthProvider>,
    )
  }

  it('drops deleted-folder memo cards and records after folders revision', async () => {
    await returnToMemoAfterCatalogChange(
      () => {
        bumpFoldersRevision()
      },
      () => {
        listFolders.mockResolvedValue([folderA, folderC])
        listMemoItems.mockResolvedValue([memoItem('folder-a', 0)])
        listRecordsForFolders.mockResolvedValue([recordRow('folder-a', 'rec-a')])
      },
    )

    await waitFor(() => {
      expect(screen.queryByTestId('memo-card-folder-b')).toBeNull()
      expect(screen.getByTestId('memo-card-folder-a')).toBeTruthy()
      expect(screen.getByTestId('memo-card-folder-a').getAttribute('data-record-count')).toBe(
        '1',
      )
    })
  })

  it('keeps unrelated memo items and records when another folder is removed', async () => {
    await returnToMemoAfterCatalogChange(
      () => bumpFoldersRevision(),
      () => {
        listFolders.mockResolvedValue([folderA, folderC])
        listMemoItems.mockResolvedValue([
          memoItem('folder-a', 0),
          memoItem('folder-c', 1),
        ])
        listRecordsForFolders.mockResolvedValue([
          recordRow('folder-a', 'rec-a'),
          recordRow('folder-c', 'rec-c'),
        ])
      },
    )

    await waitFor(() => {
      expect(screen.getByTestId('memo-card-folder-a')).toBeTruthy()
      expect(screen.getByTestId('memo-card-folder-c')).toBeTruthy()
      expect(screen.getByTestId('memo-card-folder-a').getAttribute('data-record-count')).toBe(
        '1',
      )
      expect(screen.getByTestId('memo-card-folder-c').getAttribute('data-record-count')).toBe(
        '1',
      )
    })
  })

  it('loads memo and records once when folders and records revisions change together', async () => {
    await returnToMemoAfterCatalogChange(
      () => {
        bumpFoldersRevision()
        bumpRecordsRevision()
      },
      () => {
        listMemoItems.mockResolvedValue([memoItem('folder-a', 0)])
        listRecordsForFolders.mockResolvedValue([recordRow('folder-a', 'rec-a')])
      },
    )

    await waitFor(() => {
      expect(screen.queryByTestId('memo-card-folder-b')).toBeNull()
    })

    expect(listMemoItems).toHaveBeenCalledTimes(2)
    expect(listFolders).toHaveBeenCalledTimes(2)
  })

  it('refreshes memo items and records without reloading folders on records-only revision', async () => {
    await returnToMemoAfterCatalogChange(
      () => bumpRecordsRevision(),
      () => {
        listMemoItems.mockResolvedValue([
          memoItem('folder-a', 0),
          memoItem('folder-b', 1),
        ])
        listRecordsForFolders.mockResolvedValue([
          recordRow('folder-a', 'rec-a'),
          recordRow('folder-b', 'rec-b-new'),
        ])
      },
    )

    await waitFor(() => {
      expect(screen.getByTestId('memo-card-folder-b').getAttribute('data-record-count')).toBe(
        '1',
      )
    })

    expect(listMemoItems).toHaveBeenCalledTimes(2)
    expect(listFolders).toHaveBeenCalledTimes(1)
  })

  it('removes a folder from the memo without deleting folders or unrelated memo data', async () => {
    renderPage(true)
    await waitForInitialLoad()

    await act(async () => {
      screen.getByTestId('remove-folder-b').click()
    })

    await waitFor(() => {
      expect(screen.queryByTestId('memo-card-folder-b')).toBeNull()
      expect(screen.getByTestId('memo-card-folder-a')).toBeTruthy()
    })

    expect(removeMemoItem).toHaveBeenCalledWith('folder-b')
    expect(listFolders).toHaveBeenCalledTimes(1)
    expect(listMemoItems).toHaveBeenCalledTimes(1)
  })

  it('shows an error and retries catalog refresh when returning to the memo tab', async () => {
    const view = renderPage(true)
    await waitForInitialLoad()

    view.rerender(
      <AuthProvider>
        <ShoppingMemoPage active={false} />
      </AuthProvider>,
    )

    bumpFoldersRevision()
    listMemoItems.mockRejectedValueOnce(new Error('network down'))

    view.rerender(
      <AuthProvider>
        <ShoppingMemoPage active={true} />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(
        screen.getByText('通信に失敗しました。接続を確認してからもう一度お試しください。'),
      ).toBeTruthy()
      expect(screen.getByTestId('memo-card-folder-b')).toBeTruthy()
    })

    listMemoItems.mockResolvedValue([memoItem('folder-a', 0)])

    view.rerender(
      <AuthProvider>
        <ShoppingMemoPage active={false} />
      </AuthProvider>,
    )
    view.rerender(
      <AuthProvider>
        <ShoppingMemoPage active={true} />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.queryByTestId('memo-card-folder-b')).toBeNull()
    })
  })

  it('does not apply a stale records-only fetch after a folders revision load', async () => {
    let releaseRecordsOnly: () => void = () => {}
    const recordsOnlyGate = new Promise<void>((resolve) => {
      releaseRecordsOnly = () => resolve()
    })

    const view = renderPage(true)
    await waitForInitialLoad()

    view.rerender(
      <AuthProvider>
        <ShoppingMemoPage active={false} />
      </AuthProvider>,
    )

    bumpRecordsRevision()
    listMemoItems.mockImplementationOnce(() =>
      recordsOnlyGate.then(() => [
        memoItem('folder-a', 0),
        memoItem('folder-b', 1),
      ]),
    )

    view.rerender(
      <AuthProvider>
        <ShoppingMemoPage active={true} />
      </AuthProvider>,
    )

    view.rerender(
      <AuthProvider>
        <ShoppingMemoPage active={false} />
      </AuthProvider>,
    )

    bumpFoldersRevision()
    listMemoItems.mockResolvedValue([memoItem('folder-a', 0)])
    listRecordsForFolders.mockResolvedValue([recordRow('folder-a', 'rec-a')])
    listFolders.mockResolvedValue([folderA, folderC])

    await act(async () => {
      view.rerender(
        <AuthProvider>
          <ShoppingMemoPage active={true} />
        </AuthProvider>,
      )
    })

    await waitFor(() => {
      expect(screen.queryByTestId('memo-card-folder-b')).toBeNull()
    })

    await act(async () => {
      releaseRecordsOnly()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.queryByTestId('memo-card-folder-b')).toBeNull()
    expect(screen.getByTestId('memo-card-folder-a').getAttribute('data-record-count')).toBe(
      '1',
    )
  })
})
