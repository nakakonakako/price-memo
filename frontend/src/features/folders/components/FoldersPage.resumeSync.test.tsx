// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { applyAuthIdentity, resetAuthIdentityForTests } from '@/lib/authIdentity'
import {
  installResumeSyncListeners,
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

describe('FoldersPage resume sync', () => {
  let teardownResume: () => void

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.stubGlobal('scrollTo', vi.fn())
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
    listRecords.mockReset()
    listAllRecords.mockReset()
    getStoresCached.mockReset()

    listFolders.mockResolvedValue([folderA])
    getStoresCached.mockResolvedValue([])
  })

  afterEach(() => {
    teardownResume()
    cleanup()
    resetAuthIdentityForTests()
    resetResumeSyncForTests()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('does not apply a stale per-folder fetch after resume refresh', async () => {
    let releaseInitialAll: () => void = () => {}
    const initialAllGate = new Promise<PriceRecord[]>((resolve) => {
      releaseInitialAll = () => resolve([recordRow('initial', 'initial-note')])
    })
    listAllRecords.mockImplementation(() => initialAllGate)

    let releaseStale: () => void = () => {}
    const staleGate = new Promise<PriceRecord[]>((resolve) => {
      releaseStale = () => resolve([recordRow('stale', 'stale-marker')])
    })
    listRecords.mockImplementation(() => staleGate)

    render(<FoldersPage active />)
    await waitFor(() => expect(listFolders).toHaveBeenCalled())

    const countButton = screen.getByRole('button', { name: 'すべての記録（0）' })
    fireEvent.click(countButton)

    listAllRecords.mockResolvedValue([recordRow('fresh', 'fresh-marker')])
    act(() => {
      triggerResumeSyncForTests()
      vi.runAllTimers()
    })

    await waitFor(() => expect(listAllRecords).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.getByText('fresh-marker')).toBeTruthy())

    await act(async () => {
      releaseStale()
      await staleGate
      releaseInitialAll()
      await initialAllGate
      await Promise.resolve()
    })

    expect(screen.queryByText('stale-marker')).toBeNull()
    expect(screen.getByText('fresh-marker')).toBeTruthy()
  })
})
