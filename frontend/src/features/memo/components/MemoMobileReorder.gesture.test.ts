// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  MEMO_REORDER_LONG_PRESS_MOVE_CANCEL_PX,
  MEMO_REORDER_LONG_PRESS_MS,
  isInteractiveReorderTarget,
  shouldActivateDrag,
  shouldCancelLongPress,
} from './memoMobileReorderGesture'

describe('memo mobile reorder gesture thresholds', () => {
  it('exposes adjustable long-press timing and cancel distance', () => {
    expect(MEMO_REORDER_LONG_PRESS_MS).toBe(350)
    expect(MEMO_REORDER_LONG_PRESS_MOVE_CANCEL_PX).toBeGreaterThan(0)
  })

  it('cancels long press when finger moves beyond threshold', () => {
    const d = MEMO_REORDER_LONG_PRESS_MOVE_CANCEL_PX + 1
    expect(shouldCancelLongPress(d, 0)).toBe(true)
    expect(shouldCancelLongPress(0, d)).toBe(true)
    expect(shouldCancelLongPress(2, 2)).toBe(false)
  })

  it('activates drag on small vertical move after long press', () => {
    expect(shouldActivateDrag(0, 8)).toBe(true)
    expect(shouldActivateDrag(20, 4)).toBe(false)
  })

  it('allows long-press reorder from card title toggle regions', () => {
    document.body.innerHTML =
      '<div data-memo-card-toggle><span id="title">A</span></div>'
    const title = document.getElementById('title')
    expect(isInteractiveReorderTarget(title)).toBe(false)
  })
})
