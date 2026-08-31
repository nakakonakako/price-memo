import { useRef, useState, type ReactNode } from 'react'

const REVEAL_WIDTH = 72
const SNAP_THRESHOLD = 40
const AXIS_LOCK_DISTANCE = 8

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
  const gesture = useRef({
    tracking: false,
    axis: null as 'x' | 'y' | null,
    startX: 0,
    startY: 0,
    startOffset: 0,
    pointerId: -1,
  })

  const clamp = (v: number) => Math.min(0, Math.max(-REVEAL_WIDTH, v))

  const reset = () => {
    setAnimate(true)
    setOffset(0)
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || isInteractive(e.target)) return
    gesture.current = {
      tracking: true,
      axis: null,
      startX: e.clientX,
      startY: e.clientY,
      startOffset: offset,
      pointerId: e.pointerId,
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
      setOffset(clamp(g.startOffset + dx))
    }
  }

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current
    if (!g.tracking && g.axis !== 'x') return
    if (e.pointerId !== g.pointerId) return
    const wasHorizontal = g.axis === 'x'
    g.tracking = false
    g.axis = null
    if (wasHorizontal) {
      setAnimate(true)
      setOffset((o) => (o < -SNAP_THRESHOLD ? -REVEAL_WIDTH : 0))
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        /* already released */
      }
    }
  }

  const onPointerCancel = () => {
    const g = gesture.current
    if (g.axis === 'x') {
      setAnimate(true)
      setOffset(0)
    }
    g.tracking = false
    g.axis = null
  }

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <div className="absolute inset-y-0 right-0 flex w-[72px] items-stretch justify-center bg-red-500">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
            reset()
          }}
          className="flex w-full items-center justify-center text-sm font-medium text-white"
        >
          削除
        </button>
      </div>
      <div
        className={`relative bg-inherit ${animate ? 'transition-transform duration-200 ease-out' : ''}`}
        style={{ transform: `translateX(${offset}px)`, touchAction: 'pan-y' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        {children}
      </div>
    </div>
  )
}
