import { beforeEach, describe, expect, it, vi } from 'vitest'

const order = vi.fn()
const select = vi.fn()
const from = vi.fn()
const rpc = vi.fn()

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => from(table),
    rpc: (...args: unknown[]) => rpc(...args),
    auth: {
      getUser: vi.fn(),
    },
  },
}))

import {
  isMemoReorderStaleError,
  listMemoItems,
  reorderMemoItems,
} from './memoApi'

describe('memoApi', () => {
  beforeEach(() => {
    order.mockReset()
    select.mockReset()
    from.mockReset()
    rpc.mockReset()

    order.mockReturnValue({ order })
    select.mockReturnValue({ order })
    from.mockReturnValue({ select })
  })

  it('lists memo items with id as the third sort key', async () => {
    from.mockReturnValue({
      select: () => ({
        order: (...args: unknown[]) => {
          order(...args)
          if (order.mock.calls.length === 3) {
            return Promise.resolve({ data: [], error: null })
          }
          return { order }
        },
      }),
    })

    await listMemoItems()

    expect(from).toHaveBeenCalledWith('price_memo_items')
    expect(order.mock.calls).toEqual([
      ['sort_order', { ascending: true }],
      ['created_at', { ascending: true }],
      ['id', { ascending: true }],
    ])
  })

  it('invokes reorder_price_memo_items with expected and desired arrays', async () => {
    rpc.mockResolvedValue({ data: null, error: null })

    await reorderMemoItems(['a', 'b'], ['b', 'a'])

    expect(rpc).toHaveBeenCalledWith('reorder_price_memo_items', {
      p_expected_folder_ids: ['a', 'b'],
      p_folder_ids: ['b', 'a'],
    })
  })

  it('still invokes reorder RPC for empty arrays', async () => {
    rpc.mockResolvedValue({ data: null, error: null })

    await reorderMemoItems([], [])

    expect(rpc).toHaveBeenCalledWith('reorder_price_memo_items', {
      p_expected_folder_ids: [],
      p_folder_ids: [],
    })
  })

  it('detects PM001 stale reorder errors', () => {
    expect(isMemoReorderStaleError({ code: 'PM001' })).toBe(true)
    expect(isMemoReorderStaleError({ code: '22023' })).toBe(false)
  })
})
