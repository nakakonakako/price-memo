import { useEffect, type RefObject } from 'react'

/** Pin a fixed overlay to the visible viewport (accounts for mobile keyboard). */
export function useVisualViewportOverlay(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
) {
  useEffect(() => {
    if (!active) return
    const el = ref.current
    const vv = window.visualViewport
    if (!el || !vv) return

    const apply = () => {
      el.style.top = `${vv.offsetTop}px`
      el.style.left = `${vv.offsetLeft}px`
      el.style.width = `${vv.width}px`
      el.style.height = `${vv.height}px`
    }

    apply()
    vv.addEventListener('resize', apply)
    vv.addEventListener('scroll', apply)
    return () => {
      vv.removeEventListener('resize', apply)
      vv.removeEventListener('scroll', apply)
      el.style.top = ''
      el.style.left = ''
      el.style.width = ''
      el.style.height = ''
    }
  }, [active, ref])
}
