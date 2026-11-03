import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MEMO_REORDER_DIAG_RING_MAX,
  bumpMemoReorderDiagRawCounter,
  formatMemoReorderDiagCounterLine,
  formatMemoReorderDiagRingLine,
  getMemoReorderDiagRawCounters,
  getMemoReorderDiagRing,
  getMemoReorderDiagRuntimeSnapshot,
  isMemoReorderDiagEnabled,
  memoReorderDiagDocumentTouchEntry,
  memoReorderDiagDrag,
  memoReorderDiagListener,
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
      scrollX: 0,
      scrollY: 0,
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
      scrollX: 0,
      scrollY: 0,
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
      scrollX: 12,
      scrollY: 3,
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
      expect(entry.detail ?? '').not.toMatch(/password|cookie|token/i)
      expect(JSON.stringify(entry)).not.toMatch(/value=|input|商品|店舗|¥/)
    }
    const line = formatMemoReorderDiagRingLine(ring[ring.length - 1])
    expect(line).toMatch(/gp=/)
    expect(line).not.toMatch(/商品|店舗|¥/)
  })

  it('records document handler entry on ID mismatch without hiding outcome', () => {
    import.meta.env.DEV = true
    vi.stubGlobal('window', {
      location: { search: '?memoReorderDiag=1' },
      scrollX: 0,
      scrollY: 0,
    })
    memoReorderDiagDocumentTouchEntry(
      'touchmove',
      {
        cancelable: false,
        defaultPrevented: false,
        touches: [] as unknown as TouchList,
        changedTouches: [] as unknown as TouchList,
        eventPhase: 1,
      },
      {
        trackedTouchId: 2,
        touchIds: '0',
        changedTouchIds: '0',
        outcome: 'touchLost',
      },
    )
    const ring = getMemoReorderDiagRing()
    expect(ring.some((e) => e.kind === 'docEntry:touchmove' && e.reason === 'touchLost')).toBe(
      true,
    )
    expect(getMemoReorderDiagRawCounters().docTouchmove).toBe(1)
  })

  it('aggregates raw window moves without ring spam', () => {
    import.meta.env.DEV = true
    vi.stubGlobal('window', {
      location: { search: '?memoReorderDiag=1' },
      scrollX: 0,
      scrollY: 0,
    })
    for (let i = 0; i < 200; i += 1) {
      bumpMemoReorderDiagRawCounter('window', 'touchmove')
    }
    expect(getMemoReorderDiagRawCounters().windowTouchmove).toBe(200)
    expect(getMemoReorderDiagRing()).toHaveLength(0)
    expect(formatMemoReorderDiagCounterLine(getMemoReorderDiagRawCounters())).toMatch(/tm=200/)
  })

  it('logs listener attach/detach and cancel drag reason', () => {
    import.meta.env.DEV = true
    vi.stubGlobal('window', {
      location: { search: '?memoReorderDiag=1' },
      scrollX: 0,
      scrollY: 0,
    })
    memoReorderDiagListener('attach', 'document', 'testAttach')
    memoReorderDiagDrag('cancel', 'docMove:notCancelable', 'folder-x')
    memoReorderDiagListener('detach', 'document', 'testDetach')
    const ring = getMemoReorderDiagRing()
    expect(ring.some((e) => e.kind === 'listenerAttach')).toBe(true)
    expect(ring.some((e) => e.kind === 'dragCancel' && e.reason === 'docMove:notCancelable')).toBe(
      true,
    )
    expect(getMemoReorderDiagRuntimeSnapshot().documentTouchListening).toBe(false)
  })

  it('drops oldest ring entries beyond the cap', () => {
    import.meta.env.DEV = true
    vi.stubGlobal('window', {
      location: { search: '?memoReorderDiag=1' },
      scrollX: 0,
      scrollY: 0,
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
      scrollX: 1,
      scrollY: 2,
    })
    memoReorderDiagSyncRuntime({
      gesturePhase: 'dragging',
      dragging: true,
      activeId: 'id-1',
      timerState: 'idle',
    })
    const snap = getMemoReorderDiagRuntimeSnapshot()
    expect(snap.gesturePhase).toBe('dragging')
    expect(snap.dragging).toBe(true)
    expect(snap.activeId).toBe('id-1')
    expect(snap.timerState).toBe('idle')
    expect(snap.documentTouchListening).toBe(false)
    expect(snap.windowCaptureMounted).toBe(false)
  })
})
