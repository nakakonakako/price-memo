import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MEMO_REORDER_DIAG_RING_MAX,
  formatMemoReorderDiagRingLine,
  getMemoReorderDiagRing,
  getMemoReorderDiagRuntimeSnapshot,
  isMemoReorderDiagEnabled,
  memoReorderDiagDrag,
  memoReorderDiagSessionReset,
  memoReorderDiagStateReset,
  memoReorderDiagSyncRuntime,
  memoReorderDiagTimer,
  memoReorderDiagTouchEvent,
  memoReorderDiagTouchSessionBegin,
  resetMemoReorderDiagQueryCacheForTests,
} from './memoMobileReorderDiag'

describe('memoMobileReorderDiag', () => {
  const originalDev = import.meta.env.DEV

  beforeEach(() => {
    resetMemoReorderDiagQueryCacheForTests()
    vi.stubGlobal('window', {
      location: { search: '' },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    import.meta.env.DEV = originalDev
    resetMemoReorderDiagQueryCacheForTests()
  })

  it('is disabled when not DEV even with query flag', () => {
    import.meta.env.DEV = false
    vi.stubGlobal('window', {
      location: { search: '?memoReorderDiag=1' },
    })
    expect(isMemoReorderDiagEnabled()).toBe(false)
    memoReorderDiagTimer('start', 'test')
    expect(getMemoReorderDiagRing()).toHaveLength(0)
  })

  it('is disabled in DEV without memoReorderDiag=1 query', () => {
    import.meta.env.DEV = true
    expect(isMemoReorderDiagEnabled()).toBe(false)
    memoReorderDiagTimer('start', 'test')
    expect(getMemoReorderDiagRing()).toHaveLength(0)
  })

  it('records events only when DEV and query opt-in', () => {
    import.meta.env.DEV = true
    vi.stubGlobal('window', {
      location: { search: '?memoReorderDiag=1' },
    })
    expect(isMemoReorderDiagEnabled()).toBe(true)

    memoReorderDiagSyncRuntime({
      gesturePhase: 'longPressPending',
      dragging: false,
      activeId: 'folder-a',
      timerState: 'pending',
    })
    memoReorderDiagTouchSessionBegin('folder-a')
    memoReorderDiagTouchEvent('touchstart', 'card', { cancelable: true, defaultPrevented: false }, 0, 0)
    memoReorderDiagTimer('start', 'longPress')
    memoReorderDiagTimer('fire', 'longPress')
    memoReorderDiagDrag('start', 'longPress', 'folder-a')
    memoReorderDiagDrag('finish', 'touchend', 'folder-a')
    memoReorderDiagTimer('cancel', 'clear')
    memoReorderDiagTouchEvent('touchmove', 'document', { cancelable: true, defaultPrevented: true }, 2, 5)
    memoReorderDiagTouchEvent('touchend', 'document', { cancelable: true, defaultPrevented: false }, 0, 0)
    memoReorderDiagTouchEvent('touchcancel', 'document', { cancelable: false, defaultPrevented: false }, 0, 0)
    memoReorderDiagSessionReset('detach')
    memoReorderDiagStateReset('cancelPending')

    const ring = getMemoReorderDiagRing()
    expect(ring.length).toBeGreaterThan(0)
    for (const entry of ring) {
      expect(entry.reason).not.toMatch(/password|cookie|token/i)
      expect(Object.keys(entry)).toEqual([
        'seq',
        'tMs',
        'kind',
        'reason',
        'dx',
        'dy',
        'dist',
        'cancelable',
        'defaultPrevented',
        'gesturePhase',
        'dragging',
        'activeId',
      ])
    }
    const line = formatMemoReorderDiagRingLine(ring[ring.length - 1])
    expect(line).toMatch(/gp=/)
    expect(line).not.toMatch(/商品|店舗|¥/)
  })

  it('drops oldest ring entries beyond the cap', () => {
    import.meta.env.DEV = true
    vi.stubGlobal('window', {
      location: { search: '?memoReorderDiag=1' },
    })
    for (let i = 0; i < MEMO_REORDER_DIAG_RING_MAX + 5; i += 1) {
      memoReorderDiagStateReset(`r${i}`)
    }
    const ring = getMemoReorderDiagRing()
    expect(ring).toHaveLength(MEMO_REORDER_DIAG_RING_MAX)
    expect(ring[0].reason).toBe('r5')
    expect(ring[ring.length - 1].reason).toBe(
      `r${MEMO_REORDER_DIAG_RING_MAX + 4}`,
    )
  })

  it('exposes runtime snapshot for the panel', () => {
    import.meta.env.DEV = true
    vi.stubGlobal('window', {
      location: { search: '?memoReorderDiag=1' },
    })
    memoReorderDiagSyncRuntime({
      gesturePhase: 'dragging',
      dragging: true,
      activeId: 'id-1',
      timerState: 'idle',
    })
    expect(getMemoReorderDiagRuntimeSnapshot()).toEqual({
      gesturePhase: 'dragging',
      dragging: true,
      activeId: 'id-1',
      timerState: 'idle',
    })
  })
})
