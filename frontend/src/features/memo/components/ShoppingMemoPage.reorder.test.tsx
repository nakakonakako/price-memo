// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { flushSync } from 'react-dom'
import { applyAuthIdentity, resetAuthIdentityForTests } from '@/lib/authIdentity'
import { AuthProvider } from '@/contexts/AuthContext'

const listFolders = vi.fn()
const listMemoItems = vi.fn()
const listRecordsForFolders = vi.fn()
const reorderMemoItems = vi.fn()
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
    removeMemoItem: vi.fn(),
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
    onDragEnd: (result: {
      action: 'reorder'
      payload: { kind: 'memo-folder'; id: string }
      beforeId: string | null
    }) => void
  }) => (
    <div>
      <button
        type="button"
        data-testid="trigger-reorder"
        onClick={() =>
          onDragEnd({
            action: 'reorder',
            payload: { kind: 'memo-folder', id: 'folder-b' },
            beforeId: 'folder-a',
          })
        }
      >
        reorder
      </button>
      {children}
    </div>
  ),
  MemoTrashZone: () => null,
}))

vi.mock('./FolderMemoCard', () => ({
  FolderMemoCard: ({ folderId }: { folderId: string }) => (
    <li data-testid={`memo-card-${folderId}`}>{folderId}</li>
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

describe('ShoppingMemoPage reorder', () => {
  let authCallback: ((event: string, session: unknown) => void) | null = null

  beforeEach(() => {
    resetAuthIdentityForTests()
    listFolders.mockReset()
    listMemoItems.mockReset()
    listRecordsForFolders.mockReset()
    reorderMemoItems.mockReset()
    getSession.mockReset()
    onAuthStateChange.mockReset()
    authCallback = null

    onAuthStateChange.mockImplementation((cb) => {
      authCallback = cb
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

  it('passes pre-drag and desired folder ids to reorderMemoItems', async () => {
    listMemoItems.mockResolvedValue([memoItem('folder-a', 0), memoItem('folder-b', 1)])
    reorderMemoItems.mockResolvedValue(undefined)

    renderPage()

    await waitFor(() => {
      expect(screen.getByTestId('memo-card-folder-a')).toBeTruthy()
    })

    await act(async () => {
      screen.getByTestId('trigger-reorder').click()
    })

    await waitFor(() => {
      expect(reorderMemoItems).toHaveBeenCalledWith(
        ['folder-a', 'folder-b'],
        ['folder-b', 'folder-a'],
      )
    })
  })

  it('keeps PM001 error visible after re-fetch', async () => {
    listMemoItems
      .mockResolvedValueOnce([memoItem('folder-a', 0), memoItem('folder-b', 1)])
      .mockResolvedValueOnce([memoItem('folder-a', 0), memoItem('folder-b', 1)])
    reorderMemoItems.mockRejectedValue({ code: 'PM001', message: 'stale' })

    renderPage()

    await waitFor(() => {
      expect(screen.getByTestId('memo-card-folder-a')).toBeTruthy()
    })

    await act(async () => {
      screen.getByTestId('trigger-reorder').click()
    })

    await waitFor(() => {
      expect(
        screen.getByText(
          'メモの一覧が変更されました。もう一度並べ替えてください。',
        ),
      ).toBeTruthy()
      expect(listMemoItems).toHaveBeenCalledTimes(2)
    })
  })

  it('re-fetches after a non-PM001 failure and leaves the error visible', async () => {
    listMemoItems
      .mockResolvedValueOnce([memoItem('folder-a', 0), memoItem('folder-b', 1)])
      .mockResolvedValueOnce([memoItem('folder-a', 0), memoItem('folder-b', 1)])
    reorderMemoItems.mockRejectedValue({ code: '08006', message: 'connection lost' })

    renderPage()

    await waitFor(() => {
      expect(screen.getByTestId('memo-card-folder-a')).toBeTruthy()
    })

    await act(async () => {
      screen.getByTestId('trigger-reorder').click()
    })

    await waitFor(() => {
      expect(screen.getByText('並べ替えの保存に失敗しました。')).toBeTruthy()
      expect(listMemoItems).toHaveBeenCalledTimes(2)
    })
  })

  it('does not submit overlapping reorder operations', async () => {
    let resolveReorder: () => void = () => {}
    listMemoItems.mockResolvedValue([memoItem('folder-a', 0), memoItem('folder-b', 1)])
    reorderMemoItems.mockImplementation(
      () => new Promise<void>((resolve) => { resolveReorder = resolve }),
    )

    renderPage()

    await waitFor(() => {
      expect(screen.getByTestId('memo-card-folder-a')).toBeTruthy()
    })

    await act(async () => {
      screen.getByTestId('trigger-reorder').click()
      screen.getByTestId('trigger-reorder').click()
    })

    expect(reorderMemoItems).toHaveBeenCalledTimes(1)
    await act(async () => resolveReorder())
  })

  it('ignores stale reorder completion after account switch', async () => {
    let resolveReorder: () => void = () => {}
    listMemoItems.mockResolvedValue([memoItem('folder-a', 0), memoItem('folder-b', 1)])
    reorderMemoItems.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveReorder = resolve
        }),
    )

    renderPage()

    await waitFor(() => {
      expect(screen.getByTestId('memo-card-folder-a')).toBeTruthy()
    })

    await act(async () => {
      screen.getByTestId('trigger-reorder').click()
    })

    listMemoItems.mockResolvedValue([])
    await act(async () => {
      authCallback?.('SIGNED_IN', {
        user: { id: 'user-b' },
        access_token: 'token-b',
        refresh_token: 'refresh',
      })
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
    })

    await act(async () => {
      resolveReorder()
    })

    await waitFor(() => {
      expect(screen.queryByTestId('memo-card-folder-a')).toBeNull()
    })
  })

  it('does not apply a stale logout clear after a new session is installed', async () => {
    const folderC = {
      id: 'folder-c',
      user_id: 'user-b',
      name: 'C',
      created_at: '2026-01-01T00:00:00Z',
    }
    const memoC = {
      id: 'memo-folder-c',
      user_id: 'user-b',
      folder_id: 'folder-c',
      sort_order: 0,
      created_at: '2026-01-01T00:00:00Z',
      folder: folderC,
    }

    let releaseUserBLoad: () => void = () => {}
    const userBLoadGate = new Promise<void>((resolve) => {
      releaseUserBLoad = () => resolve()
    })

    listMemoItems
      .mockResolvedValueOnce([memoItem('folder-a', 0), memoItem('folder-b', 1)])
      .mockImplementationOnce(() => userBLoadGate.then(() => [memoC]))
    listFolders
      .mockResolvedValueOnce([folderA, folderB])
      .mockImplementationOnce(() => userBLoadGate.then(() => [folderC]))

    renderPage()

    await waitFor(() => {
      expect(screen.getByTestId('memo-card-folder-a')).toBeTruthy()
    })

    const deferredLogoutClears: Array<() => void> = []
    const nativePromiseResolve = Promise.resolve.bind(Promise)
    const resolveSpy = vi.spyOn(Promise, 'resolve').mockImplementation((value) => {
      const base = nativePromiseResolve(value)
      return {
        then(
          onFulfilled?: ((v: unknown) => unknown) | null,
          onRejected?: ((reason: unknown) => unknown) | null,
        ) {
          if (typeof onFulfilled === 'function') {
            const source = onFulfilled.toString()
            if (
              source.includes('setAllFolders') &&
              source.includes('setMemoItems')
            ) {
              deferredLogoutClears.push(() => {
                void base.then(onFulfilled as (v: unknown) => unknown)
              })
              return nativePromiseResolve(undefined)
            }
          }
          return base.then(onFulfilled, onRejected)
        },
        catch(onRejected?: ((reason: unknown) => unknown) | null) {
          return base.catch(onRejected)
        },
        finally(onFinally?: (() => void) | null) {
          return base.finally(onFinally ?? undefined)
        },
      } as Promise<unknown>
    })

    flushSync(() => {
      authCallback?.('SIGNED_OUT', null)
    })

    flushSync(() => {
      authCallback?.('SIGNED_IN', {
        user: { id: 'user-b' },
        access_token: 'token-b',
        refresh_token: 'refresh',
      })
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
    })

    releaseUserBLoad()

    await waitFor(() => {
      expect(screen.getByTestId('memo-card-folder-c')).toBeTruthy()
    })

    expect(deferredLogoutClears.length).toBeGreaterThanOrEqual(1)
    await act(async () => {
      deferredLogoutClears[deferredLogoutClears.length - 1]()
      await Promise.resolve()
    })

    expect(screen.getByTestId('memo-card-folder-c')).toBeTruthy()
    expect(screen.queryByTestId('memo-card-folder-a')).toBeNull()

    resolveSpy.mockRestore()
  })
})
