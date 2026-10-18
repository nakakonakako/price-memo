import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isMissingTargetError } from '@/lib/appError'

const select = vi.fn()
const eq = vi.fn()
const deleteQuery = vi.fn()
const from = vi.fn()

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => from(...args),
  },
}))

import { deleteStore } from './storesApi'

describe('deleteStore', () => {
  beforeEach(() => {
    select.mockReset()
    eq.mockReset()
    deleteQuery.mockReset()
    from.mockReset()

    select.mockResolvedValue({ data: [{ id: 'store-1' }], error: null })
    eq.mockReturnValue({ select })
    deleteQuery.mockReturnValue({ eq })
    from.mockReturnValue({ delete: deleteQuery })
  })

  it('rejects when zero store rows are deleted', async () => {
    select.mockResolvedValueOnce({ data: [], error: null })

    await expect(deleteStore('store-1')).rejects.toSatisfy((err: unknown) =>
      isMissingTargetError(err),
    )
    expect(from).toHaveBeenCalledWith('price_stores')
    expect(eq).toHaveBeenCalledWith('id', 'store-1')
    expect(select).toHaveBeenCalledWith('id')
  })

  it('completes when one store row is deleted', async () => {
    await expect(deleteStore('store-1')).resolves.toBeUndefined()
  })
})
