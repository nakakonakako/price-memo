import { describe, expect, it } from 'vitest'
import {
  MEMO_REORDER_DRAG_ACTIVATION_PX,
  MEMO_REORDER_STEP_SWIPE_MIN_PX,
  shouldActivateDrag,
  shouldStepSwipeOnRelease,
} from './memoMobileReorderGesture'

describe('memo mobile reorder gesture thresholds', () => {
  it('allows one-step swipe between step min and drag activation', () => {
    const dy = MEMO_REORDER_STEP_SWIPE_MIN_PX + 4
    expect(dy).toBeLessThan(MEMO_REORDER_DRAG_ACTIVATION_PX)
    expect(shouldActivateDrag(0, dy)).toBe(false)
    expect(shouldStepSwipeOnRelease(0, dy)).toBe(true)
    expect(shouldStepSwipeOnRelease(0, -dy)).toBe(true)
  })

  it('enters drag at activation distance but not step swipe', () => {
    expect(shouldActivateDrag(0, MEMO_REORDER_DRAG_ACTIVATION_PX)).toBe(true)
    expect(
      shouldStepSwipeOnRelease(0, MEMO_REORDER_DRAG_ACTIVATION_PX),
    ).toBe(false)
  })

  it('ignores movement below step minimum', () => {
    const dy = MEMO_REORDER_STEP_SWIPE_MIN_PX - 1
    expect(shouldStepSwipeOnRelease(0, dy)).toBe(false)
    expect(shouldActivateDrag(0, dy)).toBe(false)
  })

  it('ignores diagonal and horizontal-dominant swipes', () => {
    const dy = MEMO_REORDER_STEP_SWIPE_MIN_PX + 4
    expect(shouldStepSwipeOnRelease(dy, dy)).toBe(false)
    expect(shouldActivateDrag(dy, dy)).toBe(false)
    expect(shouldStepSwipeOnRelease(40, 10)).toBe(false)
    expect(shouldActivateDrag(40, 10)).toBe(false)
  })
})
