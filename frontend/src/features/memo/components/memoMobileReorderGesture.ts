/** Min predominantly-vertical movement on release to move one step (drag not entered). */
export const MEMO_REORDER_STEP_SWIPE_MIN_PX = 16
/** Movement required to enter free drag (must exceed step swipe band). */
export const MEMO_REORDER_DRAG_ACTIVATION_PX = 36

function isVerticalDominant(dx: number, dy: number): boolean {
  return Math.abs(dy) > Math.abs(dx)
}

export function shouldActivateDrag(dx: number, dy: number): boolean {
  return (
    isVerticalDominant(dx, dy) &&
    Math.abs(dy) >= MEMO_REORDER_DRAG_ACTIVATION_PX
  )
}

export function shouldStepSwipeOnRelease(dx: number, dy: number): boolean {
  const absDy = Math.abs(dy)
  return (
    isVerticalDominant(dx, dy) &&
    absDy >= MEMO_REORDER_STEP_SWIPE_MIN_PX &&
    absDy < MEMO_REORDER_DRAG_ACTIVATION_PX
  )
}
