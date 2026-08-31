import { useEffect } from 'react'

export function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return
    const scrollY = window.scrollY
    const { style } = document.body
    const prev = {
      position: style.position,
      top: style.top,
      width: style.width,
      overflow: style.overflow,
    }
    style.position = 'fixed'
    style.top = `-${scrollY}px`
    style.width = '100%'
    style.overflow = 'hidden'
    return () => {
      style.position = prev.position
      style.top = prev.top
      style.width = prev.width
      style.overflow = prev.overflow
      window.scrollTo(0, scrollY)
    }
  }, [locked])
}
