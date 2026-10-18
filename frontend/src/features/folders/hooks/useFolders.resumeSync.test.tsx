// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEffect } from 'react'
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
  return <p data-testid="loading">{api.isLoading ? 'loading' : 'ready'}</p>
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
