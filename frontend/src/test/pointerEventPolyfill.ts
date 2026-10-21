/** jsdom may lack PointerEvent; React 19 only binds onPointer* when it exists. */
if (typeof globalThis.PointerEvent === 'undefined') {
  class PolyfillPointerEvent extends MouseEvent {
    readonly pointerId: number
    readonly pointerType: string
    readonly isPrimary: boolean

    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params)
      this.pointerId = params.pointerId ?? 0
      this.pointerType = params.pointerType ?? ''
      this.isPrimary = params.isPrimary ?? false
    }
  }
  globalThis.PointerEvent =
    PolyfillPointerEvent as unknown as typeof PointerEvent
}
