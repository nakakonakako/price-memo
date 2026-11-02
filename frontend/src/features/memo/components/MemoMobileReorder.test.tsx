// @vitest-environment jsdom
import '@/test/pointerEventPolyfill'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useRef, useState } from 'react'
import {
  MemoMobileReorderGestureRoot,
  MemoMobileReorderItemRegistrar,
  MemoMobileReorderProvider,
} from './MemoMobileReorder'
import { MEMO_REORDER_LONG_PRESS_MS } from './memoMobileReorderGesture'
import { useMobileReorder } from './MemoMobileReorderContext'

function PhaseProbe() {
  const { gesturePhase } = useMobileReorder()
  return <div data-testid="gesture-phase">{gesturePhase}</div>
}

function Row({ id, name }: { id: string; name: string }) {
  const rootRef = useRef<HTMLLIElement | null>(null)
  const [rootEl, setRootEl] = useState<HTMLElement | null>(null)
  return (
    <li
      ref={(el) => {
        rootRef.current = el
        setRootEl(el)
      }}
    >
      <MemoMobileReorderItemRegistrar folderId={id} rootRef={rootEl} />
      <MemoMobileReorderGestureRoot folderId={id} cardRootRef={rootRef}>
        <div data-testid={`surface-${id}`} className="rounded border p-4">
          <p data-memo-compact-title>{name}</p>
        </div>
      </MemoMobileReorderGestureRoot>
    </li>
  )
}

function touchAt(
  surfaceEl: HTMLElement,
  type: 'start' | 'move' | 'end' | 'cancel',
  clientY: number,
  opts?: { clientX?: number; cancelable?: boolean },
) {
  const touch = {
    identifier: 1,
    clientX: opts?.clientX ?? 100,
    clientY,
    target: surfaceEl,
  }
  if (type === 'start') {
    fireEvent.touchStart(surfaceEl, { touches: [touch], targetTouches: [touch] })
    return
  }
  const docTarget = document
  if (type === 'move') {
    fireEvent.touchMove(docTarget, {
      touches: [touch],
      targetTouches: [touch],
      cancelable: opts?.cancelable ?? true,
    })
  } else if (type === 'cancel') {
    fireEvent.touchCancel(docTarget, { touches: [], changedTouches: [touch] })
  } else {
    fireEvent.touchEnd(docTarget, {
      changedTouches: [touch],
      touches: [],
    })
  }
}

function withListRects(run: () => void) {
  const originalRect = HTMLElement.prototype.getBoundingClientRect
  HTMLElement.prototype.getBoundingClientRect = function () {
    const base = originalRect.call(this)
    if (this.tagName === 'LI') {
      const items = Array.from(document.querySelectorAll('li'))
      const index = items.indexOf(this as HTMLLIElement)
      const top = index * 88
      return { ...base, top, bottom: top + 80, height: 80, width: 300, left: 0, right: 300 }
    }
    return base
  }
  try {
    run()
  } finally {
    HTMLElement.prototype.getBoundingClientRect = originalRect
  }
}

