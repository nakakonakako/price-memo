import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  channel: vi.fn(),
  removeChannel: vi.fn(),
  on: vi.fn(),
  subscribe: vi.fn(),
  broadcastCallback: null as ((message: { payload: unknown }) => void) | null,
  statusCallback: null as ((status: string) => void) | null,
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    channel: mocks.channel,
    removeChannel: mocks.removeChannel,
  },
}))

import {
  resetPriceMemoRealtimeForTests,
  subscribePriceMemoRealtime,
} from './priceMemoRealtime'

describe('priceMemoRealtime', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mocks.channel.mockReset()
    mocks.removeChannel.mockReset().mockResolvedValue('ok')
    mocks.on.mockReset()
    mocks.subscribe.mockReset()
    mocks.broadcastCallback = null
    mocks.statusCallback = null
    const channel = { on: mocks.on, subscribe: mocks.subscribe }
    mocks.on.mockImplementation((_type, _filter, callback) => {
      mocks.broadcastCallback = callback
      return channel
    })
    mocks.subscribe.mockImplementation((callback) => {
      mocks.statusCallback = callback
      return channel
    })
    mocks.channel.mockReturnValue(channel)
  })

  afterEach(() => {
    resetPriceMemoRealtimeForTests()
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('uses the private user topic and invalidates on all contracted mutations', () => {
    const received: string[] = []
    subscribePriceMemoRealtime('ABCDEF00-0000-4000-8000-000000000001', (table) => {
      received.push(table)
    })

    expect(mocks.channel).toHaveBeenCalledWith(
      'price-memo:user:abcdef00-0000-4000-8000-000000000001',
      { config: { private: true } },
    )
    expect(mocks.on).toHaveBeenCalledWith(
      'broadcast',
      { event: 'price-memo-change' },
      expect.any(Function),
    )

    for (const table of [
      'price_folders',
      'price_records',
      'price_memo_items',
      'price_stores',
    ]) {
      for (const operation of ['INSERT', 'UPDATE', 'DELETE']) {
        mocks.broadcastCallback?.({ payload: { table, operation } })
      }
    }

    expect(received).toHaveLength(12)
    expect(received).toContain('price_folders')
    expect(received).toContain('price_stores')
  })

  it('refreshes every table on each successful subscription and ignores malformed payloads', () => {
    const received: string[] = []
    subscribePriceMemoRealtime('user-a', (table) => received.push(table))

    mocks.statusCallback?.('SUBSCRIBED')
    expect(received).toEqual([
      'price_folders',
      'price_records',
      'price_memo_items',
      'price_stores',
    ])

    mocks.broadcastCallback?.({ payload: { table: 'receipts', operation: 'INSERT' } })
    mocks.broadcastCallback?.({ payload: { table: 'price_records', operation: 'TRUNCATE' } })
    mocks.broadcastCallback?.({ payload: null })
    expect(received).toHaveLength(4)

    mocks.statusCallback?.('CHANNEL_ERROR')
    mocks.statusCallback?.('SUBSCRIBED')
    expect(received).toHaveLength(8)
  })

  it('shares a channel across effect replays and removes it after the final lease', async () => {
    const firstListener = vi.fn()
    const secondListener = vi.fn()
    const firstUnsubscribe = subscribePriceMemoRealtime('user-a', firstListener)
    mocks.statusCallback?.('SUBSCRIBED')
    const secondUnsubscribe = subscribePriceMemoRealtime('user-a', secondListener)
    expect(mocks.channel).toHaveBeenCalledTimes(1)
    expect(firstListener).toHaveBeenCalledTimes(4)
    expect(secondListener).toHaveBeenCalledTimes(4)

    firstUnsubscribe()
    secondUnsubscribe()
    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.removeChannel).toHaveBeenCalledTimes(1)
  })

  it('detaches old-user events on account switch', () => {
    const oldListener = vi.fn()
    const newListener = vi.fn()
    subscribePriceMemoRealtime('user-a', oldListener)
    const oldBroadcast = mocks.broadcastCallback

    subscribePriceMemoRealtime('user-b', newListener)
    oldBroadcast?.({ payload: { table: 'price_records', operation: 'INSERT' } })

    expect(oldListener).not.toHaveBeenCalled()
    expect(mocks.channel).toHaveBeenCalledTimes(2)
    expect(mocks.channel).toHaveBeenLastCalledWith(
      'price-memo:user:user-b',
      { config: { private: true } },
    )
  })
})
