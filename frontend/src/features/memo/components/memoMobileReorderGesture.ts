/** Hold still this long on a card body to start reorder drag. */
export const MEMO_REORDER_LONG_PRESS_MS = 350
/** Fallback lifted-row placeholder height when no sibling row is measurable. */
export const MEMO_REORDER_COMPACT_ROW_FALLBACK_PX = 56
/** Movement before long-press completes cancels the hold (scroll / swipe win). */
export const MEMO_REORDER_LONG_PRESS_MOVE_CANCEL_PX = 10
/** Movement required after long-press to enter free drag (vertical-dominant). */
export const MEMO_REORDER_DRAG_ACTIVATION_PX = 8

function isVerticalDominant(dx: number, dy: number): boolean {
  return Math.abs(dy) > Math.abs(dx)
}

export function shouldCancelLongPress(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) > MEMO_REORDER_LONG_PRESS_MOVE_CANCEL_PX
}

export function shouldActivateDrag(dx: number, dy: number): boolean {
  return (
    isVerticalDominant(dx, dy) &&
    Math.abs(dy) >= MEMO_REORDER_DRAG_ACTIVATION_PX
  )
}

export function isInteractiveReorderTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    !!target.closest(
      'button, input, select, textarea, a, label, form, [data-no-trash-drag], [data-memo-reorder-a11y]',
    )
  )
}
