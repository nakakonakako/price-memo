import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  isPriceMemoOperation,
  isPriceMemoTable,
  clearPendingExternalSync,
  requestExternalSync,
  resetExternalSyncForTests,
  subscribeExternalSync,
} from './externalSync'

describe('externalSync', () => {
  afterEach(() => resetExternalSyncForTests())

  it('batches repeated table invalidations into one union', async () => {
    vi.useFakeTimers()
    const listener = vi.fn()
    const unsubscribe = subscribeExternalSync(listener)

    requestExternalSync(['price_records'])
    requestExternalSync(['price_records', 'price_memo_items'])
    await vi.advanceTimersByTimeAsync(50)

    expect(listener).toHaveBeenCalledTimes(1)
    expect([...listener.mock.calls[0][0]].sort()).toEqual([
      'price_memo_items',
      'price_records',
    ])

    unsubscribe()
    vi.useRealTimers()
  })

  it('accepts only the contracted table and operation values', () => {
    expect(isPriceMemoTable('price_folders')).toBe(true)
    expect(isPriceMemoTable('receipts')).toBe(false)
    expect(isPriceMemoOperation('INSERT')).toBe(true)
    expect(isPriceMemoOperation('TRUNCATE')).toBe(false)
  })

  it('drops a queued user event when the authenticated identity changes', async () => {
    vi.useFakeTimers()
    const listener = vi.fn()
    subscribeExternalSync(listener)
    requestExternalSync(['price_records'])
    clearPendingExternalSync()
    await vi.advanceTimersByTimeAsync(50)

    expect(listener).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
})
