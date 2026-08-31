import { createPortal } from 'react-dom'
import { useRef, type ReactNode } from 'react'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useVisualViewportOverlay } from '@/hooks/useVisualViewportOverlay'

type Props = {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  zIndexClass?: string
  titleId?: string
}

export function DialogShell({
  open,
  onClose,
  title,
  children,
  zIndexClass = 'z-[80]',
  titleId = 'dialog-title',
}: Props) {
  const isMobile = useMediaQuery('(max-width: 1023px)')
  const overlayRef = useRef<HTMLDivElement>(null)

  useBodyScrollLock(open, { touchGuard: !isMobile })
  useVisualViewportOverlay(overlayRef, open && !isMobile)

  if (!open) return null

  if (isMobile) {
    return createPortal(
      <div
        className={`fixed inset-0 ${zIndexClass} flex flex-col bg-white`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-stone-200 px-4 py-3">
          <h2 id={titleId} className="text-base font-medium text-stone-900">
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
        </header>
        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4"
          data-scroll-lock-scrollable
        >
          {children}
        </div>
      </div>,
      document.body,
    )
  }

  return createPortal(
    <div
      ref={overlayRef}
      className={`fixed left-0 ${zIndexClass} flex items-center justify-center overscroll-none p-3`}
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
        aria-labelledby={titleId}
        data-scroll-lock-scrollable
        className="relative max-h-full w-full max-w-lg overflow-y-auto overscroll-contain rounded-lg border border-stone-200 bg-white p-4 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <h2 id={titleId} className="text-base font-medium text-stone-900">
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
