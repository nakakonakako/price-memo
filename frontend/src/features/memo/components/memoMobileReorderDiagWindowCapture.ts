import {
  bumpMemoReorderDiagRawCounter,
  isMemoReorderDiagEnabled,
  memoReorderDiagListener,
  memoReorderDiagMaybePushWindowPointerMoveSample,
  memoReorderDiagMaybePushWindowTouchMoveSample,
  memoReorderDiagPushRawWindowSample,
  memoReorderDiagSetWindowCaptureMounted,
  touchTagName,
  touchIdList,
} from './memoMobileReorderDiag'

type WindowHandler = (e: Event) => void

function onRawTouch(e: TouchEvent): void {
  const kind = e.type as 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel'
  bumpMemoReorderDiagRawCounter('window', kind)
  if (kind === 'touchmove') {
    memoReorderDiagMaybePushWindowTouchMoveSample({
      eventPhase: e.eventPhase,
      cancelable: e.cancelable,
      defaultPrevented: e.defaultPrevented,
      touchIds: touchIdList(e),
      tag: touchTagName(e.target),
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    })
    return
  }
  memoReorderDiagPushRawWindowSample({
    source: 'window',
    kind,
    eventPhase: e.eventPhase,
    cancelable: e.cancelable,
    defaultPrevented: e.defaultPrevented,
    touchIds: touchIdList(e),
    tag: touchTagName(e.target),
    scrollX: window.scrollX,
    scrollY: window.scrollY,
  })
}

function onRawPointer(e: PointerEvent): void {
  if (e.type === 'pointermove') {
    bumpMemoReorderDiagRawCounter('window', 'pointermove')
    memoReorderDiagMaybePushWindowPointerMoveSample({
      eventPhase: e.eventPhase,
      cancelable: e.cancelable,
      defaultPrevented: e.defaultPrevented,
      pointerId: e.pointerId,
      pointerType: e.pointerType,
      tag: touchTagName(e.target),
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    })
    return
  }
  const kind = e.type as 'pointerup' | 'pointercancel'
  bumpMemoReorderDiagRawCounter('window', kind)
  memoReorderDiagPushRawWindowSample({
    source: 'window',
    kind,
    eventPhase: e.eventPhase,
    cancelable: e.cancelable,
    defaultPrevented: e.defaultPrevented,
    pointerId: e.pointerId,
    pointerType: e.pointerType,
    tag: touchTagName(e.target),
    scrollX: window.scrollX,
    scrollY: window.scrollY,
  })
}

export function mountMemoReorderDiagWindowCapture(): () => void {
  if (!isMemoReorderDiagEnabled()) return () => {}

  memoReorderDiagSetWindowCaptureMounted(true)

  const touchOpts: AddEventListenerOptions = { capture: true, passive: true }
  const pointerOpts: AddEventListenerOptions = { capture: true, passive: true }

  const touchHandlers: WindowHandler[] = [
    (e) => onRawTouch(e as TouchEvent),
    (e) => onRawTouch(e as TouchEvent),
    (e) => onRawTouch(e as TouchEvent),
    (e) => onRawTouch(e as TouchEvent),
  ]
  const touchTypes = ['touchstart', 'touchmove', 'touchend', 'touchcancel'] as const
  for (let i = 0; i < touchTypes.length; i += 1) {
    window.addEventListener(touchTypes[i], touchHandlers[i], touchOpts)
  }
  memoReorderDiagListener('attach', 'window', 'touch capture passive')

  const pointerTypes = ['pointermove', 'pointerup', 'pointercancel'] as const
  const pointerHandlers: WindowHandler[] = [
    (e) => onRawPointer(e as PointerEvent),
    (e) => onRawPointer(e as PointerEvent),
    (e) => onRawPointer(e as PointerEvent),
  ]
  for (let i = 0; i < pointerTypes.length; i += 1) {
    window.addEventListener(pointerTypes[i], pointerHandlers[i], pointerOpts)
  }
  memoReorderDiagListener('attach', 'window', 'pointer capture passive')

  return () => {
    for (let i = 0; i < touchTypes.length; i += 1) {
      window.removeEventListener(touchTypes[i], touchHandlers[i], touchOpts)
    }
    memoReorderDiagListener('detach', 'window', 'touch capture passive')
    for (let i = 0; i < pointerTypes.length; i += 1) {
      window.removeEventListener(pointerTypes[i], pointerHandlers[i], pointerOpts)
    }
    memoReorderDiagListener('detach', 'window', 'pointer capture passive')
    memoReorderDiagSetWindowCaptureMounted(false)
  }
}
