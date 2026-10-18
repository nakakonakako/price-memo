// @vitest-environment jsdom
import { useState, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { applyAuthIdentity, resetAuthIdentityForTests } from '@/lib/authIdentity'
import { resetCatalogSync } from '@/lib/catalogSync'
import {
  installResumeSyncListeners,
  resetResumeSyncForTests,
  triggerResumeSyncForTests,
} from '@/lib/resumeSync'
import { AuthProvider } from '@/contexts/AuthContext'
import type { PriceRecord } from '@/features/records/types'

const listFolders = vi.fn()
const listMemoItems = vi.fn()
const listRecordsForFolders = vi.fn()
const getSession = vi.fn()
const onAuthStateChange = vi.fn()
let authStateCallback: ((event: string, session: unknown) => void) | null = null

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
    listMemoItems: () => listMemoItems(),
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
  FolderMemoCard: ({ folderId }: { folderId: string }) => {
    const [expanded, setExpanded] = useState(false)
    const [draft, setDraft] = useState('')
    return (
      <li data-testid={`memo-card-${folderId}`} data-expanded={expanded ? 'true' : 'false'}>
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

function memoItem(folderId: string, sortOrder: number) {
  const folder = folderId === 'folder-a' ? folderA : folderB
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

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  })
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

describe('ShoppingMemoPage resume sync', () => {
  let teardownResume: () => void

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    resetAuthIdentityForTests()
    resetCatalogSync()
    resetResumeSyncForTests()
    teardownResume = installResumeSyncListeners()
    setVisibility('visible')

    listFolders.mockReset()
    listMemoItems.mockReset()
    listRecordsForFolders.mockReset()
    getSession.mockReset()
    onAuthStateChange.mockReset()

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

    listFolders.mockResolvedValue([folderA, folderB])
    listMemoItems.mockResolvedValue([memoItem('folder-a', 0), memoItem('folder-b', 1)])
    listRecordsForFolders.mockResolvedValue([
      recordRow('folder-a', 'rec-a'),
      recordRow('folder-b', 'rec-b'),
    ])
  })

  afterEach(() => {
    teardownResume()
    cleanup()
    resetAuthIdentityForTests()
    resetCatalogSync()
    resetResumeSyncForTests()
    vi.useRealTimers()
  })

  it('refetches on visibility, focus, and pageshow resume signals', async () => {
    renderPage(true)
    await waitForInitialLoad()
    expect(listMemoItems).toHaveBeenCalledTimes(1)

    listMemoItems.mockResolvedValue([memoItem('folder-a', 0)])

    setVisibility('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    setVisibility('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    await act(async () => {
      vi.runAllTimers()
      await Promise.resolve()
    })

    await waitFor(() => expect(listMemoItems).toHaveBeenCalledTimes(2))
    expect(screen.queryByTestId('memo-card-folder-b')).toBeNull()

    listMemoItems.mockResolvedValue([memoItem('folder-a', 0), memoItem('folder-b', 1)])
    window.dispatchEvent(new Event('focus'))
    await act(async () => {
      vi.runAllTimers()
      await Promise.resolve()
    })
    await waitFor(() => expect(listMemoItems).toHaveBeenCalledTimes(3))

    listMemoItems.mockResolvedValue([memoItem('folder-a', 0)])
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
    await act(async () => {
      vi.runAllTimers()
      await Promise.resolve()
    })
    await waitFor(() => expect(listMemoItems).toHaveBeenCalledTimes(4))
  })

  it('dedupes simultaneous resume events and retries after an in-flight refresh', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = () => resolve()
    })

    renderPage(true)
    await waitForInitialLoad()

    listMemoItems.mockImplementationOnce(() => gate.then(() => [memoItem('folder-a', 0)]))

    act(() => {
      triggerResumeSyncForTests()
      triggerResumeSyncForTests()
      window.dispatchEvent(new Event('focus'))
      vi.runAllTimers()
    })

    await waitFor(() => expect(listMemoItems).toHaveBeenCalledTimes(2))

    listMemoItems.mockResolvedValue([memoItem('folder-a', 0)])
    act(() => {
      triggerResumeSyncForTests()
      vi.runAllTimers()
    })

    await act(async () => {
      release()
      await gate
      await Promise.resolve()
      await Promise.resolve()
    })

    await waitFor(() => expect(listMemoItems).toHaveBeenCalledTimes(3))
  })

  it('refreshes a hidden keep-alive tab when it becomes active after resume', async () => {
    const view = renderPage(true)
    await waitForInitialLoad()

    view.rerender(
      <AuthProvider>
        <ShoppingMemoPage active={false} />
      </AuthProvider>,
    )

    listMemoItems.mockResolvedValue([memoItem('folder-a', 0)])
    act(() => {
      triggerResumeSyncForTests()
      vi.runAllTimers()
    })
    expect(listMemoItems).toHaveBeenCalledTimes(1)

    view.rerender(
      <AuthProvider>
        <ShoppingMemoPage active={true} />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(listMemoItems).toHaveBeenCalledTimes(2)
      expect(screen.queryByTestId('memo-card-folder-b')).toBeNull()
    })
  })

  it('keeps another card draft and expansion after resume refetch', async () => {
    renderPage(true)
    await waitForInitialLoad()

    fireEvent.click(screen.getByRole('button', { name: 'expand-folder-a' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'draft-folder-a' }), {
      target: { value: '下書き' },
    })

    listMemoItems.mockResolvedValue([memoItem('folder-a', 0), memoItem('folder-b', 1)])
    act(() => {
      triggerResumeSyncForTests()
      vi.runAllTimers()
    })

    await waitFor(() => expect(listMemoItems).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('textbox', { name: 'draft-folder-a' })).toHaveProperty(
      'value',
      '下書き',
    )
    expect(screen.getByTestId('memo-card-folder-a').getAttribute('data-expanded')).toBe('true')
  })

  it('does not apply a stale resume response after a newer refresh', async () => {
    let releaseStale: () => void = () => {}
    const staleGate = new Promise<void>((resolve) => {
      releaseStale = () => resolve()
    })

    renderPage(true)
    await waitForInitialLoad()

    listMemoItems.mockImplementationOnce(() =>
      staleGate.then(() => [memoItem('folder-a', 0), memoItem('folder-b', 1)]),
    )
    act(() => {
      triggerResumeSyncForTests()
      vi.runAllTimers()
    })

    listMemoItems.mockResolvedValue([memoItem('folder-a', 0)])
    act(() => {
      triggerResumeSyncForTests()
      vi.runAllTimers()
    })

    await waitFor(() => expect(listMemoItems).toHaveBeenCalledTimes(2))

    await act(async () => {
      releaseStale()
      await staleGate
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.queryByTestId('memo-card-folder-b')).toBeNull()
  })

  it('does not apply resume results after auth user changes', async () => {
    let releaseLoad: () => void = () => {}
    const loadGate = new Promise<void>((resolve) => {
      releaseLoad = () => resolve()
    })

    renderPage(true)
    await waitForInitialLoad()

    listMemoItems.mockImplementationOnce(() =>
      loadGate.then(() => [memoItem('folder-a', 0), memoItem('folder-b', 1)]),
    )
    act(() => {
      triggerResumeSyncForTests()
      vi.runAllTimers()
    })

    listMemoItems.mockResolvedValue([memoItem('folder-c', 0)])
    listFolders.mockResolvedValue([
      {
        id: 'folder-c',
        user_id: 'user-b',
        name: 'C',
        created_at: '2026-01-01T00:00:00Z',
      },
    ])
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
    })

    await waitFor(() => {
      expect(screen.getByTestId('memo-card-folder-c')).toBeTruthy()
    })
    expect(screen.queryByTestId('memo-card-folder-b')).toBeNull()
  })

  it('clears loading when resume arrives during the initial fetch', async () => {
    let releaseInitial: () => void = () => {}
    const initialGate = new Promise<void>((resolve) => {
      releaseInitial = () => resolve()
    })

    listMemoItems.mockImplementation(() =>
      initialGate.then(() => [memoItem('folder-a', 0), memoItem('folder-b', 1)]),
    )

    renderPage(true)
    expect(screen.getByText('読み込み中...')).toBeTruthy()

    listMemoItems.mockResolvedValue([memoItem('folder-a', 0)])
    act(() => {
      triggerResumeSyncForTests()
      vi.runAllTimers()
    })

    await waitFor(() => {
      expect(screen.queryByText('読み込み中...')).toBeNull()
      expect(screen.getByTestId('memo-card-folder-a')).toBeTruthy()
    })
    await act(async () => {
      releaseInitial()
      await initialGate
    })
  })

  it('clears loading after a failed resume fetch that interrupted the initial load', async () => {
    let releaseInitial: () => void = () => {}
    const initialGate = new Promise<void>((resolve) => {
      releaseInitial = () => resolve()
    })

    listMemoItems.mockImplementation(() =>
      initialGate.then(() => [memoItem('folder-a', 0), memoItem('folder-b', 1)]),
    )

    renderPage(true)

    listMemoItems.mockRejectedValueOnce(new Error('network down'))
    act(() => {
      triggerResumeSyncForTests()
      vi.runAllTimers()
    })

    await waitFor(() => {
      expect(screen.queryByText('読み込み中...')).toBeNull()
    })
    await act(async () => {
      releaseInitial()
      await initialGate
    })
  })

  it('keeps existing data on resume fetch failure and retries on the next resume', async () => {
    renderPage(true)
    await waitForInitialLoad()

    listMemoItems.mockRejectedValueOnce(new Error('network down'))
    act(() => {
      triggerResumeSyncForTests()
      vi.runAllTimers()
    })

    await waitFor(() => {
      expect(
        screen.getByText('通信に失敗しました。接続を確認してからもう一度お試しください。'),
      ).toBeTruthy()
      expect(screen.getByTestId('memo-card-folder-b')).toBeTruthy()
    })

    listMemoItems.mockResolvedValue([memoItem('folder-a', 0)])
    act(() => {
      triggerResumeSyncForTests()
      vi.runAllTimers()
    })

    await waitFor(() => {
      expect(screen.queryByTestId('memo-card-folder-b')).toBeNull()
    })
  })
})
