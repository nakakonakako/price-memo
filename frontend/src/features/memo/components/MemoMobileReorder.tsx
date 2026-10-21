import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import {
  MobileReorderContext,
  useMobileReorder,
} from './MemoMobileReorderContext'
import {
  shouldActivateDrag,
  shouldStepSwipeOnRelease,
} from './memoMobileReorderGesture'

type ItemRect = {
  id: string
  top: number
  bottom: number
  midY: number
}

type ProviderProps = {
  children: ReactNode
  folderIds: string[]
  disabled?: boolean
  onCommit: (draggedId: string, beforeId: string | null) => void | Promise<void>
  onAnnounce?: (message: string) => void
}

export function MemoMobileReorderProvider({
  children,
  folderIds,
  disabled = false,
  onCommit,
  onAnnounce,
}: ProviderProps) {
  const itemElsRef = useRef(new Map<string, HTMLElement>())
  const idsRef = useRef(folderIds)
  useEffect(() => {
    idsRef.current = folderIds
  }, [folderIds])

  const [dragging, setDragging] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [activePlaceholderHeight, setActivePlaceholderHeight] = useState<
    number | null
  >(null)
  const [insertBeforeId, setInsertBeforeId] = useState<
    string | null | undefined
  >(undefined)
  const insertBeforeIdRef = useRef<string | null | undefined>(undefined)

  const setInsertTarget = useCallback((next: string | null | undefined) => {
    insertBeforeIdRef.current = next
    setInsertBeforeId(next)
  }, [])

  const registerItem = useCallback((id: string, el: HTMLElement | null) => {
    if (el) itemElsRef.current.set(id, el)
    else itemElsRef.current.delete(id)
  }, [])

  const collectRects = useCallback((ids: string[], skipId: string): ItemRect[] => {
    const rects: ItemRect[] = []
    for (const id of ids) {
      if (id === skipId) continue
      const el = itemElsRef.current.get(id)
      if (!el) continue
      const r = el.getBoundingClientRect()
      if (r.height === 0) continue
      rects.push({
        id,
        top: r.top,
        bottom: r.bottom,
        midY: r.top + r.height / 2,
      })
    }
    return rects
  }, [])

  const resolveInsertBefore = useCallback(
    (y: number, draggedId: string): string | null | undefined => {
      const ids = idsRef.current
      const rects = collectRects(ids, draggedId)
      if (rects.length === 0) return null
      for (const r of rects) {
        if (y < r.midY) return r.id
      }
      return null
    },
    [collectRects],
  )

  const finishDrag = useCallback(
    async (draggedId: string) => {
      const before = insertBeforeIdRef.current
      setDragging(false)
      setActiveId(null)
      setActivePlaceholderHeight(null)
      setInsertTarget(undefined)
      if (before === undefined) return
      await onCommit(draggedId, before)
    },
    [onCommit, setInsertTarget],
  )

  const cancelDrag = useCallback(() => {
    setDragging(false)
    setActiveId(null)
    setActivePlaceholderHeight(null)
    setInsertTarget(undefined)
  }, [setInsertTarget])

  const dragSessionRef = useRef({
    active: false,
    moved: false,
    folderId: '',
    startX: 0,
    startY: 0,
    offsetX: 0,
    offsetY: 0,
    width: 0,
    height: 0,
    pointerId: -1,
    liftEl: null as HTMLDivElement | null,
  })

  const beginHandleDrag = useCallback(
    (
      folderId: string,
      pointerId: number,
      clientX: number,
      clientY: number,
      handleEl: HTMLElement,
      cardEl: HTMLElement,
    ) => {
      if (disabled) return
      const rect = cardEl.getBoundingClientRect()
      dragSessionRef.current = {
        active: true,
        moved: false,
        folderId,
        startX: clientX,
        startY: clientY,
        offsetX: clientX - rect.left,
        offsetY: clientY - rect.top,
        width: rect.width,
        height: rect.height,
        pointerId,
        liftEl: null,
      }
      handleEl.setPointerCapture(pointerId)
    },
    [disabled],
  )

  const moveHandleDrag = useCallback(
    (clientX: number, clientY: number) => {
      const s = dragSessionRef.current
      if (!s.active) return
      const dx = clientX - s.startX
      const dy = clientY - s.startY
      if (!s.moved) {
        if (!shouldActivateDrag(dx, dy)) return
        s.moved = true
        setDragging(true)
        setActiveId(s.folderId)
        setActivePlaceholderHeight(s.height)
        setInsertTarget(resolveInsertBefore(clientY, s.folderId))
      } else {
        setInsertTarget(resolveInsertBefore(clientY, s.folderId))
      }
    },
    [resolveInsertBefore, setInsertTarget],
  )

  const requestStepMove = useCallback(
    (folderId: string, direction: 'up' | 'down' | 'start' | 'end') => {
      if (disabled) return
      const ids = idsRef.current
      const index = ids.indexOf(folderId)
      if (index < 0) return
      let beforeId: string | null
      switch (direction) {
        case 'up':
          if (index === 0) return
          beforeId = ids[index - 1]
          break
        case 'down':
          if (index >= ids.length - 1) return
          beforeId =
            index + 2 < ids.length ? ids[index + 2] : null
          break
        case 'start':
          if (index === 0) return
          beforeId = ids[0]
          break
        case 'end':
          if (index === ids.length - 1) return
          beforeId = null
          break
      }
      void onCommit(folderId, beforeId)
    },
    [disabled, onCommit],
  )

  const endHandleDrag = useCallback(
    async (clientX: number, clientY: number) => {
      const s = dragSessionRef.current
      if (!s.active) return
      const { folderId, moved, startX, startY } = s
      s.active = false
      if (!moved) {
        const dx = clientX - startX
        const dy = clientY - startY
        if (shouldStepSwipeOnRelease(dx, dy)) {
          const direction = dy < 0 ? 'up' : 'down'
          requestStepMove(folderId, direction)
        }
        return
      }
      await finishDrag(folderId)
    },
    [finishDrag, requestStepMove],
  )

  const cancelHandleDrag = useCallback(() => {
    if (dragSessionRef.current.moved) cancelDrag()
    dragSessionRef.current.active = false
    dragSessionRef.current.moved = false
  }, [cancelDrag])

  const announce = useCallback(
    (message: string) => {
      onAnnounce?.(message)
    },
    [onAnnounce],
  )

  const value = useMemo(
    () => ({
      registerItem,
      insertBeforeId,
      activeId,
      dragging,
      activePlaceholderHeight,
      requestStepMove,
      announce,
    }),
    [
      registerItem,
      insertBeforeId,
      activeId,
      dragging,
      activePlaceholderHeight,
      requestStepMove,
      announce,
    ],
  )

  return (
    <MobileReorderContext.Provider value={value}>
      <HandleDragController
        beginHandleDrag={beginHandleDrag}
        moveHandleDrag={moveHandleDrag}
        endHandleDrag={endHandleDrag}
        cancelHandleDrag={cancelHandleDrag}
      >
        {children}
      </HandleDragController>
    </MobileReorderContext.Provider>
  )
}

