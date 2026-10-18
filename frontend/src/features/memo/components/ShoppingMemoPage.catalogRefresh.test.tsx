// @vitest-environment jsdom
import { useState, type ReactNode } from 'react'
import type { DragEndResult } from '@/components/trash/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { applyAuthIdentity, resetAuthIdentityForTests } from '@/lib/authIdentity'
import {
  bumpFoldersRevision,
  bumpRecordsRevision,
  publishFolderDeleted,
  resetCatalogSync,
} from '@/lib/catalogSync'
import { AuthProvider } from '@/contexts/AuthContext'
import type { PriceRecord } from '@/features/records/types'

const listFolders = vi.fn()
const listMemoItems = vi.fn()
const listRecords = vi.fn()
const listRecordsForFolders = vi.fn()
const addMemoItem = vi.fn()
const removeMemoItem = vi.fn()
const reorderMemoItems = vi.fn()
const getSession = vi.fn()
const onAuthStateChange = vi.fn()
let memoDragEnd: ((result: DragEndResult) => void) | null = null
let authStateCallback: ((event: string, session: unknown) => void) | null = null

vi.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: () => false,
}))

vi.mock('@/features/folders/api/foldersApi', () => ({
  createFolder: vi.fn(),
  listFolders: () => listFolders(),
}))

vi.mock('@/features/records/api/recordsApi', () => ({
  listRecords: (...args: unknown[]) => listRecords(...args),
  listRecordsForFolders: (ids: string[]) => listRecordsForFolders(ids),
}))

vi.mock('../api/memoApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/memoApi')>()
  return {
    ...actual,
    addMemoItem: (...args: unknown[]) => addMemoItem(...args),
    removeMemoItem: (...args: unknown[]) => removeMemoItem(...args),
    listMemoItems: () => listMemoItems(),
    reorderMemoItems: (...args: unknown[]) => reorderMemoItems(...args),
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
  TrashDragProvider: ({
    children,
    onDragEnd,
  }: {
    children: ReactNode
    onDragEnd: (result: DragEndResult) => void
  }) => {
    memoDragEnd = onDragEnd
    return <div>{children}</div>
  },
  MemoTrashZone: () => null,
}))

