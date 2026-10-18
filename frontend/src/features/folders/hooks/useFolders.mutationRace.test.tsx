// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEffect } from 'react'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { applyAuthIdentity, resetAuthIdentityForTests } from '@/lib/authIdentity'
import { useFolders } from './useFolders'

const listFolders = vi.fn()
const createFolder = vi.fn()
const renameFolder = vi.fn()
const deleteFolder = vi.fn()
const reorderFolders = vi.fn()

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
    },
  },
}))

vi.mock('@/features/folders/api/foldersApi', () => ({
  createFolder: (...args: unknown[]) => createFolder(...args),
  deleteFolder: (...args: unknown[]) => deleteFolder(...args),
  listFolders: () => listFolders(),
  renameFolder: (...args: unknown[]) => renameFolder(...args),
  reorderFolders: (...args: unknown[]) => reorderFolders(...args),
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
    <div>
      <p data-testid="loading">{api.isLoading ? 'loading' : 'ready'}</p>
      <ul>
        {api.folders.map((folder) => (
          <li key={folder.id} data-testid={`folder-${folder.id}`}>{folder.name}</li>
        ))}
      </ul>
    </div>
  )
}

const folderA = {
  id: 'folder-a',
  user_id: 'user-a',
  name: 'A',
  sort_order: 0,
  created_at: '2026-01-01T00:00:00Z',
}
const folderCreated = {
  id: 'folder-new',
  user_id: 'user-a',
  name: 'New',
  sort_order: 1,
  created_at: '2026-01-02T00:00:00Z',
}
const folderB = {
  id: 'folder-b',
  user_id: 'user-a',
  name: 'B',
  sort_order: 1,
  created_at: '2026-01-01T01:00:00Z',
}

describe('useFolders mutation races', () => {
  beforeEach(() => {
    resetAuthIdentityForTests()
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
    createFolder.mockReset()
    renameFolder.mockReset()
    deleteFolder.mockReset()
    reorderFolders.mockReset()
    listFolders.mockResolvedValue([folderA])
  })

  afterEach(() => {
    cleanup()
    resetAuthIdentityForTests()
  })

  it('does not undo a create when an older listFolders response arrives later', async () => {
    let releaseStale: () => void = () => {}
    const staleGate = new Promise<typeof folderA[]>((resolve) => {
      releaseStale = () => resolve([folderA])
    })
    let stallInitial = true
    listFolders.mockImplementation(() => {
      if (!stallInitial) return Promise.resolve([folderA])
      stallInitial = false
      return staleGate
    })

    const apiRef = { current: null as ReturnType<typeof useFolders> | null }
    render(<Probe apiRef={apiRef} />)

    await waitFor(() => {
      expect(apiRef.current).not.toBeNull()
      expect(screen.getByTestId('loading').textContent).toBe('loading')
    })

    createFolder.mockResolvedValue(folderCreated)
    await act(async () => {
      await apiRef.current?.create('New')
    })

    expect(screen.getByTestId('folder-folder-new')).toBeTruthy()

    await act(async () => {
      releaseStale()
      await staleGate
      await Promise.resolve()
    })

    expect(screen.getByTestId('folder-folder-new')).toBeTruthy()
    expect(screen.queryByTestId('folder-folder-a')).toBeNull()
  })

  it('does not undo a rename when an older listFolders response arrives later', async () => {
    const apiRef = { current: null as ReturnType<typeof useFolders> | null }
    render(<Probe apiRef={apiRef} />)
    await waitFor(() => expect(apiRef.current?.folders).toHaveLength(1))

    let releaseStale: () => void = () => {}
    const staleGate = new Promise<typeof folderA[]>((resolve) => {
      releaseStale = () => resolve([folderA])
    })
    listFolders.mockImplementationOnce(() => staleGate)

    await act(async () => {
      void apiRef.current?.refresh({ silent: true })
    })

    renameFolder.mockResolvedValue({ ...folderA, name: 'Renamed' })
    await act(async () => {
      await apiRef.current?.rename('folder-a', 'Renamed')
    })

    expect(screen.getByText('Renamed')).toBeTruthy()

    await act(async () => {
      releaseStale()
      await staleGate
      await Promise.resolve()
    })

    expect(screen.getByText('Renamed')).toBeTruthy()
  })

  it('does not resurrect a deleted folder when an older listFolders response arrives later', async () => {
    const apiRef = { current: null as ReturnType<typeof useFolders> | null }
    render(<Probe apiRef={apiRef} />)
    await waitFor(() => expect(apiRef.current?.folders).toHaveLength(1))

    let releaseStale: () => void = () => {}
    const staleGate = new Promise<typeof folderA[]>((resolve) => {
      releaseStale = () => resolve([folderA])
    })
    listFolders.mockImplementationOnce(() => staleGate)

    await act(async () => {
      void apiRef.current?.refresh({ silent: true })
    })

    deleteFolder.mockResolvedValue(undefined)
    await act(async () => {
      await apiRef.current?.remove('folder-a')
    })

    expect(screen.queryByTestId('folder-folder-a')).toBeNull()

    await act(async () => {
      releaseStale()
      await staleGate
      await Promise.resolve()
    })

    expect(screen.queryByTestId('folder-folder-a')).toBeNull()
  })

  it('does not undo optimistic reorder when listFolders resolves during reorder RPC', async () => {
    listFolders.mockResolvedValue([folderA, folderB])
    const apiRef = { current: null as ReturnType<typeof useFolders> | null }
    render(<Probe apiRef={apiRef} />)
    await waitFor(() => expect(apiRef.current?.folders).toHaveLength(2))

    let releaseStale: () => void = () => {}
    const staleGate = new Promise<typeof folderA[]>((resolve) => {
      releaseStale = () => resolve([folderA, folderB])
    })
    listFolders.mockImplementationOnce(() => staleGate)

    let releaseReorder: () => void = () => {}
    const reorderGate = new Promise<void>((resolve) => {
      releaseReorder = () => resolve()
    })
    reorderFolders.mockImplementation(() => reorderGate)

    await act(async () => {
      void apiRef.current?.refresh({ silent: true })
    })

    await act(async () => {
      void apiRef.current?.reorder(['folder-b', 'folder-a'])
    })

    const folderIds = () =>
      apiRef.current?.folders.map((folder) => folder.id) ?? []
    expect(folderIds()).toEqual(['folder-b', 'folder-a'])

    await act(async () => {
      releaseReorder()
      await reorderGate
      releaseStale()
      await staleGate
      await Promise.resolve()
    })

    expect(folderIds()).toEqual(['folder-b', 'folder-a'])
    expect(reorderFolders).toHaveBeenCalledWith(['folder-b', 'folder-a'])
  })

  it('does not apply a listFolders request started during reorder after the RPC succeeds', async () => {
    listFolders.mockResolvedValue([folderA, folderB])
    const apiRef = { current: null as ReturnType<typeof useFolders> | null }
    render(<Probe apiRef={apiRef} />)
    await waitFor(() => expect(apiRef.current?.folders).toHaveLength(2))

    let releaseReorder: () => void = () => {}
    const reorderGate = new Promise<void>((resolve) => {
      releaseReorder = () => resolve()
    })
    reorderFolders.mockImplementation(() => reorderGate)

    let releaseStale: () => void = () => {}
    const staleGate = new Promise<typeof folderA[]>((resolve) => {
      releaseStale = () => resolve([folderA, folderB])
    })
    listFolders.mockImplementationOnce(() => staleGate)

    let reorderPromise: Promise<void> | undefined
    await act(async () => {
      reorderPromise = apiRef.current?.reorder(['folder-b', 'folder-a'])
    })
    const refreshPromise = apiRef.current?.refresh({ silent: true })

    await act(async () => {
      releaseReorder()
      await reorderGate
      await reorderPromise
      releaseStale()
      await staleGate
      await refreshPromise
    })

    expect(apiRef.current?.folders.map((folder) => folder.id)).toEqual([
      'folder-b',
      'folder-a',
    ])
  })
})
