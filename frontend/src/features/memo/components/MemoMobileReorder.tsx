import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal, flushSync } from 'react-dom'
import {
  MobileReorderContext,
  useMobileReorder,
  type MemoReorderGesturePhase,
} from './MemoMobileReorderContext'
import {
  isInteractiveReorderTarget,
  shouldCancelLongPress,
  MEMO_REORDER_COMPACT_ROW_FALLBACK_PX,
  MEMO_REORDER_LONG_PRESS_MS,
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

type CardGestureApi = {
  attachCardGesture: (
    folderId: string,
    surfaceEl: HTMLElement,
    cardEl: HTMLElement,
  ) => void
  detachCardGesture: (folderId: string, surfaceEl: HTMLElement) => void
}

const CardGestureContext = createContext<CardGestureApi | null>(null)

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
  const [gesturePhase, setGesturePhase] =
    useState<MemoReorderGesturePhase>('idle')
  const [activePlaceholderHeight, setActivePlaceholderHeight] = useState<
    number | null
  >(null)
  const [insertBeforeId, setInsertBeforeId] = useState<
    string | null | undefined
  >(undefined)
  const [liftPreview, setLiftPreview] = useState<{
    top: number
    left: number
    width: number
    title: string
  } | null>(null)
  const insertBeforeIdRef = useRef<string | null | undefined>(undefined)
  const suppressClickUntilRef = useRef(0)
  /** List-item viewport top captured at drag start (before compact layout). */
  const scrollAnchorViewportTopRef = useRef<number | null>(null)

  const setInsertTarget = useCallback((next: string | null | undefined) => {
    insertBeforeIdRef.current = next
    setInsertBeforeId(next)
  }, [])

  const registerItem = useCallback((id: string, el: HTMLElement | null) => {
    if (el) itemElsRef.current.set(id, el)
    else itemElsRef.current.delete(id)
  }, [])

  const measureCompactRowHeight = useCallback((activeRowId: string): number => {
    const ids = idsRef.current
    for (const id of ids) {
      if (id === activeRowId) continue
      const el = itemElsRef.current.get(id)
      if (!el) continue
      const h = el.getBoundingClientRect().height
      if (h > 0) return h
    }
    return MEMO_REORDER_COMPACT_ROW_FALLBACK_PX
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
      setGesturePhase('idle')
      setActivePlaceholderHeight(null)
      scrollAnchorViewportTopRef.current = null
      setInsertTarget(undefined)
      setLiftPreview(null)
      suppressClickUntilRef.current = Date.now() + 400
      if (before === undefined) return
      await onCommit(draggedId, before)
    },
    [onCommit, setInsertTarget],
  )

  const cancelDrag = useCallback(() => {
    setDragging(false)
    setActiveId(null)
    setGesturePhase('idle')
    setActivePlaceholderHeight(null)
    scrollAnchorViewportTopRef.current = null
    setInsertTarget(undefined)
    setLiftPreview(null)
    suppressClickUntilRef.current = Date.now() + 400
  }, [setInsertTarget])

  const touchSessionRef = useRef({
    folderId: '',
    cardEl: null as HTMLElement | null,
    touchId: -1,
    startX: 0,
    startY: 0,
    lastClientY: 0,
    longPressTimer: null as ReturnType<typeof setTimeout> | null,
    dragActive: false,
    offsetY: 0,
    height: 0,
    width: 0,
  })

  const clearLongPressTimer = useCallback(() => {
    const s = touchSessionRef.current
    if (s.longPressTimer != null) {
      clearTimeout(s.longPressTimer)
      s.longPressTimer = null
    }
  }, [])

  const resetTouchSession = useCallback(() => {
    clearLongPressTimer()
    touchSessionRef.current = {
      folderId: '',
      cardEl: null,
      touchId: -1,
      startX: 0,
      startY: 0,
      lastClientY: 0,
      longPressTimer: null,
      dragActive: false,
      offsetY: 0,
      height: 0,
      width: 0,
    }
    setGesturePhase('idle')
  }, [clearLongPressTimer])

  const cancelPendingLongPress = useCallback(() => {
    if (touchSessionRef.current.dragActive) return
    clearLongPressTimer()
    touchSessionRef.current.touchId = -1
    setGesturePhase('idle')
  }, [clearLongPressTimer])

  const isSwipeDeleteBlocked = useCallback(() => {
    return touchSessionRef.current.dragActive || dragging
  }, [dragging])

  const shouldSuppressCardClick = useCallback(() => {
    return Date.now() < suppressClickUntilRef.current
  }, [])

  const syncLiftPreview = useCallback((cardEl: HTMLElement, clientY: number) => {
    const rect = cardEl.getBoundingClientRect()
    const s = touchSessionRef.current
    const titleEl = cardEl.querySelector('[data-memo-compact-title]')
    const title =
      titleEl instanceof HTMLElement ? titleEl.textContent?.trim() ?? '' : ''
    setLiftPreview({
      left: rect.left,
      top: clientY - s.offsetY,
      width: s.width || rect.width,
      title,
    })
  }, [])

  const applyCompactDragLayout = useCallback(
    (folderId: string, clientY: number) => {
      const compactHeight = measureCompactRowHeight(folderId)
      flushSync(() => {
        setActivePlaceholderHeight(compactHeight)
      })

      const anchorBefore = scrollAnchorViewportTopRef.current
      const activeEl = itemElsRef.current.get(folderId)
      if (anchorBefore != null && activeEl) {
        const anchorAfter = activeEl.getBoundingClientRect().top
        const scrollDelta = anchorAfter - anchorBefore
        if (Math.abs(scrollDelta) >= 1) {
          window.scrollBy({ top: scrollDelta, left: 0 })
        }
        scrollAnchorViewportTopRef.current = null
      }

      setInsertTarget(resolveInsertBefore(clientY, folderId))
    },
    [measureCompactRowHeight, resolveInsertBefore, setInsertTarget],
  )

  const activateDragFromLongPress = useCallback(
    (folderId: string, cardEl: HTMLElement, clientY: number) => {
      const rect = cardEl.getBoundingClientRect()
      const s = touchSessionRef.current
      s.dragActive = true
      s.offsetY = clientY - rect.top
      s.lastClientY = clientY
      s.height = rect.height
      s.width = rect.width
      scrollAnchorViewportTopRef.current = rect.top
      flushSync(() => {
        setGesturePhase('dragging')
        setDragging(true)
        setActiveId(folderId)
        setActivePlaceholderHeight(null)
      })
      applyCompactDragLayout(folderId, clientY)
      syncLiftPreview(cardEl, clientY)
    },
    [applyCompactDragLayout, syncLiftPreview],
  )

  const moveActiveDrag = useCallback(
    (clientY: number) => {
      const s = touchSessionRef.current
      if (!s.dragActive || !s.folderId || !s.cardEl) return
      s.lastClientY = clientY
      setInsertTarget(resolveInsertBefore(clientY, s.folderId))
      syncLiftPreview(s.cardEl, clientY)
    },
    [resolveInsertBefore, setInsertTarget, syncLiftPreview],
  )

  const endActiveDrag = useCallback(async () => {
    const s = touchSessionRef.current
    if (!s.dragActive || !s.folderId) {
      resetTouchSession()
      return
    }
    const folderId = s.folderId
    resetTouchSession()
    await finishDrag(folderId)
  }, [finishDrag, resetTouchSession])

  const cancelActiveDrag = useCallback(() => {
    if (touchSessionRef.current.dragActive) cancelDrag()
    resetTouchSession()
  }, [cancelDrag, resetTouchSession])

  const cardBindingsRef = useRef(
    new Map<
      string,
      {
        surfaceEl: HTMLElement
        cardEl: HTMLElement
        handlers: {
          touchstart: (e: TouchEvent) => void
          touchmove: (e: TouchEvent) => void
          touchend: (e: TouchEvent) => void
          touchcancel: (e: TouchEvent) => void
        }
      }
    >(),
  )

  const attachCardGesture = useCallback(
    (folderId: string, surfaceEl: HTMLElement, cardEl: HTMLElement) => {
      if (disabled) return

      const existingKey = `${folderId}:${surfaceEl}`
      const existing = cardBindingsRef.current.get(existingKey)
      if (existing) {
        const { handlers } = existing
        surfaceEl.removeEventListener('touchstart', handlers.touchstart)
        surfaceEl.removeEventListener('touchmove', handlers.touchmove)
        surfaceEl.removeEventListener('touchend', handlers.touchend)
        surfaceEl.removeEventListener('touchcancel', handlers.touchcancel)
        cardBindingsRef.current.delete(existingKey)
      }

      const onTouchStart = (e: TouchEvent) => {
        if (disabled || e.touches.length !== 1) return
        if (isInteractiveReorderTarget(e.target)) return
        if (isSwipeDeleteBlocked()) return

        const touch = e.touches[0]
        clearLongPressTimer()
        touchSessionRef.current = {
          folderId,
          cardEl,
          touchId: touch.identifier,
          startX: touch.clientX,
          startY: touch.clientY,
          lastClientY: touch.clientY,
          longPressTimer: null,
          dragActive: false,
          offsetY: 0,
          height: 0,
          width: 0,
        }
        setGesturePhase('longPressPending')

        touchSessionRef.current.longPressTimer = setTimeout(() => {
          const s = touchSessionRef.current
          if (s.touchId !== touch.identifier || s.folderId !== folderId) return
          activateDragFromLongPress(folderId, cardEl, s.lastClientY)
        }, MEMO_REORDER_LONG_PRESS_MS)
      }

      const onTouchMove = (e: TouchEvent) => {
        const s = touchSessionRef.current
        if (s.touchId < 0) return
        const touch = Array.from(e.touches).find((t) => t.identifier === s.touchId)
        if (!touch) return
        s.lastClientY = touch.clientY

        if (!s.dragActive) {
          const dx = touch.clientX - s.startX
          const dy = touch.clientY - s.startY
          if (shouldCancelLongPress(dx, dy)) {
            cancelPendingLongPress()
            resetTouchSession()
          }
          return
        }

        if (!e.cancelable) {
          cancelActiveDrag()
          return
        }

        e.preventDefault()
        moveActiveDrag(touch.clientY)
      }

      const onTouchEnd = (e: TouchEvent) => {
        const s = touchSessionRef.current
        if (s.touchId < 0) return
        const ended = Array.from(e.changedTouches).some(
          (t) => t.identifier === s.touchId,
        )
        if (!ended) return
        clearLongPressTimer()
        if (s.dragActive) {
          void endActiveDrag()
        } else {
          resetTouchSession()
        }
      }

      const onTouchCancel = () => {
        clearLongPressTimer()
        if (touchSessionRef.current.dragActive) cancelActiveDrag()
        else resetTouchSession()
      }

      const handlers = {
        touchstart: onTouchStart,
        touchmove: onTouchMove,
        touchend: onTouchEnd,
        touchcancel: onTouchCancel,
      }

      surfaceEl.addEventListener('touchstart', onTouchStart, { passive: true })
      surfaceEl.addEventListener('touchmove', onTouchMove, { passive: false })
      surfaceEl.addEventListener('touchend', onTouchEnd, { passive: true })
      surfaceEl.addEventListener('touchcancel', onTouchCancel, { passive: true })

      cardBindingsRef.current.set(`${folderId}:${surfaceEl}`, {
        surfaceEl,
        cardEl,
        handlers,
      })
    },
    [
      activateDragFromLongPress,
      cancelActiveDrag,
      cancelPendingLongPress,
      clearLongPressTimer,
      disabled,
      endActiveDrag,
      isSwipeDeleteBlocked,
      moveActiveDrag,
      resetTouchSession,
    ],
  )

  const detachCardGesture = useCallback(
    (folderId: string, surfaceEl: HTMLElement) => {
      const key = `${folderId}:${surfaceEl}`
      const binding = cardBindingsRef.current.get(key)
      if (!binding) return
      const { handlers } = binding
      surfaceEl.removeEventListener('touchstart', handlers.touchstart)
      surfaceEl.removeEventListener('touchmove', handlers.touchmove)
      surfaceEl.removeEventListener('touchend', handlers.touchend)
      surfaceEl.removeEventListener('touchcancel', handlers.touchcancel)
      cardBindingsRef.current.delete(key)
    },
    [],
  )

  useEffect(() => {
    const bindings = cardBindingsRef.current
    return () => {
      for (const [, binding] of bindings) {
        const { surfaceEl, handlers } = binding
        surfaceEl.removeEventListener('touchstart', handlers.touchstart)
        surfaceEl.removeEventListener('touchmove', handlers.touchmove)
        surfaceEl.removeEventListener('touchend', handlers.touchend)
        surfaceEl.removeEventListener('touchcancel', handlers.touchcancel)
      }
      bindings.clear()
      clearLongPressTimer()
    }
  }, [clearLongPressTimer])

  const requestStepMove = useCallback(
    (folderId: string, direction: 'up' | 'down' | 'start' | 'end') => {
      if (disabled || dragging) return
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
          beforeId = index + 2 < ids.length ? ids[index + 2] : null
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
    [disabled, dragging, onCommit],
  )

  const announce = useCallback(
    (message: string) => {
      onAnnounce?.(message)
    },
    [onAnnounce],
  )

  const cardGestureApi = useMemo(
    () => ({ attachCardGesture, detachCardGesture }),
    [attachCardGesture, detachCardGesture],
  )

  const value = useMemo(
    () => ({
      registerItem,
      insertBeforeId,
      activeId,
      dragging,
      compactListDisplay: dragging,
      gesturePhase,
      activePlaceholderHeight,
      requestStepMove,
      announce,
      cancelPendingLongPress,
      isSwipeDeleteBlocked,
      shouldSuppressCardClick,
    }),
    [
      registerItem,
      insertBeforeId,
      activeId,
      dragging,
      gesturePhase,
      activePlaceholderHeight,
      requestStepMove,
      announce,
      cancelPendingLongPress,
      isSwipeDeleteBlocked,
      shouldSuppressCardClick,
    ],
  )

  return (
    <MobileReorderContext.Provider value={value}>
      <CardGestureContext.Provider value={cardGestureApi}>
        {liftPreview
          ? createPortal(
              <div
                className="select-none shadow-xl ring-2 ring-stone-400 overflow-hidden rounded-lg"
                style={{
                  position: 'fixed',
                  left: liftPreview.left,
                  top: liftPreview.top,
                  width: liftPreview.width,
                  zIndex: 70,
                  pointerEvents: 'none',
                  margin: 0,
                }}
                aria-hidden
              >
                <div className="h-10 bg-stone-100/90 px-3 py-2.5 text-sm font-semibold text-stone-900">
                  {liftPreview.title}
                </div>
              </div>,
              document.body,
            )
          : null}
        {children}
      </CardGestureContext.Provider>
    </MobileReorderContext.Provider>
  )
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

type GestureRootProps = {
  folderId: string
  cardRootRef: RefObject<HTMLElement | null>
  children: ReactNode
}

export function MemoMobileReorderGestureRoot({
  folderId,
  cardRootRef,
  children,
}: GestureRootProps) {
  const reorder = useContext(MobileReorderContext)
  const cardGesture = useContext(CardGestureContext)
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const blockSelection =
    reorder?.dragging ||
    reorder?.gesturePhase === 'longPressPending' ||
    reorder?.gesturePhase === 'dragging'

  useEffect(() => {
    if (!cardGesture) return
    const surface = surfaceRef.current
    const card = cardRootRef.current
    if (!surface || !card) return
    cardGesture.attachCardGesture(folderId, surface, card)
    return () => cardGesture.detachCardGesture(folderId, surface)
  }, [cardGesture, cardRootRef, folderId])

  return (
    <div
      ref={surfaceRef}
      className={`min-w-0 flex-1 ${blockSelection ? 'select-none' : ''}`}
      onContextMenu={(e) => {
        if (!blockSelection) return
        e.preventDefault()
      }}
      onClickCapture={(e) => {
        if (reorder?.shouldSuppressCardClick()) {
          e.preventDefault()
          e.stopPropagation()
        }
      }}
    >
      {children}
    </div>
  )
}

type A11yProps = {
  folderId: string
  folderName: string
  index: number
  total: number
  disabled?: boolean
}

export function MemoMobileReorderA11yControls({
  folderId,
  folderName,
  index,
  total,
  disabled = false,
}: A11yProps) {
  const { requestStepMove, dragging } = useMobileReorder()

  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled || dragging) return
    let direction: 'up' | 'down' | 'start' | 'end' | null = null
    if (e.key === 'ArrowUp' && e.shiftKey) direction = 'start'
    else if (e.key === 'ArrowUp') direction = 'up'
    else if (e.key === 'ArrowDown' && e.shiftKey) direction = 'end'
    else if (e.key === 'ArrowDown') direction = 'down'
    if (!direction) return
    if (direction === 'up' && index === 0) return
    if (direction === 'down' && index >= total - 1) return
    if (direction === 'start' && index === 0) return
    if (direction === 'end' && index >= total - 1) return
    e.preventDefault()
    e.stopPropagation()
    requestStepMove(folderId, direction)
  }

  return (
    <button
      type="button"
      data-memo-reorder-a11y
      disabled={disabled || dragging}
      aria-label={`${folderName}の並べ替え`}
      aria-describedby={`memo-reorder-hint-${folderId}`}
      onKeyDown={onKeyDown}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      className="sr-only"
    >
      <span id={`memo-reorder-hint-${folderId}`}>
        {`位置 ${index + 1} / ${total}。上下キーで1段、Shift+上下で先頭・末尾。カード余白の長押しでドラッグ。`}
      </span>
    </button>
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