describe('MemoMobileReorder long-press gestures', () => {
  afterEach(() => {
    vi.useRealTimers()
    cleanup()
  })

  it('commits reorder after long press and vertical drag', async () => {
    const onCommit = vi.fn()
    const originalRect = HTMLElement.prototype.getBoundingClientRect
    HTMLElement.prototype.getBoundingClientRect = function () {
      const base = originalRect.call(this)
      if (this.tagName === 'LI') {
        const items = Array.from(document.querySelectorAll('li'))
        const index = items.indexOf(this as HTMLLIElement)
        const top = index * 88
        return { ...base, top, bottom: top + 80, height: 80, width: 300, left: 0, right: 300 }
      }
      return base
    }
    render(
      <MemoMobileReorderProvider folderIds={['a', 'b']} onCommit={onCommit}>
        <ul>
          <Row id="a" name="A" />
          <Row id="b" name="B" />
        </ul>
      </MemoMobileReorderProvider>,
    )

    const surface = screen.getByTestId('surface-b')
    vi.useFakeTimers()
    await act(async () => {
      touchAt(surface, 'start', 200)
      vi.advanceTimersByTime(MEMO_REORDER_LONG_PRESS_MS)
      touchAt(surface, 'move', 20)
      touchAt(surface, 'end', 20)
    })
    vi.useRealTimers()
    HTMLElement.prototype.getBoundingClientRect = originalRect

    await waitFor(() => {
      expect(onCommit).toHaveBeenCalledWith('b', 'a')
    })
  })

  it('keeps tracking touchmove on document after long-press activation re-render', async () => {
    const onCommit = vi.fn()
    const originalRect = HTMLElement.prototype.getBoundingClientRect
    HTMLElement.prototype.getBoundingClientRect = function () {
      const base = originalRect.call(this)
      if (this.tagName === 'LI') {
        const items = Array.from(document.querySelectorAll('li'))
        const index = items.indexOf(this as HTMLLIElement)
        const top = index * 88
        return { ...base, top, bottom: top + 80, height: 80, width: 300, left: 0, right: 300 }
      }
      return base
    }
    render(
      <MemoMobileReorderProvider folderIds={['a', 'b']} onCommit={onCommit}>
        <ul>
          <Row id="a" name="A" />
          <Row id="b" name="B" />
        </ul>
      </MemoMobileReorderProvider>,
    )

    const surface = screen.getByTestId('surface-b')
    vi.useFakeTimers()
    await act(async () => {
      touchAt(surface, 'start', 200)
      vi.advanceTimersByTime(MEMO_REORDER_LONG_PRESS_MS)
    })

    await act(async () => {
      touchAt(surface, 'move', 20)
      touchAt(surface, 'end', 20)
    })
    vi.useRealTimers()
    HTMLElement.prototype.getBoundingClientRect = originalRect

    await waitFor(() => {
      expect(onCommit).toHaveBeenCalledWith('b', 'a')
    })
  })

  it('restores without commit when releasing after long press without moving', async () => {
    const onCommit = vi.fn()
    withListRects(() => {
      render(
        <MemoMobileReorderProvider folderIds={['a', 'b']} onCommit={onCommit}>
          <ul>
            <Row id="a" name="A" />
            <Row id="b" name="B" />
          </ul>
        </MemoMobileReorderProvider>,
      )
    })

    const surface = screen.getByTestId('surface-b')
    vi.useFakeTimers()
    await act(async () => {
      touchAt(surface, 'start', 200)
      vi.advanceTimersByTime(MEMO_REORDER_LONG_PRESS_MS)
      touchAt(surface, 'end', 200)
    })
    vi.useRealTimers()

    expect(onCommit).not.toHaveBeenCalled()
  })

  it('does not start reorder when finger moves before long press completes', async () => {
    const onCommit = vi.fn()
    render(
      <MemoMobileReorderProvider folderIds={['a', 'b']} onCommit={onCommit}>
        <ul>
          <Row id="a" name="A" />
          <Row id="b" name="B" />
        </ul>
      </MemoMobileReorderProvider>,
    )

    const surface = screen.getByTestId('surface-b')
    vi.useFakeTimers()
    await act(async () => {
      touchAt(surface, 'start', 200)
      touchAt(surface, 'move', 170)
      vi.advanceTimersByTime(MEMO_REORDER_LONG_PRESS_MS)
      touchAt(surface, 'end', 170)
    })
    vi.useRealTimers()

    expect(onCommit).not.toHaveBeenCalled()
  })

  it('cancels active drag without commit on touchcancel', async () => {
    const onCommit = vi.fn()
    withListRects(() => {
      render(
        <MemoMobileReorderProvider folderIds={['a', 'b']} onCommit={onCommit}>
          <ul>
            <Row id="a" name="A" />
            <Row id="b" name="B" />
          </ul>
        </MemoMobileReorderProvider>,
      )
    })

    const surface = screen.getByTestId('surface-b')
    vi.useFakeTimers()
    await act(async () => {
      touchAt(surface, 'start', 200)
      vi.advanceTimersByTime(MEMO_REORDER_LONG_PRESS_MS)
      touchAt(surface, 'move', 20)
      touchAt(surface, 'cancel', 20)
    })
    vi.useRealTimers()

    expect(onCommit).not.toHaveBeenCalled()
  })

  it('cancels active drag without commit on non-cancelable touchmove', async () => {
    const onCommit = vi.fn()
    withListRects(() => {
      render(
        <MemoMobileReorderProvider folderIds={['a', 'b']} onCommit={onCommit}>
          <ul>
            <Row id="a" name="A" />
            <Row id="b" name="B" />
          </ul>
        </MemoMobileReorderProvider>,
      )
    })

    const surface = screen.getByTestId('surface-b')
    vi.useFakeTimers()
    await act(async () => {
      touchAt(surface, 'start', 200)
      vi.advanceTimersByTime(MEMO_REORDER_LONG_PRESS_MS)
      touchAt(surface, 'move', 180, { cancelable: false })
      touchAt(surface, 'end', 180)
    })
    vi.useRealTimers()

    expect(onCommit).not.toHaveBeenCalled()
  })

  it('removes document capture listeners exactly once on terminal touchend', async () => {
    const addSpy = vi.spyOn(document, 'addEventListener')
    const removeSpy = vi.spyOn(document, 'removeEventListener')
    const onCommit = vi.fn()

    withListRects(() => {
      render(
        <MemoMobileReorderProvider folderIds={['a', 'b']} onCommit={onCommit}>
          <ul>
            <Row id="a" name="A" />
            <Row id="b" name="B" />
          </ul>
        </MemoMobileReorderProvider>,
      )
    })

    const surface = screen.getByTestId('surface-b')
    const touchMoveAdds = () =>
      addSpy.mock.calls.filter(([type, , opts]) => type === 'touchmove' && opts?.capture)
    const touchMoveRemoves = () =>
      removeSpy.mock.calls.filter(([type, , opts]) => type === 'touchmove' && opts === true)

    vi.useFakeTimers()
    await act(async () => {
      touchAt(surface, 'start', 200)
      expect(touchMoveAdds().length).toBe(1)
      vi.advanceTimersByTime(MEMO_REORDER_LONG_PRESS_MS)
      touchAt(surface, 'move', 20)
      touchAt(surface, 'end', 20)
    })
    vi.useRealTimers()

    expect(touchMoveRemoves().length).toBe(1)
    addSpy.mockRestore()
    removeSpy.mockRestore()
  })

  it('returns to idle after a short touch tap without starting drag', async () => {
    const onCommit = vi.fn()
    render(
      <MemoMobileReorderProvider folderIds={['a', 'b']} onCommit={onCommit}>
        <PhaseProbe />
        <ul>
          <Row id="a" name="A" />
          <Row id="b" name="B" />
        </ul>
      </MemoMobileReorderProvider>,
    )

    const surface = screen.getByTestId('surface-b')
    await act(async () => {
      touchAt(surface, 'start', 200)
      touchAt(surface, 'end', 200)
    })

    expect(screen.getByTestId('gesture-phase').textContent).toBe('idle')
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('accepts a second touch after touchend on the same card', async () => {
    const onCommit = vi.fn()
    const originalRect = HTMLElement.prototype.getBoundingClientRect
    HTMLElement.prototype.getBoundingClientRect = function () {
      const base = originalRect.call(this)
      if (this.tagName === 'LI') {
        const items = Array.from(document.querySelectorAll('li'))
        const index = items.indexOf(this as HTMLLIElement)
        const top = index * 88
        return { ...base, top, bottom: top + 80, height: 80, width: 300, left: 0, right: 300 }
      }
      return base
    }
    render(
      <MemoMobileReorderProvider folderIds={['a', 'b']} onCommit={onCommit}>
        <ul>
          <Row id="a" name="A" />
          <Row id="b" name="B" />
        </ul>
      </MemoMobileReorderProvider>,
    )

    const surface = screen.getByTestId('surface-b')
    vi.useFakeTimers()
    await act(async () => {
      touchAt(surface, 'start', 200)
      touchAt(surface, 'end', 200)
      touchAt(surface, 'start', 200)
      vi.advanceTimersByTime(MEMO_REORDER_LONG_PRESS_MS)
      touchAt(surface, 'move', 20)
      touchAt(surface, 'end', 20)
    })
    vi.useRealTimers()
    HTMLElement.prototype.getBoundingClientRect = originalRect

    await waitFor(() => {
      expect(onCommit).toHaveBeenCalledWith('b', 'a')
    })
  })

  it('accepts a new touch after touchcancel ended the pending hold', async () => {
    const onCommit = vi.fn()
    const originalRect = HTMLElement.prototype.getBoundingClientRect
    HTMLElement.prototype.getBoundingClientRect = function () {
      const base = originalRect.call(this)
      if (this.tagName === 'LI') {
        const items = Array.from(document.querySelectorAll('li'))
        const index = items.indexOf(this as HTMLLIElement)
        const top = index * 88
        return { ...base, top, bottom: top + 80, height: 80, width: 300, left: 0, right: 300 }
      }
      return base
    }
    render(
      <MemoMobileReorderProvider folderIds={['a', 'b']} onCommit={onCommit}>
        <PhaseProbe />
        <ul>
          <Row id="a" name="A" />
          <Row id="b" name="B" />
        </ul>
      </MemoMobileReorderProvider>,
    )

    const surface = screen.getByTestId('surface-b')
    vi.useFakeTimers()
    await act(async () => {
      touchAt(surface, 'start', 200)
      touchAt(surface, 'cancel', 200)
      expect(screen.getByTestId('gesture-phase').textContent).toBe('idle')
      touchAt(surface, 'start', 200)
      vi.advanceTimersByTime(MEMO_REORDER_LONG_PRESS_MS)
      touchAt(surface, 'move', 20)
      touchAt(surface, 'end', 20)
    })
    vi.useRealTimers()
    HTMLElement.prototype.getBoundingClientRect = originalRect

    await waitFor(() => {
      expect(onCommit).toHaveBeenCalledWith('b', 'a')
    })
  })

  it('ignores a second finger touchstart without cancelling the pending hold', async () => {
    const onCommit = vi.fn()
    const originalRect = HTMLElement.prototype.getBoundingClientRect
    HTMLElement.prototype.getBoundingClientRect = function () {
      const base = originalRect.call(this)
      if (this.tagName === 'LI') {
        const items = Array.from(document.querySelectorAll('li'))
        const index = items.indexOf(this as HTMLLIElement)
        const top = index * 88
        return { ...base, top, bottom: top + 80, height: 80, width: 300, left: 0, right: 300 }
      }
      return base
    }
    render(
      <MemoMobileReorderProvider folderIds={['a', 'b']} onCommit={onCommit}>
        <PhaseProbe />
        <ul>
          <Row id="a" name="A" />
          <Row id="b" name="B" />
        </ul>
      </MemoMobileReorderProvider>,
    )

    const surface = screen.getByTestId('surface-b')
    vi.useFakeTimers()
    await act(async () => {
      touchAt(surface, 'start', 200)
      fireEvent.touchStart(surface, {
        touches: [
          {
            identifier: 1,
            clientX: 100,
            clientY: 200,
            target: surface,
          },
          {
            identifier: 2,
            clientX: 140,
            clientY: 220,
            target: surface,
          },
        ],
        targetTouches: [],
      })
      vi.advanceTimersByTime(MEMO_REORDER_LONG_PRESS_MS)
      touchAt(surface, 'move', 20)
      touchAt(surface, 'end', 20)
    })
    vi.useRealTimers()
    HTMLElement.prototype.getBoundingClientRect = originalRect

    await waitFor(() => {
      expect(onCommit).toHaveBeenCalledWith('b', 'a')
    })
  })

  it('ends the touch session when the card surface is detached', async () => {
    const onCommit = vi.fn()
    const addSpy = vi.spyOn(document, 'addEventListener')
    const removeSpy = vi.spyOn(document, 'removeEventListener')

    function DetachingRow() {
      const [mounted, setMounted] = useState(true)
      const rootRef = useRef<HTMLLIElement | null>(null)
      const [rootEl, setRootEl] = useState<HTMLElement | null>(null)
      return (
        <li
          ref={(el) => {
            rootRef.current = el
            setRootEl(el)
          }}
        >
          <button type="button" onClick={() => setMounted(false)}>
            detach
          </button>
          {mounted ? (
            <>
              <MemoMobileReorderItemRegistrar folderId="b" rootRef={rootEl} />
              <MemoMobileReorderGestureRoot folderId="b" cardRootRef={rootRef}>
                <div data-testid="surface-b" className="rounded border p-4">
                  <p data-memo-compact-title>B</p>
                </div>
              </MemoMobileReorderGestureRoot>
            </>
          ) : null}
        </li>
      )
    }

    render(
      <MemoMobileReorderProvider folderIds={['a', 'b']} onCommit={onCommit}>
        <PhaseProbe />
        <ul>
          <Row id="a" name="A" />
          <DetachingRow />
        </ul>
      </MemoMobileReorderProvider>,
    )

    const surface = screen.getByTestId('surface-b')
    const touchMoveAdds = () =>
      addSpy.mock.calls.filter(([type, , opts]) => type === 'touchmove' && opts?.capture)
    const touchMoveRemoves = () =>
      removeSpy.mock.calls.filter(([type, , opts]) => type === 'touchmove' && opts === true)

    vi.useFakeTimers()
    await act(async () => {
      touchAt(surface, 'start', 200)
      expect(touchMoveAdds().length).toBe(1)
      fireEvent.click(screen.getByRole('button', { name: 'detach' }))
    })
    vi.useRealTimers()

    expect(touchMoveRemoves().length).toBeGreaterThanOrEqual(1)
    expect(screen.getByTestId('gesture-phase').textContent).toBe('idle')
    addSpy.mockRestore()
    removeSpy.mockRestore()
  })
})
