import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import type { TrashDragPayload } from './types'
import { useTrashDrag } from './TrashDragProvider'

const DRAG_THRESHOLD = 8

type Props = {
  payload: TrashDragPayload
  onClick?: () => void
  className?: string
  children: ReactNode
}

export function TrashDragItem({
  payload,
  onClick,
  className = '',
  children,
}: Props) {
  const {
    beginDrag,
    moveDrag,
    endDrag,
    cancelDrag,
    registerItem,
    activeId,
    insertBeforeId,
    dragOverTrash,
  } = useTrashDrag()

  const rootRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef({
    active: false,
    moved: false,
    startX: 0,
    startY: 0,
    offsetX: 0,
    offsetY: 0,
    width: 0,
    height: 0,
    pointerId: -1,
  })
  const [liftStyle, setLiftStyle] = useState<CSSProperties | null>(null)
  const [placeholderH, setPlaceholderH] = useState(0)

  const isDragging = activeId === payload.id && liftStyle != null
  const showInsertLine =
    insertBeforeId === payload.id &&
    activeId != null &&
    activeId !== payload.id &&
    !dragOverTrash

  useEffect(() => {
    registerItem(payload.id, rootRef.current)
    return () => registerItem(payload.id, null)
  }, [payload.id, registerItem, isDragging])

  const isInteractive = (target: EventTarget | null) =>
    target instanceof Element &&
    !!target.closest(
      'button, input, select, textarea, a, label, [data-no-trash-drag]',
    )

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || isInteractive(e.target)) return
    e.stopPropagation()
    const el = rootRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    dragRef.current = {
      active: true,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      width: rect.width,
      height: rect.height,
      pointerId: e.pointerId,
    }
    el.setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = dragRef.current
    if (!s.active || e.pointerId !== s.pointerId) return
    const dx = e.clientX - s.startX
    const dy = e.clientY - s.startY
    if (!s.moved) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return
      s.moved = true
      setPlaceholderH(s.height)
      setLiftStyle({
        position: 'fixed',
        left: e.clientX - s.offsetX,
        top: e.clientY - s.offsetY,
        width: s.width,
        zIndex: 70,
        pointerEvents: 'none',
        margin: 0,
      })
      beginDrag(payload)
    } else {
      setLiftStyle({
        position: 'fixed',
        left: e.clientX - s.offsetX,
        top: e.clientY - s.offsetY,
        width: s.width,
        zIndex: 70,
        pointerEvents: 'none',
        margin: 0,
      })
    }
    moveDrag(e.clientX, e.clientY)
  }

  const clearLift = () => {
    setLiftStyle(null)
    setPlaceholderH(0)
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = dragRef.current
    if (!s.active || e.pointerId !== s.pointerId) return
    if (s.moved) {
      void endDrag(e.clientX, e.clientY)
      clearLift()
    } else {
      onClick?.()
    }
    s.active = false
    s.moved = false
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* already released */
    }
  }

  const handlePointerCancel = () => {
    if (dragRef.current.moved) cancelDrag()
    dragRef.current.active = false
    dragRef.current.moved = false
    clearLift()
  }

  const liftPreview =
    isDragging && liftStyle
      ? createPortal(
          <div
            className={`touch-none select-none shadow-xl ring-2 ring-stone-400 ${className}`}
            style={liftStyle}
          >
            {children}
          </div>,
          document.body,
        )
      : null

  return (
    <>
      {showInsertLine && (
        <div className="h-1 rounded-full bg-stone-800" aria-hidden />
      )}
      {isDragging && (
        <div
          aria-hidden
          className="rounded-lg border-2 border-dashed border-stone-300 bg-stone-100/80"
          style={{ height: placeholderH }}
        />
      )}
      <div
        ref={rootRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        className={`touch-none select-none ${className}`}
        style={isDragging ? { display: 'none' } : undefined}
      >
        {children}
      </div>
      {liftPreview}
    </>
  )
}
