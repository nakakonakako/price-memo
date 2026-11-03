// @vitest-environment jsdom
import '@/test/pointerEventPolyfill'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { SwipeToDeleteRow } from './SwipeToDeleteRow'

vi.mock('@/features/memo/components/MemoMobileReorderContext', () => ({
  useMobileReorderOptional: () => null,
}))

function horizontalSwipe(el: HTMLElement, dx: number) {
  const startX = 120
  const startY = 200
  const pointerInit = {
    clientX: startX,
    clientY: startY,
    button: 0,
    buttons: 1,
    pointerId: 7,
    pointerType: 'touch',
    isPrimary: true,
  }
  el.setPointerCapture = vi.fn()
  el.releasePointerCapture = vi.fn()
  fireEvent.pointerDown(el, pointerInit)
  fireEvent.pointerMove(el, {
    ...pointerInit,
    clientX: startX + dx,
    clientY: startY,
  })
  fireEvent.pointerUp(el, {
    ...pointerInit,
    clientX: startX + dx,
    clientY: startY,
    buttons: 0,
  })
}

describe('SwipeToDeleteRow pointer click suppression', () => {
  afterEach(() => {
    cleanup()
  })

  it('suppresses the synthetic click after a horizontal swipe', () => {
    const onRowClick = vi.fn()
    render(
      <SwipeToDeleteRow onDelete={vi.fn()}>
        <div>
          <span data-testid="row-body">row body</span>
          <button type="button" onClick={onRowClick}>
            action
          </button>
        </div>
      </SwipeToDeleteRow>,
    )

    const swipeSurface = screen.getByTestId('row-body').parentElement
      ?.parentElement as HTMLElement

    horizontalSwipe(swipeSurface, -80)
    fireEvent.click(screen.getByTestId('row-body'))

    expect(onRowClick).not.toHaveBeenCalled()
  })

  it('allows a clear control click after swipe when the browser omits the synthetic click', () => {
    const onClear = vi.fn()
    render(
      <SwipeToDeleteRow onDelete={vi.fn()}>
        <div>
          <span>label</span>
          <button type="button" aria-label="比較店舗をクリア" onClick={onClear}>
            clear
          </button>
        </div>
      </SwipeToDeleteRow>,
    )

    const swipeSurface = screen.getByText('label').parentElement
      ?.parentElement as HTMLElement
    horizontalSwipe(swipeSurface, -80)
    fireEvent.click(screen.getByRole('button', { name: '比較店舗をクリア' }))

    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('allows the next tap after swipe when touch reuses the same pointer id', () => {
    const onRowClick = vi.fn()
    render(
      <SwipeToDeleteRow onDelete={vi.fn()}>
        <button type="button" onClick={onRowClick}>
          row body
        </button>
      </SwipeToDeleteRow>,
    )

    const swipeSurface = screen.getByRole('button', { name: 'row body' })
      .parentElement as HTMLElement

    horizontalSwipe(swipeSurface, -80)
    fireEvent.pointerDown(swipeSurface, {
      clientX: 120,
      clientY: 200,
      button: 0,
      buttons: 1,
      pointerId: 7,
      pointerType: 'touch',
      isPrimary: true,
    })
    fireEvent.click(screen.getByRole('button', { name: 'row body' }))

    expect(onRowClick).toHaveBeenCalledTimes(1)
  })
})
