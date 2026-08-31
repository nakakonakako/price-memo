import { createPortal } from 'react-dom'
import { useRef, type ReactNode } from 'react'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { useVisualViewportOverlay } from '@/hooks/useVisualViewportOverlay'

type Props = {
  title: string
  open: boolean
  onClose: () => void
  children: ReactNode
}

export function Modal({ title, open, onClose, children }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null)
  useBodyScrollLock(open)
  useVisualViewportOverlay(overlayRef, open)

  if (!open) return null
  return createPortal(
    <div
      ref={overlayRef}
      className="fixed left-0 z-[80] flex items-center justify-center overscroll-none p-3"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      onTouchMove={(e) => {
        if (e.target === e.currentTarget) e.preventDefault()
      }}
    >
      <div className="absolute inset-0 bg-black/40" aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        data-scroll-lock-scrollable
        className="relative max-h-full w-full max-w-lg overflow-y-auto overscroll-contain rounded-lg border border-stone-200 bg-white p-4 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <h2
            id="modal-title"
            className="text-base font-medium text-stone-900"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-stone-500 hover:bg-stone-100"
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}
