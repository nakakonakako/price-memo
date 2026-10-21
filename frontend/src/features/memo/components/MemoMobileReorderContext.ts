import { createContext, useContext } from 'react'

export type MemoReorderGesturePhase = 'idle' | 'longPressPending' | 'dragging'

export type MobileReorderContextValue = {
  registerItem: (id: string, el: HTMLElement | null) => void
  insertBeforeId: string | null | undefined
  activeId: string | null
  dragging: boolean
  /** All list rows use compact chrome while any row is dragged */
  compactListDisplay: boolean
  gesturePhase: MemoReorderGesturePhase
  /** Compact list-row height (px) for the lifted item placeholder */
  activePlaceholderHeight: number | null
  requestStepMove: (
    folderId: string,
    direction: 'up' | 'down' | 'start' | 'end',
  ) => void
  announce: (message: string) => void
  cancelPendingLongPress: () => void
  isSwipeDeleteBlocked: () => boolean
  shouldSuppressCardClick: () => boolean
}

export const MobileReorderContext =
  createContext<MobileReorderContextValue | null>(null)

export function useMobileReorder() {
  const ctx = useContext(MobileReorderContext)
  if (!ctx) throw new Error('useMobileReorder must be used within provider')
  return ctx
}

export function useMobileReorderOptional() {
  return useContext(MobileReorderContext)
}
