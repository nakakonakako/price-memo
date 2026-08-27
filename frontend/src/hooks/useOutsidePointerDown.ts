import { useEffect } from 'react'

/** Cancel when pointer goes down outside edit surfaces (and dialogs). */
export function useOutsidePointerDown(
  active: boolean,
  onOutside: () => void,
  rootSelector = '[data-edit-surface], [role="dialog"]',
) {
  useEffect(() => {
    if (!active) return
    const onDown = (e: PointerEvent) => {
      const target = e.target
      if (!(target instanceof Element)) return
      if (target.closest(rootSelector)) return
      onOutside()
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [active, onOutside, rootSelector])
}
