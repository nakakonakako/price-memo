// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StrictMode, useEffect } from 'react'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { applyAuthIdentity, resetAuthIdentityForTests } from '@/lib/authIdentity'
import {
  installResumeSyncListeners,
  resetResumeSyncForTests,
} from '@/lib/resumeSync'
import { useFolders } from './useFolders'

const listFolders = vi.fn()

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
    },
  },
}))

vi.mock('@/features/folders/api/foldersApi', () => ({
  createFolder: vi.fn(),
  deleteFolder: vi.fn(),
  listFolders: () => listFolders(),
  renameFolder: vi.fn(),
  reorderFolders: vi.fn(),
}))

function Probe({
  apiRef,
}: {
  apiRef: { current: ReturnType<typeof useFolders> | null }
}) {
  const api = useFolders()
  useEffect(() => {
    apiRef.current = api
  }, [api, apiRef])
  return (
    <>
      <p data-testid="loading">{api.isLoading ? 'loading' : 'ready'}</p>
      <p data-testid="folders">{api.folders.map((folder) => folder.id).join(',')}</p>
      {api.error && <p data-testid="error">{api.error}</p>}
    </>
  )
}

describe('useFolders resume sync', () => {
  let teardownResume: () => void

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    resetAuthIdentityForTests()
    resetResumeSyncForTests()
    teardownResume = installResumeSyncListeners()
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
    listFolders.mockReset()
    listFolders.mockResolvedValue([
      {
        id: 'folder-a',
        user_id: 'user-a',
        name: 'A',
        sort_order: 0,
        created_at: '2026-01-01T00:00:00Z',
      },
    ])
  })

  afterEach(() => {
    teardownResume()
    cleanup()
    resetAuthIdentityForTests()
    resetResumeSyncForTests()
    vi.useRealTimers()
  })

  it('completes the initial load when StrictMode replays the effect', async () => {
    const apiRef = { current: null as ReturnType<typeof useFolders> | null }
    render(
      <StrictMode>
        <Probe apiRef={apiRef} />
      </StrictMode>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('ready')
      expect(screen.getByTestId('folders').textContent).toBe('folder-a')
    })
    expect(listFolders).toHaveBeenCalledTimes(2)
  })

  it('clears loading and displays the error when the latest StrictMode load fails', async () => {
    listFolders
      .mockRejectedValueOnce(new Error('cancelled request'))
      .mockRejectedValueOnce(new Error('latest request failed'))

    const apiRef = { current: null as ReturnType<typeof useFolders> | null }
    render(
      <StrictMode>
        <Probe apiRef={apiRef} />
      </StrictMode>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('ready')
      expect(screen.getByTestId('error').textContent).toContain('読み込みに失敗')
    })
    expect(listFolders).toHaveBeenCalledTimes(2)
  })

  it('does not apply an older StrictMode request after the latest response', async () => {
    let releaseOld: (rows: { id: string; user_id: string; name: string; sort_order: number; created_at: string }[]) => void = () => {}
    const oldRequest = new Promise<{ id: string; user_id: string; name: string; sort_order: number; created_at: string }[]>((resolve) => {
      releaseOld = resolve
    })
    listFolders
      .mockImplementationOnce(() => oldRequest)
      .mockResolvedValueOnce([{
        id: 'latest-folder',
        user_id: 'user-a',
        name: 'Latest',
        sort_order: 0,
        created_at: '2026-01-01T00:00:00Z',
      }])

    const apiRef = { current: null as ReturnType<typeof useFolders> | null }
    render(
      <StrictMode>
        <Probe apiRef={apiRef} />
      </StrictMode>,
    )
    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('ready')
      expect(screen.getByTestId('folders').textContent).toBe('latest-folder')
    })

    await act(async () => {
      releaseOld([{
        id: 'stale-folder',
        user_id: 'user-a',
        name: 'Stale',
        sort_order: 0,
        created_at: '2026-01-01T00:00:00Z',
      }])
      await oldRequest
    })

    expect(screen.getByTestId('folders').textContent).toBe('latest-folder')
    expect(screen.getByTestId('loading').textContent).toBe('ready')
  })

  it('does not let an old request clear a later visible refresh', async () => {
    let releaseOld: (rows: { id: string; user_id: string; name: string; sort_order: number; created_at: string }[]) => void = () => {}
    const oldRequest = new Promise<{ id: string; user_id: string; name: string; sort_order: number; created_at: string }[]>((resolve) => {
      releaseOld = resolve
    })
    listFolders.mockImplementationOnce(() => oldRequest)

    const apiRef = { current: null as ReturnType<typeof useFolders> | null }
    render(
      <StrictMode>
        <Probe apiRef={apiRef} />
      </StrictMode>,
    )
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('ready'))

    let releaseRefresh: (rows: { id: string; user_id: string; name: string; sort_order: number; created_at: string }[]) => void = () => {}
    const visibleRefresh = new Promise<{ id: string; user_id: string; name: string; sort_order: number; created_at: string }[]>((resolve) => {
      releaseRefresh = resolve
    })
    listFolders.mockImplementationOnce(() => visibleRefresh)
    let refreshPromise: Promise<void> | undefined
    act(() => {
      refreshPromise = apiRef.current?.refresh()
    })
    expect(screen.getByTestId('loading').textContent).toBe('loading')

    await act(async () => {
      releaseOld([{
        id: 'stale-folder',
        user_id: 'user-a',
        name: 'Stale',
        sort_order: 0,
        created_at: '2026-01-01T00:00:00Z',
      }])
      await oldRequest
    })
    expect(screen.getByTestId('loading').textContent).toBe('loading')

    await act(async () => {
      releaseRefresh([{
        id: 'visible-folder',
        user_id: 'user-a',
        name: 'Visible',
        sort_order: 0,
        created_at: '2026-01-01T00:00:00Z',
      }])
      await refreshPromise
    })
    expect(screen.getByTestId('folders').textContent).toBe('visible-folder')
    expect(screen.getByTestId('loading').textContent).toBe('ready')
  })

  it('keeps a silent refresh authoritative over StrictMode initial requests', async () => {
    const pending: Array<(rows: { id: string; user_id: string; name: string; sort_order: number; created_at: string }[]) => void> = []
    listFolders.mockImplementation(() => new Promise((resolve) => pending.push(resolve)))

    const apiRef = { current: null as ReturnType<typeof useFolders> | null }
    render(
      <StrictMode>
        <Probe apiRef={apiRef} />
      </StrictMode>,
    )
    expect(listFolders).toHaveBeenCalledTimes(2)

    listFolders.mockResolvedValueOnce([{
      id: 'fresh-folder',
      user_id: 'user-a',
      name: 'Fresh',
      sort_order: 0,
      created_at: '2026-01-01T00:00:00Z',
    }])
    await act(async () => {
      await apiRef.current?.refresh({ silent: true })
    })
    expect(screen.getByTestId('loading').textContent).toBe('ready')
    expect(screen.getByTestId('folders').textContent).toBe('fresh-folder')

    await act(async () => {
      for (const release of pending) {
        release([{
          id: 'stale-folder',
          user_id: 'user-a',
          name: 'Stale',
          sort_order: 0,
          created_at: '2026-01-01T00:00:00Z',
        }])
      }
      await Promise.resolve()
    })
    expect(screen.getByTestId('folders').textContent).toBe('fresh-folder')
    expect(screen.getByTestId('loading').textContent).toBe('ready')
  })

  it('clears loading when a silent refresh interrupts the initial fetch', async () => {
    let releaseInitial: () => void = () => {}
    const initialGate = new Promise<
      {
        id: string
        user_id: string
        name: string
        sort_order: number
        created_at: string
      }[]
    >((resolve) => {
      releaseInitial = () =>
        resolve([
          {
            id: 'folder-a',
            user_id: 'user-a',
            name: 'A',
            sort_order: 0,
            created_at: '2026-01-01T00:00:00Z',
          },
        ])
    })

    listFolders.mockImplementationOnce(() => initialGate)

    const apiRef = { current: null as ReturnType<typeof useFolders> | null }
    render(<Probe apiRef={apiRef} />)
    expect(screen.getByTestId('loading').textContent).toBe('loading')

    listFolders.mockResolvedValue([
      {
        id: 'folder-b',
        user_id: 'user-a',
        name: 'B',
        sort_order: 0,
        created_at: '2026-01-01T00:00:00Z',
      },
    ])

    await act(async () => {
      await apiRef.current?.refresh({ silent: true })
    })

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('ready')
    })
    expect(apiRef.current?.folders[0]?.id).toBe('folder-b')
    await act(async () => {
      releaseInitial()
      await initialGate
    })
  })
})
