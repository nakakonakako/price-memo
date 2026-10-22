// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { applyAuthIdentity, resetAuthIdentityForTests } from '@/lib/authIdentity'
import {
  bumpFoldersRevision,
  bumpRecordsRevision,
  resetCatalogSync,
} from '@/lib/catalogSync'
import {
  resetResumeSyncForTests,
  triggerResumeSyncForTests,
} from '@/lib/resumeSync'
import type { PriceRecord } from '@/features/records/types'

vi.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: () => false,
}))

vi.mock('@/components/trash/TrashDragProvider', () => ({
  TrashDragProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  MemoTrashZone: () => null,
}))

vi.mock('@/features/trends/components/FolderTrendPanel', () => ({
  FolderTrendPanel: () => null,
}))

const listFolders = vi.fn()
const listRecords = vi.fn()
const listAllRecords = vi.fn()
const getStoresCached = vi.fn()

vi.mock('../api/foldersApi', () => ({
  createFolder: vi.fn(),
  deleteFolder: vi.fn(),
  listFolders: () => listFolders(),
  renameFolder: vi.fn(),
  reorderFolders: vi.fn(),
}))

vi.mock('@/features/records/api/recordsApi', () => ({
  createRecord: vi.fn(),
  deleteRecord: vi.fn(),
  listAllRecords: () => listAllRecords(),
  listRecords: (folderId: string) => listRecords(folderId),
  updateRecord: vi.fn(),
}))

vi.mock('@/features/stores/api/storesApi', () => ({
  createStore: vi.fn(),
  deleteStore: vi.fn(),
  getStoresCached: (opts?: { force?: boolean }) => getStoresCached(opts),
  getStoresCacheEpoch: () => 0,
  peekStoresCache: () => [],
  removeFromStoresCache: vi.fn(),
  renameStore: vi.fn(),
  setStoresCache: vi.fn(),
  upsertStoresCache: vi.fn(),
}))

import { FoldersPage } from './FoldersPage'

const folderA = {
  id: 'folder-a',
  user_id: 'user-a',
  name: 'A',
  sort_order: 0,
  created_at: '2026-01-01T00:00:00Z',
}