type HandleDragControllerProps = {
  beginHandleDrag: (
    folderId: string,
    pointerId: number,
    clientX: number,
    clientY: number,
    handleEl: HTMLElement,
    cardEl: HTMLElement,
  ) => void
  moveHandleDrag: (clientX: number, clientY: number) => void
  endHandleDrag: (clientX: number, clientY: number) => Promise<void>
  cancelHandleDrag: () => void
}

const HandleDragControllerContext = createContext<HandleDragControllerProps | null>(
  null,
)

function HandleDragController({
  children,
  ...handlers
}: HandleDragControllerProps & { children: ReactNode }) {
  return (
    <HandleDragControllerContext.Provider value={handlers}>
      {children}
    </HandleDragControllerContext.Provider>
  )
}

function useHandleDragController() {
  const ctx = useContext(HandleDragControllerContext)
  if (!ctx) throw new Error('HandleDragController missing')
  return ctx
}

export function MemoMobileReorderLiveRegion({ message }: { message: string }) {
  return (
    <div className="sr-only" aria-live="polite" aria-atomic="true">
      {message}
    </div>
  )
}

export function MemoMobileReorderInsertMarker({ folderId }: { folderId: string }) {
  const { insertBeforeId, activeId, dragging } = useMobileReorder()
  if (!dragging || activeId === folderId) return null
  if (insertBeforeId !== folderId) return null
  return <div className="h-1 rounded-full bg-stone-800" aria-hidden />
}

export function MemoMobileReorderEndMarker({ lastId }: { lastId: string | null }) {
  const { insertBeforeId, activeId, dragging } = useMobileReorder()
  if (!dragging || lastId == null) return null
  if (insertBeforeId !== null) return null
  if (activeId === lastId) return null
  return <div className="h-1 rounded-full bg-stone-800" aria-hidden />
}

