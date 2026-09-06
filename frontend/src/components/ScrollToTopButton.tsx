import { useEffect, useState } from 'react'

type Props = {
  /** Show after scrolling past this many pixels. */
  threshold?: number
}

export function ScrollToTopButton({ threshold = 320 }: Props) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > threshold)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [threshold])

  if (!visible) return null

  return (
    <button
      type="button"
      aria-label="ページ上部へ"
      title="ページ上部へ"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className="fixed bottom-6 right-4 z-30 flex h-11 w-11 items-center justify-center rounded-full border border-stone-300 bg-white/95 text-lg text-stone-700 shadow-md backdrop-blur hover:bg-stone-50"
    >
      ↑
    </button>
  )
}
