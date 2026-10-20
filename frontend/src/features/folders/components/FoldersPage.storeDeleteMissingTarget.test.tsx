// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import {
  MISSING_TARGET_MESSAGE,
  createMissingTargetError,
} from '@/lib/appError'
import type { PriceRecord } from '@/features/records/types'
import type { PriceFolder } from '../types'
import type { PriceStore } from '@/features/stores/types'

const {
  deleteStore,
  folderFixture,
  getStoresCached,
  removeFromStoresCache,
  storeFixture,
} = vi.hoisted(() => ({
  deleteStore: vi.fn(),
  folderFixture: {
    id: 'folder-1',
    user_id: 'user-1',
    name: '牛乳',
    sort_order: 0,
    created_at: '2026-01-01T00:00:00Z',
  },
  getStoresCached: vi.fn(),
  removeFromStoresCache: vi.fn(),
  storeFixture: {
    id: 'store-1',
    user_id: 'user-1',
    name: '店舗A',
    created_at: '2026-01-01T00:00:00Z',
  },
}))

vi.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: () => false,
}))

vi.mock('@/components/trash/TrashDragProvider', () => ({
  TrashDragProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  MemoTrashZone: () => null,
}))

vi.mock('@/components/catalog/DraggableCatalogItem', () => ({
  DraggableCatalogItem: ({
    children,
    onDelete,
    payload,
  }: {
    children: React.ReactNode
    onDelete: () => void
    payload: { id: string }
  }) => (
    <div>
      {children}
      <button type="button" onClick={onDelete}>
        delete-{payload.id}
      </button>
    </div>
  ),
}))

vi.mock('@/features/trends/components/FolderTrendPanel', () => ({
  FolderTrendPanel: () => null,
}))

vi.mock('@/components/ScrollToTopButton', () => ({
  ScrollToTopButton: () => null,
}))

vi.mock('../hooks/useFolders', () => ({
  useFolders: () => ({
    folders: [folderFixture],
    isLoading: false,
    isMutating: false,
    error: null,
    create: vi.fn(),
    rename: vi.fn(),
    remove: vi.fn(),
    refresh: vi.fn(),
  }),
}))

vi.mock('../api/foldersApi', () => ({
  createFolder: vi.fn(),
  deleteFolder: vi.fn(),
  listFolders: vi.fn().mockResolvedValue([folderFixture]),
  renameFolder: vi.fn(),
  reorderFolders: vi.fn(),
}))

vi.mock('@/features/records/api/recordsApi', () => ({
  createRecord: vi.fn(),
  deleteRecord: vi.fn(),
  listAllRecords: () => listAllRecords(),
  listRecords: vi.fn().mockResolvedValue([]),
  updateRecord: vi.fn(),
}))

vi.mock('@/features/stores/api/storesApi', () => ({
  createStore: vi.fn(),
  deleteStore: (...args: unknown[]) => deleteStore(...args),
  getStoresCached: (options?: { force?: boolean }) => getStoresCached(options),
  getStoresCacheEpoch: () => 0,
  peekStoresCache: () => [storeFixture],
  removeFromStoresCache: (...args: unknown[]) => removeFromStoresCache(...args),
  renameStore: vi.fn(),
  setStoresCache: vi.fn(),
  upsertStoresCache: vi.fn(),
}))

const listAllRecords = vi.fn()

import { FoldersPage } from './FoldersPage'

const folder: PriceFolder = folderFixture
const store: PriceStore = storeFixture

const record: PriceRecord = {
  id: 'record-1',
  user_id: 'user-1',
  folder_id: folder.id,
  recorded_at: '2026-01-01',
  store_name: store.name,
  price: 100,
  amount: 1,
  unit: '本',
  note: null,
  receipt_item_id: null,
  label_image_path: null,
  sort_order: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

type DeletePath = 'confirm' | 'request'
type RefreshResult = 'present' | 'absent' | 'failed'

async function attemptDelete(path: DeletePath, result: RefreshResult) {
  const rows = path === 'confirm' ? [record] : []
  const refreshedStores = result === 'present' ? [store] : []

  listAllRecords.mockResolvedValue(rows)
  getStoresCached
    .mockResolvedValueOnce([store])
    .mockImplementationOnce(() => {
      if (result === 'failed') return Promise.reject(new Error('network'))
      return Promise.resolve(refreshedStores)
    })
  deleteStore.mockRejectedValue(createMissingTargetError())

  render(<FoldersPage />)
  await waitFor(() => expect(getStoresCached).toHaveBeenCalledTimes(1))
  fireEvent.click(screen.getByRole('button', { name: '店名' }))
  await screen.findByText(store.name)
  fireEvent.click(screen.getByRole('button', { name: 'delete-store-1' }))

  if (path === 'confirm') {
    fireEvent.click(await screen.findByRole('button', { name: '削除する' }))
  }

  await waitFor(() => expect(getStoresCached).toHaveBeenCalledTimes(2))
  await waitFor(() => expect(deleteStore).toHaveBeenCalledWith(store.id))
}

describe('FoldersPage store deletion after MissingTarget', () => {
  beforeEach(() => {
    vi.stubGlobal('scrollTo', vi.fn())
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    deleteStore.mockReset()
    getStoresCached.mockReset()
    removeFromStoresCache.mockReset()
    listAllRecords.mockReset()
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it.each(['confirm', 'request'] as const)(
    '%s path keeps the store when the refreshed list still contains it',
    async (path) => {
      await attemptDelete(path, 'present')

      expect(removeFromStoresCache).not.toHaveBeenCalled()
      expect(screen.getAllByText(store.name).length).toBeGreaterThan(0)
      expect(screen.getByText(MISSING_TARGET_MESSAGE)).toBeTruthy()
    },
  )

  it.each(['confirm', 'request'] as const)(
    '%s path removes the store only when the refreshed list omits it',
    async (path) => {
      await attemptDelete(path, 'absent')

      expect(removeFromStoresCache).toHaveBeenCalledWith(store.id, 0)
      expect(screen.queryByText(store.name)).toBeNull()
    },
  )

  it.each(['confirm', 'request'] as const)(
    '%s path preserves the store when the forced refresh fails',
    async (path) => {
      await attemptDelete(path, 'failed')

      expect(removeFromStoresCache).not.toHaveBeenCalled()
      expect(screen.getAllByText(store.name).length).toBeGreaterThan(0)
      expect(screen.getByText(MISSING_TARGET_MESSAGE)).toBeTruthy()
    },
  )
})