vi.mock('./FolderMemoCard', () => ({
  FolderMemoCard: ({
    folderId,
    records,
    forceOpen,
    onRemoveFromMemo,
    onSaved,
  }: {
    folderId: string
    records: PriceRecord[]
    forceOpen?: boolean
    onRemoveFromMemo?: () => void
    onSaved?: (record: PriceRecord) => void
  }) => {
    const [expanded, setExpanded] = useState(false)
    const [draft, setDraft] = useState('')
    return (
      <li
        data-testid={`memo-card-${folderId}`}
        data-record-count={records.length}
        data-expanded={forceOpen || expanded ? 'true' : 'false'}
      >
        {folderId}
        <button type="button" aria-label={`expand-${folderId}`} onClick={() => setExpanded(true)}>
          open
        </button>
        {expanded && (
          <input
            aria-label={`draft-${folderId}`}
            value={draft}
            onChange={(event) => setDraft(event.currentTarget.value)}
          />
        )}
        {onRemoveFromMemo ? (
          <button type="button" data-testid={`remove-${folderId}`} onClick={onRemoveFromMemo}>
            remove
          </button>
        ) : null}
        {onSaved ? (
          <button
            type="button"
            data-testid={`save-${folderId}`}
            onClick={() => onSaved(recordRow(folderId, 'saved-local'))}
          >
            save
          </button>
        ) : null}
      </li>
    )
  },
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
    listRecords.mockReset()
    listRecordsForFolders.mockReset()
    addMemoItem.mockReset()
    removeMemoItem.mockReset()
    reorderMemoItems.mockReset()
    getSession.mockReset()
    onAuthStateChange.mockReset()

    memoDragEnd = null
    authStateCallback = null
    onAuthStateChange.mockImplementation((cb) => {
      authStateCallback = cb
      void cb('INITIAL_SESSION', {
        user: { id: 'user-a' },
        access_token: 'token-a',
        refresh_token: 'refresh',
      })
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
    listRecords.mockResolvedValue([])
    addMemoItem.mockImplementation(async (folderId: string) =>
      memoItem(folderId, 0),
    )
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

    nextMocks?.()
    change()

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

    listMemoItems.mockResolvedValue([memoItem('folder-a', 0)])
    listRecordsForFolders.mockResolvedValue([recordRow('folder-a', 'rec-a')])

    await act(async () => {
      screen.getByTestId('remove-folder-b').click()
    })

    await waitFor(() => {
      expect(screen.queryByTestId('memo-card-folder-b')).toBeNull()
      expect(screen.getByTestId('memo-card-folder-a')).toBeTruthy()
    })

    expect(removeMemoItem).toHaveBeenCalledWith('folder-b')
    expect(listFolders).toHaveBeenCalledTimes(2)
    expect(listMemoItems).toHaveBeenCalledTimes(2)
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

  it('removes the memo card immediately on folder delete notification before reload finishes', async () => {
    let releaseLoad: () => void = () => {}
    const loadGate = new Promise<void>((resolve) => {
      releaseLoad = () => resolve()
    })

    const view = renderPage(true)
    await waitForInitialLoad()

    view.rerender(
      <AuthProvider>
        <ShoppingMemoPage active={false} />
      </AuthProvider>,
    )

    listFolders.mockImplementationOnce(() => loadGate.then(() => [folderA, folderC]))
    listMemoItems.mockImplementationOnce(() =>
      loadGate.then(() => [memoItem('folder-a', 0)]),
    )
    listRecordsForFolders.mockImplementationOnce(() =>
      loadGate.then(() => [recordRow('folder-a', 'rec-a')]),
    )

    act(() => {
      publishFolderDeleted({ folderId: 'folder-b', userId: 'user-a' })
    })

    view.rerender(
      <AuthProvider>
        <ShoppingMemoPage active={true} />
      </AuthProvider>,
    )

    expect(screen.queryByTestId('memo-card-folder-b')).toBeNull()
    expect(screen.getByTestId('memo-card-folder-a')).toBeTruthy()

    await act(async () => {
      releaseLoad()
      await loadGate
    })

    await waitFor(() => {
      expect(screen.queryByTestId('memo-card-folder-b')).toBeNull()
    })
  })

  it('keeps a newly added unrelated memo after invalidating a stale delete refresh', async () => {
    let releaseFolders: (folders: PriceFolder[]) => void = () => {}
    let releaseMemoItems: (items: PriceMemoItem[]) => void = () => {}
    const foldersGate = new Promise<PriceFolder[]>((resolve) => {
      releaseFolders = resolve
    })
    const memoItemsGate = new Promise<PriceMemoItem[]>((resolve) => {
      releaseMemoItems = resolve
    })
    renderPage(true)
    await waitForInitialLoad()

    listFolders.mockResolvedValue([folderA, folderC])
    listMemoItems.mockResolvedValue([memoItem('folder-a', 0), memoItem('folder-c', 1)])
    listRecordsForFolders.mockResolvedValue([recordRow('folder-a', 'rec-a')])
    listFolders.mockImplementationOnce(() => foldersGate)
    listMemoItems.mockImplementationOnce(() => memoItemsGate)

    act(() => {
      publishFolderDeleted({ folderId: 'folder-b', userId: 'user-a' })
    })
    await waitFor(() => expect(listFolders).toHaveBeenCalledTimes(2))

    await act(async () => {
      screen.getByRole('button', { name: /メモを追加/ }).click()
    })
    fireEvent.change(screen.getByPlaceholderText(/品目名/), {
      target: { value: 'C' },
    })
    fireEvent.click(screen.getByRole('button', { name: /C.*メモに追加/ }))

    await waitFor(() => {
      expect(addMemoItem).toHaveBeenCalledWith('folder-c')
      expect(screen.getByTestId('memo-card-folder-c')).toBeTruthy()
    })

    await act(async () => {
      releaseFolders([folderA, folderC])
      releaseMemoItems([memoItem('folder-a', 0)])
      await Promise.resolve()
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(listFolders).toHaveBeenCalledTimes(3)
      expect(listRecordsForFolders).toHaveBeenCalledTimes(3)
    })
    expect(screen.getByTestId('memo-card-folder-c')).toBeTruthy()
    expect(screen.queryByTestId('memo-card-folder-b')).toBeNull()
  })

  it('keeps an unrelated memo removal after invalidating a stale delete refresh', async () => {
    let releaseFolders: (folders: PriceFolder[]) => void = () => {}
    let releaseMemoItems: (items: PriceMemoItem[]) => void = () => {}
    const foldersGate = new Promise<PriceFolder[]>((resolve) => {
      releaseFolders = resolve
    })
    const memoItemsGate = new Promise<PriceMemoItem[]>((resolve) => {
      releaseMemoItems = resolve
    })
    listMemoItems.mockResolvedValue([
      memoItem('folder-a', 0),
      memoItem('folder-b', 1),
      memoItem('folder-c', 2),
    ])
    listRecordsForFolders.mockResolvedValue([
      recordRow('folder-a', 'rec-a'),
      recordRow('folder-b', 'rec-b'),
      recordRow('folder-c', 'rec-c'),
    ])
    renderPage(true)
    await waitForInitialLoad()

    listFolders.mockResolvedValue([folderA, folderC])
    listMemoItems.mockResolvedValue([memoItem('folder-c', 0)])
    listRecordsForFolders.mockResolvedValue([recordRow('folder-c', 'rec-c')])
    listFolders.mockImplementationOnce(() => foldersGate)
    listMemoItems.mockImplementationOnce(() => memoItemsGate)

    act(() => {
      publishFolderDeleted({ folderId: 'folder-b', userId: 'user-a' })
    })
    await waitFor(() => expect(listFolders).toHaveBeenCalledTimes(2))
    expect(screen.queryByTestId('memo-card-folder-b')).toBeNull()

    fireEvent.click(screen.getByTestId('remove-folder-a'))

    await waitFor(() => {
      expect(removeMemoItem).toHaveBeenCalledWith('folder-a')
      expect(screen.queryByTestId('memo-card-folder-a')).toBeNull()
      expect(screen.getByTestId('memo-card-folder-c')).toBeTruthy()
    })

    await act(async () => {
      releaseFolders([folderA, folderC])
      releaseMemoItems([memoItem('folder-a', 0), memoItem('folder-c', 1)])
      await Promise.resolve()
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(listFolders).toHaveBeenCalledTimes(3)
      expect(listRecordsForFolders).toHaveBeenCalledTimes(3)
    })
    expect(screen.queryByTestId('memo-card-folder-a')).toBeNull()
    expect(screen.getByTestId('memo-card-folder-c')).toBeTruthy()
    expect(screen.queryByTestId('memo-card-folder-b')).toBeNull()
  })

  it('ignores folder delete notifications for another user', async () => {
    renderPage(true)
    await waitForInitialLoad()

    act(() => {
      publishFolderDeleted({ folderId: 'folder-b', userId: 'user-other' })
    })

    expect(screen.getByTestId('memo-card-folder-b')).toBeTruthy()
  })

  it('keeps unrelated cards interactive and preserves expansion during folder delete sync', async () => {
    listMemoItems.mockResolvedValue([
      memoItem('folder-a', 0),
      memoItem('folder-b', 1),
      memoItem('folder-c', 2),
    ])
    renderPage(true)
    await waitForInitialLoad()

    fireEvent.click(screen.getByRole('button', { name: 'expand-folder-a' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'draft-folder-a' }), {
      target: { value: '未保存の入力' },
    })

    listFolders.mockResolvedValue([folderA, folderC])
    listMemoItems.mockResolvedValue([memoItem('folder-a', 0), memoItem('folder-c', 2)])
    listRecordsForFolders.mockResolvedValue([
      recordRow('folder-a', 'rec-a'),
      recordRow('folder-c', 'rec-c'),
    ])

    await act(async () => {
      screen.getByRole('button', { name: /メモを追加/ }).click()
    })

    act(() => {
      publishFolderDeleted({ folderId: 'folder-b', userId: 'user-a' })
    })

    listFolders.mockResolvedValue([folderA, folderC])
    listMemoItems.mockResolvedValue([memoItem('folder-a', 0)])
    listRecordsForFolders.mockResolvedValue([recordRow('folder-a', 'rec-a')])

    await waitFor(() => {
      expect(screen.queryByTestId('memo-card-folder-b')).toBeNull()
      expect(screen.getByTestId('memo-card-folder-a')).toBeTruthy()
    })

    expect(screen.getByRole('textbox', { name: 'draft-folder-a' })).toHaveProperty(
      'value',
      '未保存の入力',
    )
    expect(screen.getByTestId('memo-card-folder-a').getAttribute('data-expanded')).toBe('true')

    const list = screen.getByTestId('memo-card-folder-a').closest('ul')
    expect(list?.className.includes('pointer-events-none')).toBe(false)
    expect(
      Array.from(list?.children ?? []).map((row) => row.getAttribute('data-testid')),
    ).toEqual(['memo-card-folder-a', 'memo-card-folder-c'])
    expect(screen.getByRole('button', { name: /メモを追加/ }).hasAttribute('disabled')).toBe(
      false,
    )
    expect(screen.getByPlaceholderText(/品目名/).hasAttribute('disabled')).toBe(false)
  })

  it('does not remove a memo card without a folder delete notification', async () => {
    renderPage(true)
    await waitForInitialLoad()
    expect(screen.getByTestId('memo-card-folder-b')).toBeTruthy()
  })

  it('does not resurrect a deleted folder from a stale load started before delete', async () => {
    let releaseReload: () => void = () => {}
    const reloadGate = new Promise<void>((resolve) => {
      releaseReload = () => resolve()
    })

    const view = renderPage(true)
    await waitForInitialLoad()

    view.rerender(
      <AuthProvider>
        <ShoppingMemoPage active={false} />
      </AuthProvider>,
    )

    bumpFoldersRevision()
    listFolders.mockImplementationOnce(() => reloadGate.then(() => [folderA, folderB, folderC]))
    listMemoItems.mockImplementationOnce(() =>
      reloadGate.then(() => [memoItem('folder-a', 0), memoItem('folder-b', 1)]),
    )
    listRecordsForFolders.mockImplementationOnce(() =>
      reloadGate.then(() => [recordRow('folder-a', 'rec-a'), recordRow('folder-b', 'rec-b')]),
    )

    await act(async () => {
      view.rerender(
        <AuthProvider>
          <ShoppingMemoPage active={true} />
        </AuthProvider>,
      )
    })

    listFolders.mockResolvedValueOnce([folderA, folderC])
    listMemoItems.mockResolvedValueOnce([memoItem('folder-a', 0)])
    listRecordsForFolders.mockResolvedValueOnce([recordRow('folder-a', 'rec-a')])

    act(() => {
      publishFolderDeleted({ folderId: 'folder-b', userId: 'user-a' })
    })

    expect(screen.queryByTestId('memo-card-folder-b')).toBeNull()

    await act(async () => {
      releaseReload()
      await reloadGate
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(screen.getByTestId('memo-card-folder-a')).toBeTruthy()
    })
    expect(screen.queryByTestId('memo-card-folder-b')).toBeNull()
  })

  it('stays interactive after post-delete revalidation fails and keeps the folder removed', async () => {
    const view = renderPage(true)
    await waitForInitialLoad()

    listFolders.mockRejectedValueOnce(new Error('network down'))
    act(() => {
      publishFolderDeleted({ folderId: 'folder-b', userId: 'user-a' })
    })

    await waitFor(() => {
      expect(screen.queryByTestId('memo-card-folder-b')).toBeNull()
      expect(
        screen.getByText('通信に失敗しました。接続を確認してからもう一度お試しください。'),
      ).toBeTruthy()
    })

    const list = screen.getByTestId('memo-card-folder-a').closest('ul')
    expect(list?.className.includes('pointer-events-none')).toBe(false)
    expect(screen.getByRole('button', { name: /メモを追加/ }).hasAttribute('disabled')).toBe(
      false,
    )

    listFolders.mockResolvedValue([folderA, folderC])
    listMemoItems.mockResolvedValue([memoItem('folder-a', 0)])
    listRecordsForFolders.mockResolvedValue([recordRow('folder-a', 'rec-a')])
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
      expect(listFolders).toHaveBeenCalledTimes(3)
      expect(listRecordsForFolders).toHaveBeenCalledTimes(2)
      expect(screen.queryByTestId('memo-card-folder-b')).toBeNull()
      expect(
        screen.queryByText('通信に失敗しました。接続を確認してからもう一度お試しください。'),
      ).toBeNull()
    })

    listFolders.mockResolvedValueOnce([folderA, folderB, folderC])
    listMemoItems.mockResolvedValueOnce([
      memoItem('folder-a', 0),
      memoItem('folder-b', 1),
    ])
    listRecordsForFolders.mockResolvedValueOnce([
      recordRow('folder-a', 'rec-a'),
      recordRow('folder-b', 'rec-b'),
    ])
    view.rerender(
      <AuthProvider>
        <ShoppingMemoPage active={false} />
      </AuthProvider>,
    )
    act(() => bumpFoldersRevision())
    view.rerender(
      <AuthProvider>
        <ShoppingMemoPage active={true} />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(listFolders).toHaveBeenCalledTimes(4)
      expect(screen.getByTestId('memo-card-folder-b')).toBeTruthy()
    })
  })

  it('retries once when a deleted folder is returned, then releases its tombstone after confirmation', async () => {
    const view = renderPage(true)
    await waitForInitialLoad()

    listFolders
      .mockResolvedValueOnce([folderA, folderB, folderC])
      .mockResolvedValueOnce([folderA, folderC])
    listMemoItems
      .mockResolvedValueOnce([memoItem('folder-a', 0), memoItem('folder-b', 1)])
      .mockResolvedValueOnce([memoItem('folder-a', 0)])
    listRecordsForFolders
      .mockResolvedValueOnce([recordRow('folder-a', 'rec-a'), recordRow('folder-b', 'rec-b')])
      .mockResolvedValueOnce([recordRow('folder-a', 'rec-a')])

    act(() => {
      publishFolderDeleted({ folderId: 'folder-b', userId: 'user-a' })
    })

    await waitFor(() => {
      expect(screen.queryByTestId('memo-card-folder-b')).toBeNull()
      expect(listFolders).toHaveBeenCalledTimes(3)
    })
    expect(screen.queryByText(/削除したフォルダがサーバーに残っています/)).toBeNull()

    listFolders.mockResolvedValueOnce([folderA, folderB, folderC])
    listMemoItems.mockResolvedValueOnce([
      memoItem('folder-a', 0),
      memoItem('folder-b', 1),
    ])
    listRecordsForFolders.mockResolvedValueOnce([
      recordRow('folder-a', 'rec-a'),
      recordRow('folder-b', 'rec-b'),
    ])

    view.rerender(
      <AuthProvider>
        <ShoppingMemoPage active={false} />
      </AuthProvider>,
    )
    act(() => bumpFoldersRevision())
    view.rerender(
      <AuthProvider>
        <ShoppingMemoPage active={true} />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(listFolders).toHaveBeenCalledTimes(4)
      expect(screen.getByTestId('memo-card-folder-b')).toBeTruthy()
    })
  })

  it('surfaces a persistent server-side deletion mismatch after one retry', async () => {
    renderPage(true)
    await waitForInitialLoad()

    listFolders.mockResolvedValue([folderA, folderB, folderC])
    listMemoItems.mockResolvedValue([
      memoItem('folder-a', 0),
      memoItem('folder-b', 1),
    ])
    listRecordsForFolders.mockResolvedValue([
      recordRow('folder-a', 'rec-a'),
      recordRow('folder-b', 'rec-b'),
    ])

    act(() => {
      publishFolderDeleted({ folderId: 'folder-b', userId: 'user-a' })
    })

    await waitFor(() => {
      expect(listFolders).toHaveBeenCalledTimes(3)
      expect(screen.getByTestId('memo-card-folder-b')).toBeTruthy()
      expect(
        screen.getByText(
          '削除したフォルダがサーバーに残っています。状態を確認して再読み込みしてください。',
        ),
      ).toBeTruthy()
    })
  })

  it('preserves a successful reorder made while delete revalidation is in flight', async () => {
    let releaseFolders: (folders: PriceFolder[]) => void = () => {}
    let releaseMemoItems: (items: PriceMemoItem[]) => void = () => {}
    let releaseRecords: (rows: PriceRecord[]) => void = () => {}
    listMemoItems.mockResolvedValue([
      memoItem('folder-a', 0),
      memoItem('folder-b', 1),
      memoItem('folder-c', 2),
    ])
    listRecordsForFolders.mockResolvedValue([
      recordRow('folder-a', 'rec-a'),
      recordRow('folder-b', 'rec-b'),
      recordRow('folder-c', 'rec-c'),
    ])
    renderPage(true)
    await waitForInitialLoad()

    listFolders.mockImplementationOnce(
      () => new Promise((resolve) => (releaseFolders = resolve)),
    )
    listMemoItems.mockImplementationOnce(
      () => new Promise((resolve) => (releaseMemoItems = resolve)),
    )
    listRecordsForFolders.mockImplementationOnce(
      () => new Promise((resolve) => (releaseRecords = resolve)),
    )

    act(() => {
      publishFolderDeleted({ folderId: 'folder-b', userId: 'user-a' })
    })
    expect(screen.queryByTestId('memo-card-folder-b')).toBeNull()

    reorderMemoItems.mockResolvedValueOnce(undefined)
    let reorderPromise: Promise<void> | undefined
    act(() => {
      reorderPromise = memoDragEnd?.({
        action: 'reorder',
        payload: { kind: 'memo-folder', id: 'folder-c' },
        beforeId: 'folder-a',
      })
    })
    await act(async () => {
      await reorderPromise
    })

    expect(
      Array.from(screen.getByTestId('memo-card-folder-a').closest('ul')?.children ?? []).map(
        (row) => row.getAttribute('data-testid'),
      ),
    ).toEqual(['memo-card-folder-c', 'memo-card-folder-a'])

    await act(async () => {
      releaseFolders([folderA, folderC])
      releaseMemoItems([memoItem('folder-a', 0), memoItem('folder-c', 1)])
      releaseRecords([recordRow('folder-a', 'rec-a'), recordRow('folder-c', 'rec-c')])
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(
      Array.from(screen.getByTestId('memo-card-folder-a').closest('ul')?.children ?? []).map(
        (row) => row.getAttribute('data-testid'),
      ),
    ).toEqual(['memo-card-folder-c', 'memo-card-folder-a'])
    expect(screen.queryByTestId('memo-card-folder-b')).toBeNull()
  })

  it('resynchronizes to server order when a reorder fails during delete revalidation', async () => {
    let releaseFolders: (folders: PriceFolder[]) => void = () => {}
    let releaseMemoItems: (items: PriceMemoItem[]) => void = () => {}
    let releaseRecords: (rows: PriceRecord[]) => void = () => {}
    listMemoItems.mockResolvedValue([
      memoItem('folder-a', 0),
      memoItem('folder-b', 1),
      memoItem('folder-c', 2),
    ])
    listRecordsForFolders.mockResolvedValue([
      recordRow('folder-a', 'rec-a'),
      recordRow('folder-b', 'rec-b'),
      recordRow('folder-c', 'rec-c'),
    ])
    renderPage(true)
    await waitForInitialLoad()

    listFolders.mockImplementationOnce(
      () => new Promise((resolve) => (releaseFolders = resolve)),
    )
    listMemoItems.mockImplementationOnce(
      () => new Promise((resolve) => (releaseMemoItems = resolve)),
    )
    listRecordsForFolders.mockImplementationOnce(
      () => new Promise((resolve) => (releaseRecords = resolve)),
    )

    act(() => {
      publishFolderDeleted({ folderId: 'folder-b', userId: 'user-a' })
    })
    await waitFor(() => {
      expect(listFolders).toHaveBeenCalledTimes(2)
    })
    listFolders.mockResolvedValue([folderA, folderC])
    listMemoItems.mockResolvedValue([memoItem('folder-a', 0), memoItem('folder-c', 1)])
    listRecordsForFolders.mockResolvedValue([
      recordRow('folder-a', 'rec-a'),
      recordRow('folder-c', 'rec-c'),
    ])
    reorderMemoItems.mockRejectedValueOnce(new Error('save failed'))

    let reorderPromise: void | Promise<void>
    act(() => {
      reorderPromise = memoDragEnd?.({
        action: 'reorder',
        payload: { kind: 'memo-folder', id: 'folder-c' },
        beforeId: 'folder-a',
      })
    })
    await act(async () => {
      releaseFolders([folderA, folderC])
      releaseMemoItems([memoItem('folder-a', 0), memoItem('folder-c', 1)])
      releaseRecords([recordRow('folder-a', 'rec-a'), recordRow('folder-c', 'rec-c')])
      await reorderPromise
    })
    expect(reorderMemoItems).toHaveBeenCalledTimes(1)

    await waitFor(() => {
      expect(
        Array.from(screen.getByTestId('memo-card-folder-a').closest('ul')?.children ?? []).map(
          (row) => row.getAttribute('data-testid'),
        ),
      ).toEqual(['memo-card-folder-a', 'memo-card-folder-c'])
    })

    expect(screen.queryByTestId('memo-card-folder-b')).toBeNull()
    expect(
      Array.from(screen.getByTestId('memo-card-folder-a').closest('ul')?.children ?? []).map(
        (row) => row.getAttribute('data-testid'),
      ),
    ).toEqual(['memo-card-folder-a', 'memo-card-folder-c'])
  })

  it('does not apply a stale catalog load after auth user changes', async () => {
    let releaseLoad: () => void = () => {}
    const loadGate = new Promise<void>((resolve) => {
      releaseLoad = () => resolve()
    })

    const view = renderPage(true)
    await waitForInitialLoad()

    view.rerender(
      <AuthProvider>
        <ShoppingMemoPage active={false} />
      </AuthProvider>,
    )

    bumpFoldersRevision()
    listFolders.mockImplementationOnce(() => loadGate.then(() => [folderA, folderB, folderC]))
    listMemoItems.mockImplementationOnce(() =>
      loadGate.then(() => [memoItem('folder-a', 0), memoItem('folder-b', 1)]),
    )
    listRecordsForFolders.mockImplementationOnce(() =>
      loadGate.then(() => [recordRow('folder-a', 'rec-a'), recordRow('folder-b', 'rec-b')]),
    )

    await act(async () => {
      view.rerender(
        <AuthProvider>
          <ShoppingMemoPage active={true} />
        </AuthProvider>,
      )
    })

    listFolders.mockResolvedValue([folderC])
    listMemoItems.mockResolvedValue([memoItem('folder-c', 0)])
    listRecordsForFolders.mockResolvedValue([recordRow('folder-c', 'rec-c')])

    await act(async () => {
      authStateCallback?.('SIGNED_IN', {
        user: { id: 'user-b' },
        access_token: 'token-b',
        refresh_token: 'refresh',
      })
      releaseLoad()
      await loadGate
      await Promise.resolve()
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(screen.getByTestId('memo-card-folder-c')).toBeTruthy()
    })
    expect(screen.queryByTestId('memo-card-folder-b')).toBeNull()
  })

  it('ignores reorder RPC completion after folder delete invalidates the reorder generation', async () => {
    let releaseReorder: () => void = () => {}
    const reorderGate = new Promise<void>((resolve) => {
      releaseReorder = () => resolve()
    })

    renderPage(true)
    await waitForInitialLoad()

    reorderMemoItems.mockImplementationOnce(async () => {
      listFolders.mockResolvedValue([folderB, folderC])
      listMemoItems.mockResolvedValue([memoItem('folder-b', 0)])
      listRecordsForFolders.mockResolvedValue([recordRow('folder-b', 'rec-b')])
      publishFolderDeleted({ folderId: 'folder-a', userId: 'user-a' })
      await reorderGate
    })

    await act(async () => {
      memoDragEnd?.({
        action: 'reorder',
        payload: { kind: 'memo-folder', id: 'folder-b' },
        beforeId: 'folder-a',
      })
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(screen.queryByTestId('memo-card-folder-a')).toBeNull()
    })
    expect(screen.getByTestId('memo-card-folder-b')).toBeTruthy()

    await act(async () => {
      releaseReorder()
      await reorderGate
      await Promise.resolve()
    })

    expect(screen.queryByTestId('memo-card-folder-a')).toBeNull()
    expect(screen.getByTestId('memo-card-folder-b')).toBeTruthy()
  })

  it('does not drop a locally saved record when a stale full load completes', async () => {
    let releaseLoad: () => void = () => {}
    const loadGate = new Promise<void>((resolve) => {
      releaseLoad = () => resolve()
    })

    const view = renderPage(true)
    await waitForInitialLoad()

    view.rerender(
      <AuthProvider>
        <ShoppingMemoPage active={false} />
      </AuthProvider>,
    )

    listFolders.mockImplementationOnce(() => loadGate.then(() => [folderA, folderB]))
    listMemoItems.mockImplementationOnce(() =>
      loadGate.then(() => [memoItem('folder-a', 0), memoItem('folder-b', 1)]),
    )
    listRecordsForFolders.mockImplementationOnce(() =>
      loadGate.then(() => [recordRow('folder-a', 'rec-a')]),
    )

    act(() => {
      bumpFoldersRevision()
    })

    view.rerender(
      <AuthProvider>
        <ShoppingMemoPage active={true} />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(listFolders).toHaveBeenCalledTimes(2)
    })

    fireEvent.click(screen.getByTestId('save-folder-a'))

    await waitFor(() => {
      expect(screen.getByTestId('memo-card-folder-a').getAttribute('data-record-count')).toBe(
        '2',
      )
    })

    await act(async () => {
      releaseLoad()
      await loadGate
      await Promise.resolve()
    })

    expect(screen.getByTestId('memo-card-folder-a').getAttribute('data-record-count')).toBe(
      '2',
    )
  })

  it('does not revert optimistic reorder when a full load started during reorder completes', async () => {
    let releaseLoad: () => void = () => {}
    const loadGate = new Promise<void>((resolve) => {
      releaseLoad = () => resolve()
    })
    let resolveReorder: () => void = () => {}

    listMemoItems.mockResolvedValue([memoItem('folder-a', 0), memoItem('folder-b', 1)])
    const view = renderPage(true)
    await waitForInitialLoad()

    reorderMemoItems.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveReorder = resolve
        }),
    )

    await act(async () => {
      memoDragEnd?.({
        action: 'reorder',
        payload: { kind: 'memo-folder', id: 'folder-b' },
        beforeId: 'folder-a',
      })
    })

    expect(
      Array.from(screen.getByTestId('memo-card-folder-a').closest('ul')?.children ?? []).map(
        (row) => row.getAttribute('data-testid'),
      ),
    ).toEqual(['memo-card-folder-b', 'memo-card-folder-a'])

    view.rerender(
      <AuthProvider>
        <ShoppingMemoPage active={false} />
      </AuthProvider>,
    )
    listFolders.mockImplementationOnce(() => loadGate.then(() => [folderA, folderB]))
    listMemoItems.mockImplementationOnce(() =>
      loadGate.then(() => [memoItem('folder-a', 0), memoItem('folder-b', 1)]),
    )
    listRecordsForFolders.mockImplementationOnce(() => loadGate.then(() => []))
    bumpFoldersRevision()
    view.rerender(
      <AuthProvider>
        <ShoppingMemoPage active={true} />
      </AuthProvider>,
    )

    await waitFor(() => expect(listFolders).toHaveBeenCalledTimes(2))

    await act(async () => {
      resolveReorder()
      await Promise.resolve()
    })

    await act(async () => {
      releaseLoad()
      await loadGate
      await Promise.resolve()
    })

    expect(
      Array.from(screen.getByTestId('memo-card-folder-a').closest('ul')?.children ?? []).map(
        (row) => row.getAttribute('data-testid'),
      ),
    ).toEqual(['memo-card-folder-b', 'memo-card-folder-a'])
  })
})
