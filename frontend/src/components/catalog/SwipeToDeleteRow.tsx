import { useRef, useState, type ReactNode } from 'react'

const AXIS_LOCK_DISTANCE = 8
const CLICK_SUPPRESS_DISTANCE = 10

function isInteractive(target: EventTarget | null) {
  return (
    target instanceof Element &&
    !!target.closest(
      'button, input, select, textarea, a, label, [data-no-trash-drag]',
    )
  )
}

type Props = {
  children: ReactNode
  onDelete: () => void
  className?: string
}

export function SwipeToDeleteRow({
  children,
  onDelete,
  className = '',
}: Props) {
  const [offset, setOffset] = useState(0)
  const [animate, setAnimate] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const offsetRef = useRef(0)
  const gesture = useRef({
    tracking: false,
    axis: null as 'x' | 'y' | null,
    startX: 0,
    startY: 0,
    pointerId: -1,
    suppressClick: false,
    commitDistance: 120,
  })

  const clamp = (v: number) => Math.min(0, v)

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || isInteractive(e.target)) return
    const width = rootRef.current?.offsetWidth ?? 0
    gesture.current = {
      tracking: true,
      axis: null,
      startX: e.clientX,
      startY: e.clientY,
      pointerId: e.pointerId,
      suppressClick: false,
      commitDistance: Math.max(96, width * 0.45),
    }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current
    if (!g.tracking || e.pointerId !== g.pointerId) return
    const dx = e.clientX - g.startX
    const dy = e.clientY - g.startY

    if (!g.axis) {
      if (Math.hypot(dx, dy) < AXIS_LOCK_DISTANCE) return
      if (Math.abs(dy) >= Math.abs(dx)) {
        g.tracking = false
        return
      }
      g.axis = 'x'
      setAnimate(false)
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    }

    if (g.axis === 'x') {
      e.preventDefault()
      if (Math.abs(dx) >= CLICK_SUPPRESS_DISTANCE) {
        g.suppressClick = true
      }
      const next = clamp(dx)
      offsetRef.current = next
      setOffset(next)
    }
  }

  const finishHorizontal = (el: HTMLDivElement, pointerId: number) => {
    const g = gesture.current
    const o = offsetRef.current
    setAnimate(true)
    if (o <= -g.commitDistance) {
      onDelete()
    }
    offsetRef.current = 0
    setOffset(0)
    g.tracking = false
    g.axis = null
    try {
      el.releasePointerCapture(pointerId)
    } catch {
      /* already released */
    }
  }

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current
    if (e.pointerId !== g.pointerId) return
    if (g.axis === 'x') {
      finishHorizontal(e.currentTarget, e.pointerId)
      return
    }
    g.tracking = false
    g.axis = null
  }

  const onPointerCancel = () => {
    const g = gesture.current
    if (g.axis === 'x') {
      setAnimate(true)
      offsetRef.current = 0
      setOffset(0)
    }
    g.tracking = false
    g.axis = null
  }

  const revealWidth = Math.max(0, -offset)

  return (
    <div ref={rootRef} className={`relative overflow-hidden ${className}`}>
      <div
        className="absolute inset-y-0 right-0 flex items-stretch justify-end overflow-hidden bg-red-500"
        style={{ width: revealWidth }}
        aria-hidden={revealWidth === 0}
      >
        <span className="flex w-[72px] shrink-0 items-center justify-center text-sm font-medium text-white pointer-events-none select-none">
          削除
        </span>
      </div>
      <div
        className={`relative bg-inherit ${animate ? 'transition-transform duration-200 ease-out' : ''}`}
        style={{ transform: `translateX(${offset}px)`, touchAction: 'pan-y' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onClickCapture={(e) => {
          if (gesture.current.suppressClick) {
            e.preventDefault()
            e.stopPropagation()
            gesture.current.suppressClick = false
          }
        }}
      >
        {children}
      </div>
    </div>
  )
}
