import { useEffect, useState } from 'react'
import { useTrashDragOptional } from '@/components/trash/TrashDragProvider'

type Props = {
  /** Show after scrolling past this many pixels. */
  threshold?: number
}

export function ScrollToTopButton({ threshold = 320 }: Props) {
  const [visible, setVisible] = useState(false)
  const trash = useTrashDragOptional()
  const dragging = trash?.dragging ?? false

  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > threshold)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [threshold])

  // Hide while dragging so it never covers the trash drop target.
  if (!visible || dragging) return null

  return (
    <button
      type="button"
      aria-label="ページ上部へ"
      title="ページ上部へ"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className="fixed bottom-6 right-4 z-30 flex h-16 w-16 items-center justify-center rounded-md border border-stone-300 bg-white/95 text-3xl leading-none text-stone-700 shadow-md backdrop-blur hover:bg-stone-50 sm:bottom-8 sm:right-6 sm:h-20 sm:w-20 sm:text-4xl"
    >
      ↑
    </button>
  )
}
