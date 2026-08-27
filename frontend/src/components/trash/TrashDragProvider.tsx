import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { DragEndResult, TrashDragPayload } from './types'

type ItemRect = {
  id: string
  top: number
  bottom: number
  left: number
  right: number
  midX: number
  midY: number
}

type TrashDragContextValue = {
  dragging: boolean
  dragOverTrash: boolean
  insertBeforeId: string | null | undefined
  activeId: string | null
  activeKind: TrashDragPayload['kind'] | null
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

const TrashDragContext = createContext<TrashDragContextValue | null>(null)

export function useTrashDrag() {
  const ctx = useContext(TrashDragContext)
  if (!ctx) throw new Error('useTrashDrag must be used within TrashDragProvider')
  return ctx
}

function listKey(kind: TrashDragPayload['kind'], scope?: string) {
  return scope ? `${kind}:${scope}` : kind
}

function keyForPayload(payload: TrashDragPayload) {
  if (payload.kind === 'folder-record') {
    return listKey(payload.kind, payload.folderId)
  }
  return listKey(payload.kind)
}

type Props = {
  children: ReactNode
  onDragEnd: (result: DragEndResult) => void | Promise<void>
  /** memo = large easy drop target; folder = compact */
  trashSize?: 'memo' | 'folder'
}

export function TrashDragProvider({
  children,
  onDragEnd,
  trashSize = 'folder',
}: Props) {
  const trashRef = useRef<HTMLDivElement>(null)
  const payloadRef = useRef<TrashDragPayload | null>(null)
  const itemElsRef = useRef(new Map<string, HTMLElement>())
  const listsRef = useRef(new Map<string, string[]>())

  const [dragging, setDragging] = useState(false)
  const [dragOverTrash, setDragOverTrash] = useState(false)
  const [insertBeforeId, setInsertBeforeId] = useState<
    string | null | undefined
  >(undefined)
  const insertBeforeIdRef = useRef<string | null | undefined>(undefined)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [activeKind, setActiveKind] = useState<TrashDragPayload['kind'] | null>(
    null,
  )
  const largeTrash = trashSize === 'memo'

  const setInsertTarget = useCallback((next: string | null | undefined) => {
    insertBeforeIdRef.current = next
    setInsertBeforeId(next)
  }, [])

  const isOverTrash = useCallback(
    (x: number, y: number) => {
      const el = trashRef.current
      if (!el) return false
      const rect = el.getBoundingClientRect()
      const pad = largeTrash ? 40 : 12
      return (
        x >= rect.left - pad &&
        x <= rect.right + pad &&
        y >= rect.top - pad &&
        y <= rect.bottom + pad
      )
    },
    [largeTrash],
  )

  const collectRects = useCallback((ids: string[]): ItemRect[] => {
    const rects: ItemRect[] = []
    for (const id of ids) {
      if (id === payloadRef.current?.id) continue
      const el = itemElsRef.current.get(id)
      if (!el) continue
      const r = el.getBoundingClientRect()
      if (r.height === 0) continue
      rects.push({
        id,
        top: r.top,
        bottom: r.bottom,
        left: r.left,
        right: r.right,
        midX: r.left + r.width / 2,
        midY: r.top + r.height / 2,
      })
    }
    return rects
  }, [])

  const resolveInsertBefore = useCallback(
    (x: number, y: number): string | null | undefined => {
      const payload = payloadRef.current
      if (!payload) return undefined
      const ids = listsRef.current.get(keyForPayload(payload))
      if (!ids) return undefined
      const rects = collectRects(ids)
      if (rects.length === 0) return null
      const grid = payload.kind === 'folder'
      for (const r of rects) {
        if (grid) {
          if (y < r.midY) return r.id
          if (y <= r.bottom && x < r.midX) return r.id
        } else if (y < r.midY) {
          return r.id
        }
      }
      return null
    },
    [collectRects],
  )

  const beginDrag = useCallback(
    (payload: TrashDragPayload) => {
      payloadRef.current = payload
      setActiveId(payload.id)
      setActiveKind(payload.kind)
      setDragging(true)
      setDragOverTrash(false)
      setInsertTarget(undefined)
    },
    [setInsertTarget],
  )

  const moveDrag = useCallback(
    (x: number, y: number) => {
      const over = isOverTrash(x, y)
      setDragOverTrash(over)
      if (over) {
        setInsertTarget(undefined)
        return
      }
      setInsertTarget(resolveInsertBefore(x, y))
    },
    [isOverTrash, resolveInsertBefore, setInsertTarget],
  )

  const finishDrag = useCallback(
    async (x: number, y: number) => {
      const payload = payloadRef.current
      const over = isOverTrash(x, y)
      const before = insertBeforeIdRef.current
      payloadRef.current = null
      setDragging(false)
      setDragOverTrash(false)
      setInsertTarget(undefined)
      setActiveId(null)
      setActiveKind(null)
      if (!payload) return
      if (over) {
        await onDragEnd({ action: 'delete', payload })
        return
      }
      if (before !== undefined) {
        await onDragEnd({ action: 'reorder', payload, beforeId: before })
        return
      }
      await onDragEnd({ action: 'cancel', payload })
    },
    [isOverTrash, onDragEnd, setInsertTarget],
  )

  const cancelDrag = useCallback(() => {
    const payload = payloadRef.current
    payloadRef.current = null
    setDragging(false)
    setDragOverTrash(false)
    setInsertTarget(undefined)
    setActiveId(null)
    setActiveKind(null)
    if (payload) void onDragEnd({ action: 'cancel', payload })
  }, [onDragEnd, setInsertTarget])

  const registerItem = useCallback((id: string, el: HTMLElement | null) => {
    if (el) itemElsRef.current.set(id, el)
    else itemElsRef.current.delete(id)
  }, [])

  const registerList = useCallback(
    (kind: TrashDragPayload['kind'], ids: string[], scope?: string) => {
      listsRef.current.set(listKey(kind, scope), ids)
    },
    [],
  )

  const value = useMemo(
    () => ({
      dragging,
      dragOverTrash,
      insertBeforeId,
      activeId,
      activeKind,
      beginDrag,
      moveDrag,
      endDrag: finishDrag,
      cancelDrag,
      registerItem,
      registerList,
    }),
    [
      dragging,
      dragOverTrash,
      insertBeforeId,
      activeId,
      activeKind,
      beginDrag,
      moveDrag,
      finishDrag,
      cancelDrag,
      registerItem,
      registerList,
    ],
  )

  return (
    <TrashDragContext.Provider value={value}>
      {children}

      <div
        ref={trashRef}
        aria-label="ゴミ箱"
        className={`pointer-events-none fixed z-50 transition-transform duration-150 ${
          largeTrash
            ? 'bottom-0 right-0 p-2 sm:bottom-2 sm:right-2'
            : 'bottom-3 right-3 sm:bottom-5 sm:right-5'
        } ${dragOverTrash ? 'scale-110' : 'scale-100'}`}
      >
        <div
          className={`rounded-full transition-colors ${
            dragOverTrash ? 'bg-red-100/90' : 'bg-white/70'
          } ${largeTrash ? 'p-4' : 'p-2'}`}
        >
          <img
            src="/trashbox.png"
            alt=""
            draggable={false}
            className={`select-none object-contain ${
              largeTrash
                ? 'h-40 w-40 sm:h-52 sm:w-52'
                : 'h-24 w-24 sm:h-32 sm:w-32'
            }`}
          />
        </div>
      </div>
    </TrashDragContext.Provider>
  )
}
