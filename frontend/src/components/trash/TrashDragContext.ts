import { createContext, useContext } from 'react'
import type { TrashDragPayload } from './types'

export type TrashDragContextValue = {
  dragging: boolean
  dragOverTrash: boolean
  insertBeforeId: string | null | undefined
  activeId: string | null
  activeKind: TrashDragPayload['kind'] | null
  trashRef: React.RefObject<HTMLDivElement | null>
  beginDrag: (payload: TrashDragPayload) => void
  moveDrag: (x: number, y: number) => void
  endDrag: (x: number, y: number) => void
  cancelDrag: () => void
  registerItem: (id: string, el: HTMLElement | null) => void
  registerList: (
    kind: TrashDragPayload['kind'],
    ids: string[],
    scope?: string,
  ) => void
}

export const TrashDragContext = createContext<TrashDragContextValue | null>(null)

export function useTrashDrag() {
  const ctx = useContext(TrashDragContext)
  if (!ctx) throw new Error('useTrashDrag must be used within TrashDragProvider')
  return ctx
}

/** Null outside TrashDragProvider (e.g. scroll-to-top on pages without trash). */
export function useTrashDragOptional() {
  return useContext(TrashDragContext)
}
