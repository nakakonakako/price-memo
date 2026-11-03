import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MEMO_REORDER_DIAG_MOVE_SAMPLE_INTERVAL_MS,
  MEMO_REORDER_DIAG_RING_MAX,
  MEMO_REORDER_DIAG_TIMELINE_MAX,
  bumpMemoReorderDiagRawCounter,
  formatMemoReorderDiagCounterLine,
  formatMemoReorderDiagRingLine,
  getMemoReorderDiagMergedTimeline,
  getMemoReorderDiagRawCounters,
  getMemoReorderDiagRawSamples,
  getMemoReorderDiagRing,
  getMemoReorderDiagRuntimeSnapshot,
  isMemoReorderDiagEnabled,
  memoReorderDiagDocumentTouchEntry,
  memoReorderDiagDrag,
  memoReorderDiagListener,
  memoReorderDiagMaybePushWindowTouchMoveSample,
  memoReorderDiagPushRawWindowSample,
  memoReorderDiagScrollEvent,
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
    memoReorderDiagListener(
      'attach',
      'document',
      'touchmove capture=true passive=false; touchend capture=true passive=true; touchcancel capture=true passive=true',
    )
    memoReorderDiagListener('attach', 'card', 'touchstart passive=true bubble')
    memoReorderDiagDrag('cancel', 'docMove:notCancelable', 'folder-x')
    memoReorderDiagListener('detach', 'document', 'testDetach')
    const ring = getMemoReorderDiagRing()
    const docAttach = ring.find(
      (e) => e.kind === 'listenerAttach' && e.reason.startsWith('document:'),
    )
    expect(docAttach?.reason).toContain('passive=false')
    expect(docAttach?.reason).toContain('passive=true')
    expect(
      ring.some(
        (e) =>
          e.kind === 'listenerAttach' &&
          e.reason === 'card:touchstart passive=true bubble',
      ),
    ).toBe(true)
    expect(ring.some((e) => e.kind === 'dragCancel' && e.reason === 'docMove:notCancelable')).toBe(
      true,
    )
    expect(getMemoReorderDiagRuntimeSnapshot().documentTouchListening).toBe(false)
  })

  it('aggregates scroll events without evicting important ring entries', () => {
    import.meta.env.DEV = true
    vi.useFakeTimers()
    const t0 = 1_700_000_000_000
    vi.setSystemTime(t0)
    let scrollY = 0
    vi.stubGlobal('window', {
      location: { search: '?memoReorderDiag=1' },
      get scrollX() {
        return 0
      },
      get scrollY() {
        return scrollY
      },
    })
    memoReorderDiagTouchSessionBegin('folder-a')
    memoReorderDiagTimer('start', 'longPress')
    for (let i = 0; i < 500; i += 1) {
      scrollY = i + 10
      memoReorderDiagScrollEvent()
    }
    const ring = getMemoReorderDiagRing()
    expect(ring.some((e) => e.kind === 'scroll')).toBe(false)
    expect(ring.some((e) => e.kind === 'timerStart' && e.reason === 'longPress')).toBe(true)
    expect(getMemoReorderDiagRawCounters().windowScroll).toBe(500)
    expect(getMemoReorderDiagRawSamples().some((s) => s.kind === 'scroll')).toBe(true)
    vi.useRealTimers()
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

  it('rate-limits raw window touchmove detail samples', () => {
    import.meta.env.DEV = true
    vi.useFakeTimers()
    const t0 = 1_700_000_000_000
    vi.setSystemTime(t0)
    vi.stubGlobal('window', {
      location: { search: '?memoReorderDiag=1' },
      scrollX: 0,
      scrollY: 0,
    })
    memoReorderDiagTouchSessionBegin('folder-a')
    const sampleFields = {
      eventPhase: 2,
      cancelable: true,
      defaultPrevented: false,
      touchIds: '0',
      tag: 'DIV',
      scrollX: 0,
      scrollY: 0,
    }
    memoReorderDiagMaybePushWindowTouchMoveSample(sampleFields)
    expect(getMemoReorderDiagRawSamples()).toHaveLength(1)
    expect(getMemoReorderDiagRawSamples()[0].detail).toMatch(/ph=2.*ids=0/)

    vi.advanceTimersByTime(MEMO_REORDER_DIAG_MOVE_SAMPLE_INTERVAL_MS - 1)
    memoReorderDiagMaybePushWindowTouchMoveSample(sampleFields)
    expect(getMemoReorderDiagRawSamples()).toHaveLength(1)

    vi.advanceTimersByTime(1)
    memoReorderDiagMaybePushWindowTouchMoveSample(sampleFields)
    expect(getMemoReorderDiagRawSamples()).toHaveLength(2)
    vi.useRealTimers()
  })

  it('does not push matched document touchmove into the important ring', () => {
    import.meta.env.DEV = true
    vi.stubGlobal('window', {
      location: { search: '?memoReorderDiag=1' },
      scrollX: 0,
      scrollY: 0,
    })
    memoReorderDiagTouchSessionBegin('folder-a')
    memoReorderDiagTimer('start', 'longPress')
    const touchEventStub = {
      cancelable: true,
      defaultPrevented: true,
      touches: [] as unknown as TouchList,
      changedTouches: [] as unknown as TouchList,
      eventPhase: 2,
    }
    const ctx = {
      trackedTouchId: 0,
      touchIds: '0',
      changedTouchIds: '0',
      outcome: 'proceed' as const,
    }
    for (let i = 0; i < 60; i += 1) {
      memoReorderDiagDocumentTouchEntry('touchmove', touchEventStub, ctx)
      memoReorderDiagTouchEvent('touchmove', 'document:pending', touchEventStub, i, i)
    }
    const ring = getMemoReorderDiagRing()
    expect(ring.some((e) => e.kind === 'touchmove')).toBe(false)
    expect(ring.some((e) => e.kind === 'timerStart' && e.reason === 'longPress')).toBe(true)
    expect(getMemoReorderDiagRawCounters().docTouchmove).toBe(60)
    expect(getMemoReorderDiagRawSamples().some((s) => s.source === 'handler')).toBe(true)
  })

  it('merges ring and raw samples into chronological timeline', () => {
    import.meta.env.DEV = true
    vi.stubGlobal('window', {
      location: { search: '?memoReorderDiag=1' },
      scrollX: 0,
      scrollY: 0,
    })
    memoReorderDiagTouchSessionBegin('folder-a')
    memoReorderDiagTimer('start', 'longPress')
    memoReorderDiagPushRawWindowSample({
      source: 'window',
      kind: 'touchstart',
      eventPhase: 2,
      cancelable: true,
      defaultPrevented: false,
      touchIds: '0',
      tag: 'DIV',
      scrollX: 0,
      scrollY: 0,
    })
    memoReorderDiagTimer('fire', 'longPress')
    const merged = getMemoReorderDiagMergedTimeline(100)
    for (let i = 1; i < merged.length; i += 1) {
      expect(merged[i].seq).toBeGreaterThan(merged[i - 1].seq)
    }
    expect(merged.some((item) => item.line.includes('raw/window:touchstart'))).toBe(true)
    expect(merged.some((item) => item.line.includes('timerFire/longPress'))).toBe(true)
    expect(getMemoReorderDiagMergedTimeline().length).toBeLessThanOrEqual(
      MEMO_REORDER_DIAG_TIMELINE_MAX,
    )
  })
})