type HandleProps = {
  folderId: string
  folderName: string
  cardRootRef: RefObject<HTMLElement | null>
  index: number
  total: number
  disabled?: boolean
}

export function MemoMobileReorderHandle({
  folderId,
  folderName,
  cardRootRef,
  index,
  total,
  disabled = false,
}: HandleProps) {
  const { activeId, dragging, requestStepMove } = useMobileReorder()
  const {
    beginHandleDrag,
    moveHandleDrag,
    endHandleDrag,
    cancelHandleDrag,
  } = useHandleDragController()

  const [liftStyle, setLiftStyle] = useState<CSSProperties | null>(null)
  const dragOffsetYRef = useRef(0)

  const isDragging = activeId === folderId && dragging

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    const cardEl = cardRootRef.current
    if (disabled || e.button > 0 || !cardEl) return
    e.stopPropagation()
    const rect = cardEl.getBoundingClientRect()
    dragOffsetYRef.current = e.clientY - rect.top
    beginHandleDrag(
      folderId,
      e.pointerId,
      e.clientX,
      e.clientY,
      e.currentTarget,
      cardEl,
    )
  }

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    moveHandleDrag(e.clientX, e.clientY)
    const cardEl = cardRootRef.current
    if (activeId === folderId && dragging && cardEl) {
      const rect = cardEl.getBoundingClientRect()
      setLiftStyle({
        position: 'fixed',
        left: rect.left,
        top: e.clientY - dragOffsetYRef.current,
        width: rect.width,
        zIndex: 70,
        pointerEvents: 'none',
        margin: 0,
      })
    }
  }

  const onPointerUp = async (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    await endHandleDrag(e.clientX, e.clientY)
    setLiftStyle(null)
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* released */
    }
  }

  const onPointerCancel = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    cancelHandleDrag()
    setLiftStyle(null)
  }

  const stopActivationClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    e.preventDefault()
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return
    let direction: 'up' | 'down' | 'start' | 'end' | null = null
    if (e.key === 'ArrowUp' && e.shiftKey) direction = 'start'
    else if (e.key === 'ArrowDown' && e.shiftKey) direction = 'end'
    else if (e.key === 'ArrowUp') direction = 'up'
    else if (e.key === 'ArrowDown') direction = 'down'
    if (!direction) return
    e.preventDefault()
    e.stopPropagation()
    requestStepMove(folderId, direction)
  }

  const liftPreview =
    isDragging && liftStyle
      ? createPortal(
          <div
            className="select-none shadow-xl ring-2 ring-stone-400 overflow-hidden rounded-lg"
            style={liftStyle}
            aria-hidden
          >
            <div className="h-10 bg-stone-100/90 px-3 py-2.5 text-sm font-semibold text-stone-900">
              {folderName}
            </div>
          </div>,
          document.body,
        )
      : null

  return (
    <>
      <button
        type="button"
        data-no-trash-drag
        disabled={disabled}
        aria-label={`${folderName}の並べ替え`}
        aria-keyshortcuts="ArrowUp ArrowDown Shift+ArrowUp Shift+ArrowDown"
        aria-describedby={`memo-reorder-hint-${folderId}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => void onPointerUp(e)}
        onPointerCancel={onPointerCancel}
        onClick={stopActivationClick}
        onKeyDown={onKeyDown}
        className="touch-none flex h-11 w-11 shrink-0 items-center justify-center rounded text-stone-400 hover:bg-black/5 hover:text-stone-600 disabled:opacity-40"
      >
        <GripIcon />
        <span id={`memo-reorder-hint-${folderId}`} className="sr-only">
          {`位置 ${index + 1} / ${total}。ドラッグ、または上下キーで移動。Shift+上下で先頭・末尾。`}
        </span>
      </button>
      {liftPreview}
    </>
  )
}

export function MemoMobileReorderItemRegistrar({
  folderId,
  rootRef,
}: {
  folderId: string
  rootRef: HTMLElement | null
}) {
  const { registerItem } = useMobileReorder()
  useEffect(() => {
    registerItem(folderId, rootRef)
    return () => registerItem(folderId, null)
  }, [folderId, rootRef, registerItem])
  return null
}

function GripIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden
    >
      <circle cx="7" cy="5" r="1.5" />
      <circle cx="13" cy="5" r="1.5" />
      <circle cx="7" cy="10" r="1.5" />
      <circle cx="13" cy="10" r="1.5" />
      <circle cx="7" cy="15" r="1.5" />
      <circle cx="13" cy="15" r="1.5" />
    </svg>
  )
}
