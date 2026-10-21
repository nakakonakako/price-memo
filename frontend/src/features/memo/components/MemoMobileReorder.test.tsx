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
})
