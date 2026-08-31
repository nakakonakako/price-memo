import { useEffect } from 'react'

/**
 * Locks background scroll without position:fixed on body.
 * position:fixed breaks iOS virtual keyboard / tap hit-testing.
 */
export function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return

    const html = document.documentElement
    const body = document.body
    const scrollY = window.scrollY

    const prev = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      htmlOverscroll: html.style.overscrollBehavior,
      bodyOverscroll: body.style.overscrollBehavior,
      htmlPaddingRight: html.style.paddingRight,
    }

    const scrollbarWidth = window.innerWidth - html.clientWidth
    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    html.style.overscrollBehavior = 'none'
    body.style.overscrollBehavior = 'none'
    if (scrollbarWidth > 0) {
      html.style.paddingRight = `${scrollbarWidth}px`
    }

    const onTouchMove = (e: TouchEvent) => {
      const target = e.target
      if (
        target instanceof Element &&
        target.closest('[data-scroll-lock-scrollable]')
      ) {
        return
      }
      e.preventDefault()
    }

    document.addEventListener('touchmove', onTouchMove, { passive: false })

    return () => {
      document.removeEventListener('touchmove', onTouchMove)
      html.style.overflow = prev.htmlOverflow
      body.style.overflow = prev.bodyOverflow
      html.style.overscrollBehavior = prev.htmlOverscroll
      body.style.overscrollBehavior = prev.bodyOverscroll
      html.style.paddingRight = prev.htmlPaddingRight
      window.scrollTo(0, scrollY)
    }
  }, [locked])
}