function recordRow(id: string, note: string): PriceRecord {
  return {
    id,
    user_id: 'user-a',
    folder_id: 'folder-a',
    store_name: 'store',
    price: 100,
    amount: 1,
    unit: 'g',
    recorded_at: '2026-01-01',
    note,
    receipt_item_id: null,
    label_image_path: null,
    sort_order: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

describe('FoldersPage record mutation races', () => {
  beforeEach(() => {
    vi.stubGlobal('scrollTo', vi.fn())
    resetAuthIdentityForTests()
    resetCatalogSync()
    resetResumeSyncForTests()
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
    listRecords.mockReset()
    listAllRecords.mockReset()
    getStoresCached.mockReset()

    listFolders.mockResolvedValue([folderA])
    getStoresCached.mockResolvedValue([])
    listRecords.mockResolvedValue([recordRow('default-folder', 'default-folder-note')])
    listAllRecords.mockResolvedValue([recordRow('initial', 'initial-note')])
  })

  afterEach(() => {
    cleanup()
    resetAuthIdentityForTests()
    resetCatalogSync()
    resetResumeSyncForTests()
    vi.unstubAllGlobals()
  })

  it('does not overwrite allRecords when listAllRecords resolves after a records revision bump', async () => {
    let releaseStaleAll: () => void = () => {}
    const staleAllGate = new Promise<PriceRecord[]>((resolve) => {
      releaseStaleAll = () => resolve([recordRow('stale-all', 'stale-all-marker')])
    })
    listAllRecords.mockImplementationOnce(() => staleAllGate)

    const view = render(<FoldersPage active />)
    await waitFor(() => expect(listFolders).toHaveBeenCalled())

    listAllRecords.mockResolvedValue([recordRow('fresh', 'fresh-marker')])
    view.rerender(<FoldersPage active={false} />)
    await act(async () => {
      bumpRecordsRevision()
    })
    view.rerender(<FoldersPage active />)

    await waitFor(() => expect(listAllRecords).toHaveBeenCalledTimes(2))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'すべての記録（1）' })).toBeTruthy(),
    )

    fireEvent.click(screen.getByRole('button', { name: 'すべての記録（1）' }))
    await waitFor(() => expect(screen.getByText('fresh-marker')).toBeTruthy())

    await act(async () => {
      releaseStaleAll()
      await staleAllGate
      await Promise.resolve()
    })

    expect(screen.queryByText('stale-all-marker')).toBeNull()
    expect(screen.getByText('fresh-marker')).toBeTruthy()
  })

  it('does not apply a stale listRecords response after a records revision bump', async () => {
    let releaseInitialAll: () => void = () => {}
    const initialAllGate = new Promise<PriceRecord[]>((resolve) => {
      releaseInitialAll = () => resolve([recordRow('initial', 'initial-note')])
    })
    listAllRecords.mockImplementation(() => initialAllGate)

    let releaseStale: () => void = () => {}
    const staleGate = new Promise<PriceRecord[]>((resolve) => {
      releaseStale = () => resolve([recordRow('stale', 'stale-folder-marker')])
    })
    listRecords.mockImplementation(() => staleGate)

    const view = render(<FoldersPage active />)
    await waitFor(() => expect(screen.getByText('A')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: /すべての記録/ }))

    listAllRecords.mockResolvedValue([recordRow('fresh', 'fresh-marker')])
    view.rerender(<FoldersPage active={false} />)
    await act(async () => {
      bumpRecordsRevision()
    })
    view.rerender(<FoldersPage active />)

    await waitFor(() => expect(listAllRecords).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.getByText('fresh-marker')).toBeTruthy())

    await act(async () => {
      releaseStale()
      await staleGate
      releaseInitialAll()
      await initialAllGate
      await Promise.resolve()
    })

    expect(screen.queryByText('stale-folder-marker')).toBeNull()
    expect(screen.getByText('fresh-marker')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '← 一覧へ' }))
    expect(
      screen.getByRole('button', { name: 'すべての記録（1）' }),
    ).toBeTruthy()
  })

  it('does not apply listAllRecords when folders revision changes during fetch', async () => {
    let releaseStaleAll: () => void = () => {}
    const staleAllGate = new Promise<PriceRecord[]>((resolve) => {
      releaseStaleAll = () => resolve([recordRow('stale-all', 'stale-folders-marker')])
    })
    listAllRecords.mockImplementationOnce(() => staleAllGate)

    const view = render(<FoldersPage active />)
    await waitFor(() => expect(listFolders).toHaveBeenCalled())
    await waitFor(() => expect(listAllRecords).toHaveBeenCalledTimes(1))

    await act(async () => {
      bumpFoldersRevision()
    })

    let releaseFreshAll: () => void = () => {}
    const freshAllGate = new Promise<PriceRecord[]>((resolve) => {
      releaseFreshAll = () =>
        resolve([recordRow('fresh', 'fresh-folders-marker')])
    })
    listAllRecords.mockImplementationOnce(() => freshAllGate)

    await act(async () => {
      releaseStaleAll()
      await staleAllGate
      await Promise.resolve()
    })

    view.rerender(<FoldersPage active={false} />)
    await act(async () => {
      bumpRecordsRevision()
    })
    view.rerender(<FoldersPage active />)

    await waitFor(() => expect(listAllRecords).toHaveBeenCalledTimes(2))
    await act(async () => {
      releaseFreshAll()
      await freshAllGate
      await Promise.resolve()
    })
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'すべての記録（1）' })).toBeTruthy(),
    )
    expect(listRecords).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /すべての記録/ }))
    await waitFor(() => expect(screen.getByText('fresh-folders-marker')).toBeTruthy())
    expect(screen.queryByText('stale-folders-marker')).toBeNull()
  })

  it('does not apply stale listRecords after listAllRecords snapshot is adopted first', async () => {
    let releaseInitialAll: () => void = () => {}
    const initialAllGate = new Promise<PriceRecord[]>((resolve) => {
      releaseInitialAll = () =>
        resolve([recordRow('fresh', 'fresh-marker')])
    })
    listAllRecords.mockImplementationOnce(() => initialAllGate)

    let releaseStaleFolder: () => void = () => {}
    const staleFolderGate = new Promise<PriceRecord[]>((resolve) => {
      releaseStaleFolder = () =>
        resolve([recordRow('stale-folder', 'stale-folder-marker')])
    })
    listRecords.mockImplementation(() => staleFolderGate)

    render(<FoldersPage active />)
    await waitFor(() => expect(screen.getByText('A')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'すべての記録（0）' }))
    await waitFor(() => expect(listRecords).toHaveBeenCalledTimes(1))

    await act(async () => {
      releaseInitialAll()
      await initialAllGate
      await Promise.resolve()
    })

    await waitFor(() => expect(screen.getByText('fresh-marker')).toBeTruthy())

    await act(async () => {
      releaseStaleFolder()
      await staleFolderGate
      await Promise.resolve()
    })

    expect(screen.queryByText('stale-folder-marker')).toBeNull()
    expect(screen.getByText('fresh-marker')).toBeTruthy()
  })

  it('does not apply stale resume listAllRecords after refreshAllRecords supersedes the request id', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })

    try {
      const view = render(<FoldersPage active />)
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'すべての記録（1）' })).toBeTruthy(),
      )

      let releaseResumeAll: () => void = () => {}
      const resumeAllGate = new Promise<PriceRecord[]>((resolve) => {
        releaseResumeAll = () =>
          resolve([recordRow('stale-resume', 'stale-resume-marker')])
      })
      listAllRecords.mockImplementationOnce(() => resumeAllGate)

      act(() => {
        triggerResumeSyncForTests()
        vi.runAllTimers()
      })

      await waitFor(() => expect(listAllRecords).toHaveBeenCalledTimes(2))

      let releaseFreshRegular: () => void = () => {}
      const freshRegularGate = new Promise<PriceRecord[]>((resolve) => {
        releaseFreshRegular = () =>
          resolve([recordRow('fresh-regular', 'fresh-regular-marker')])
      })
      listAllRecords.mockImplementationOnce(() => freshRegularGate)

      view.rerender(<FoldersPage active={false} />)
      await act(async () => {
        bumpRecordsRevision()
      })
      view.rerender(<FoldersPage active />)

      await waitFor(() => expect(listAllRecords).toHaveBeenCalledTimes(3))
      await act(async () => {
        releaseFreshRegular()
        await freshRegularGate
        await Promise.resolve()
      })

      fireEvent.click(screen.getByRole('button', { name: /すべての記録/ }))
      await waitFor(() => expect(screen.getByText('fresh-regular-marker')).toBeTruthy())

      await act(async () => {
        releaseResumeAll()
        await resumeAllGate
        await Promise.resolve()
      })

      expect(screen.queryByText('stale-resume-marker')).toBeNull()
      expect(screen.getByText('fresh-regular-marker')).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })
})
