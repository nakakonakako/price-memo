// @vitest-environment jsdom
import '@/test/pointerEventPolyfill'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useRef } from 'react'
import {
  MemoMobileReorderHandle,
  MemoMobileReorderProvider,
} from './MemoMobileReorder'

function Row({
  id,
  name,
  index,
  total,
}: {
  id: string
  name: string
  index: number
  total: number
}) {
  const rootRef = useRef<HTMLLIElement | null>(null)
  return (
    <li ref={rootRef}>
      <MemoMobileReorderHandle
        folderId={id}
        folderName={name}
        cardRootRef={rootRef}
        index={index}
        total={total}
      />
    </li>
  )
}

describe('MemoMobileReorder handle gestures', () => {
  afterEach(() => {
    cleanup()
  })

  it('commits one step on a short vertical swipe', async () => {
    const onCommit = vi.fn()
    render(
      <MemoMobileReorderProvider folderIds={['a', 'b']} onCommit={onCommit}>
        <ul>
          <Row id="a" name="A" index={0} total={2} />
          <Row id="b" name="B" index={1} total={2} />
        </ul>
      </MemoMobileReorderProvider>,
    )

    const handle = screen.getByLabelText('Bの並べ替え')
    await waitFor(() => {
      expect(handle.closest('li')).toBeTruthy()
    })

    handle.setPointerCapture = vi.fn()
    handle.releasePointerCapture = vi.fn()

    await act(async () => {
      fireEvent.pointerDown(handle, {
        clientX: 100,
        clientY: 200,
        button: 0,
        pointerId: 1,
      })
      fireEvent.pointerMove(handle, {
        clientX: 100,
        clientY: 180,
        button: 0,
        pointerId: 1,
      })
      fireEvent.pointerUp(handle, {
        clientX: 100,
        clientY: 180,
        button: 0,
        pointerId: 1,
      })
    })

    expect(onCommit).toHaveBeenCalledWith('b', 'a')
  })

  it('commits one step down on a short vertical swipe from the first row', async () => {
    const onCommit = vi.fn()
    render(
      <MemoMobileReorderProvider folderIds={['a', 'b', 'c']} onCommit={onCommit}>
        <ul>
          <Row id="a" name="A" index={0} total={3} />
          <Row id="b" name="B" index={1} total={3} />
          <Row id="c" name="C" index={2} total={3} />
        </ul>
      </MemoMobileReorderProvider>,
    )

    const handle = screen.getByLabelText('Aの並べ替え')
    handle.setPointerCapture = vi.fn()
    handle.releasePointerCapture = vi.fn()

    await act(async () => {
      fireEvent.pointerDown(handle, {
        clientX: 100,
        clientY: 200,
        button: 0,
        pointerId: 1,
      })
      fireEvent.pointerMove(handle, {
        clientX: 100,
        clientY: 220,
        button: 0,
        pointerId: 1,
      })
      fireEvent.pointerUp(handle, {
        clientX: 100,
        clientY: 220,
        button: 0,
        pointerId: 1,
      })
    })

    expect(onCommit).toHaveBeenCalledWith('a', 'c')
  })
})
