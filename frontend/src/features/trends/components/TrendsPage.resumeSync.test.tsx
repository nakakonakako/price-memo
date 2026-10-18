// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { applyAuthIdentity, resetAuthIdentityForTests } from '@/lib/authIdentity'
import {
  installResumeSyncListeners,
  resetResumeSyncForTests,
  triggerResumeSyncForTests,
} from '@/lib/resumeSync'
import type { PriceRecord } from '@/features/records/types'

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => (
    <div data-testid="chart">{children}</div>
  ),
  LineChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Line: () => null,
}))

vi.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: () => false,
}))

const listFolders = vi.fn()
const listRecords = vi.fn()

vi.mock('@/features/folders/api/foldersApi', () => ({
  listFolders: () => listFolders(),
}))

vi.mock('@/features/records/api/recordsApi', () => ({
  listRecords: (folderId: string) => listRecords(folderId),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
    },
  },
}))

import { TrendsPage } from './TrendsPage'

const folderA = {
  id: 'folder-a',
  user_id: 'user-a',
  name: 'A',
  sort_order: 0,
  created_at: '2026-01-01T00:00:00Z',
}

function recordRow(id: string, store: string, unit: string): PriceRecord {
  return {
    id,
    user_id: 'user-a',
    folder_id: 'folder-a',
    store_name: store,
    price: 100,
    amount: 100,
    unit,
    recorded_at: '2026-01-01',
    note: null,
    receipt_item_id: null,
    label_image_path: null,
    sort_order: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

describe('TrendsPage resume sync', () => {
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
    listRecords.mockReset()
    listFolders.mockResolvedValue([folderA])
    listRecords.mockResolvedValue([
      recordRow('rec-1', 'store-a', 'g'),
      recordRow('rec-2', 'store-b', 'g'),
    ])
  })

  afterEach(() => {
    teardownResume()
    cleanup()
    resetAuthIdentityForTests()
    resetResumeSyncForTests()
    vi.useRealTimers()
  })

  it('refetches records for the same folder and keeps chart settings', async () => {
    render(<TrendsPage active />)

    await waitFor(() => expect(listRecords).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByText('store-a')).toBeTruthy())

    const comboboxes = screen.getAllByRole('combobox')
    const basisSelect = comboboxes[2]
    fireEvent.change(basisSelect, { target: { value: 'per_unit' } })

    listRecords.mockResolvedValue([
      recordRow('rec-3', 'store-a', 'g'),
      recordRow('rec-4', 'store-c', 'g'),
    ])

    act(() => {
      triggerResumeSyncForTests()
      vi.runAllTimers()
    })

    await waitFor(() => expect(listRecords).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.getByText('store-c')).toBeTruthy())
    expect((basisSelect as HTMLSelectElement).value).toBe('per_unit')
  })

  it('clears loading after resume during the initial folder fetch', async () => {
    let releaseInitial: () => void = () => {}
    const initialGate = new Promise<typeof folderA[]>((resolve) => {
      releaseInitial = () => resolve([folderA])
    })
    listFolders.mockImplementationOnce(() => initialGate)

    render(<TrendsPage active />)
    expect(screen.getByText('フォルダを読み込み中...')).toBeTruthy()

    listFolders.mockResolvedValue([folderA])
    act(() => {
      triggerResumeSyncForTests()
      vi.runAllTimers()
    })

    await waitFor(() => {
      expect(screen.queryByText('フォルダを読み込み中...')).toBeNull()
    })
    await act(async () => {
      releaseInitial()
      await initialGate
    })
  })
})
