import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isMissingTargetError } from '@/lib/appError'

const single = vi.fn()
const select = vi.fn()
const eq = vi.fn()
const update = vi.fn()
const del = vi.fn()
const from = vi.fn()
const getUser = vi.fn()
const bumpRecordsRevision = vi.fn()

vi.mock('@/lib/catalogSync', () => ({
  bumpRecordsRevision: () => bumpRecordsRevision(),
}))

vi.mock('@/features/stores/api/storesCache', () => ({
  ensureStore: vi.fn(async (name: string) => name),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: () => getUser() },
    from: (...args: unknown[]) => from(...args),
  },
}))

import {
  createRecord,
  deleteRecord,
  updateRecord,
} from './recordsApi'

describe('recordsApi missing targets', () => {
  beforeEach(() => {
    single.mockReset()
    select.mockReset()
    eq.mockReset()
    update.mockReset()
    del.mockReset()
    from.mockReset()
    getUser.mockReset()
    bumpRecordsRevision.mockReset()

    getUser.mockResolvedValue({
      data: { user: { id: 'user-a' } },
      error: null,
    })
  })

  it('deleteRecord rejects when zero rows are deleted', async () => {
    del.mockReturnValue({
      eq: () => ({
        select: () =>
          Promise.resolve({ data: [], error: null }),
      }),
    })
    from.mockReturnValue({ delete: del })

    await expect(deleteRecord('record-1')).rejects.toSatisfy((err: unknown) =>
      isMissingTargetError(err),
    )
    expect(bumpRecordsRevision).not.toHaveBeenCalled()
  })

  it('updateRecord maps PGRST116 to MissingTarget', async () => {
    update.mockReturnValue({
      eq: () => ({
        select: () => ({ single }),
      }),
    })
    from.mockReturnValue({ update })
    single.mockResolvedValue({
      data: null,
      error: { code: 'PGRST116', message: 'no rows' },
    })

    await expect(
      updateRecord('record-1', {
        recorded_at: '2026-01-01',
        store_name: 'store',
        price: 100,
        amount: 1,
        unit: 'g',
      }),
    ).rejects.toSatisfy((err: unknown) => isMissingTargetError(err))
    expect(bumpRecordsRevision).not.toHaveBeenCalled()
  })

  it('createRecord maps folder FK violations to folder-missing copy', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    const limit = vi.fn().mockReturnValue({ maybeSingle })
    const order = vi.fn().mockReturnValue({ limit })
    const folderEq = vi.fn().mockReturnValue({ order })
    const folderSelect = vi.fn().mockReturnValue({ eq: folderEq })
    const insertSingle = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: '23503',
        details: 'Key (folder_id)=(gone) is not present in table "price_folders".',
      },
    })
    const insertSelect = vi.fn().mockReturnValue({ single: insertSingle })
    const insert = vi.fn().mockReturnValue({ select: insertSelect })

    from.mockImplementation((table: string) => {
      if (table === 'price_records') {
        return { select: folderSelect, insert }
      }
      return { select: folderSelect }
    })

    await expect(
      createRecord({
        folder_id: 'gone',
        recorded_at: '2026-01-01',
        store_name: 'store',
        price: 100,
        amount: 1,
        unit: 'g',
      }),
    ).rejects.toSatisfy((err: unknown) => isMissingTargetError(err))
  })
})
