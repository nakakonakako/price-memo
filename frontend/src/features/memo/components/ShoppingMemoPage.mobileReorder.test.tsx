// @vitest-environment jsdom
import '@/test/pointerEventPolyfill'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { applyAuthIdentity, resetAuthIdentityForTests } from '@/lib/authIdentity'
import { AuthProvider } from '@/contexts/AuthContext'
import { MEMO_REORDER_LONG_PRESS_MS } from './memoMobileReorderGesture'

const listFolders = vi.fn()
const listMemoItems = vi.fn()
const listRecordsForFolders = vi.fn()
const reorderMemoItems = vi.fn()
const removeMemoItem = vi.fn()
const getSession = vi.fn()
const onAuthStateChange = vi.fn()

vi.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: () => true,
}))

vi.mock('@/features/folders/api/foldersApi', () => ({
  createFolder: vi.fn(),
  listFolders: () => listFolders(),
}))

vi.mock('@/features/records/api/recordsApi', () => ({
  listRecords: vi.fn(),
  listRecordsForFolders: (ids: string[]) => listRecordsForFolders(ids),
}))

vi.mock('../api/memoApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/memoApi')>()
  return {
    ...actual,
    addMemoItem: vi.fn(),
    removeMemoItem: (...args: unknown[]) => removeMemoItem(...args),
    listMemoItems: () => listMemoItems(),
    reorderMemoItems: (...args: unknown[]) => reorderMemoItems(...args),
  }
})

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => getSession(),
      onAuthStateChange: (cb: (event: string, session: unknown) => void) =>
        onAuthStateChange(cb),
    },
  },
}))

import { ShoppingMemoPage } from './ShoppingMemoPage'

const folderA = {
  id: 'folder-a',
  user_id: 'user-a',
  name: 'A',
  created_at: '2026-01-01T00:00:00Z',
}
const folderB = {
  id: 'folder-b',
  user_id: 'user-a',
  name: 'B',
  created_at: '2026-01-01T00:00:00Z',
}
const folderC = {
  id: 'folder-c',
  user_id: 'user-a',
  name: 'C',
  created_at: '2026-01-01T00:00:00Z',
}

function memoItem(folderId: string, sortOrder: number) {
  const folder =
    folderId === 'folder-a'
      ? folderA
      : folderId === 'folder-b'
        ? folderB
        : folderC
  return {
    id: `memo-${folderId}`,
    user_id: 'user-a',
    folder_id: folderId,
    sort_order: sortOrder,
    created_at: '2026-01-01T00:00:00Z',
    folder,
  }
}

function renderPage() {
  return render(
    <AuthProvider>
      <ShoppingMemoPage active />
    </AuthProvider>,
  )
}

function liveRegion() {
  return document.querySelector('[aria-live="polite"]')
}

function withListItemRects(
  run: () => void | Promise<void>,
  rowHeight = 80,
): void | Promise<void> {
  const original = HTMLElement.prototype.getBoundingClientRect
  HTMLElement.prototype.getBoundingClientRect = function () {
    const base = original.call(this)
    if (this.tagName === 'LI') {
      const items = Array.from(document.querySelectorAll('li'))
      const index = items.indexOf(this as HTMLLIElement)
      const top = index >= 0 ? index * (rowHeight + 8) : 0
      return {
        ...base,
        top,
        left: base.left || 0,
        right: base.right || 320,
        bottom: top + rowHeight,
        height: rowHeight,
        width: base.width || 320,
      }
    }
    return base
  }
  const result = run()
  const restore = () => {
    HTMLElement.prototype.getBoundingClientRect = original
  }
  if (result instanceof Promise) {
    return result.finally(restore)
  }
  restore()
}

async function withListItemRectsAsync(
  run: () => void | Promise<void>,
  rowHeight = 80,
) {
  await withListItemRects(run, rowHeight)
}

function folderCardLi(folderName: string) {
  const title = within(document.body).getByText(folderName, {
    selector: '[data-memo-compact-title]',
  })
  const li = title.closest('li')
  if (!li) throw new Error(`folder card not found: ${folderName}`)
  return li as HTMLElement
}

function cardGestureSurface(folderName: string) {
  const li = folderCardLi(folderName)
  const surface = li.querySelector(':scope > .flex > .min-w-0.flex-1')
  if (!surface) throw new Error(`gesture surface not found: ${folderName}`)
  return surface as HTMLElement
}

function swipeRowInner(folderName: string) {
  const li = folderCardLi(folderName)
  const swipeRow = li.querySelector('[style*="translateX"]')?.parentElement
  return swipeRow?.querySelector('[style*="translateX"]') as HTMLElement
}

function reorderA11yButton(folderName: string) {
  return screen.getByLabelText(`${folderName}の並べ替え`)
}

async function withLongPressTimers(run: () => void | Promise<void>) {
  vi.useFakeTimers()
  try {
    await run()
  } finally {
    vi.useRealTimers()
  }
}

function touchAt(
  el: HTMLElement,
  type: 'start' | 'move' | 'end' | 'cancel',
  clientY: number,
  clientX = 120,
  opts?: { cancelable?: boolean },
) {
  const touch = { identifier: 1, clientX, clientY, target: el }
  if (type === 'start') {
    fireEvent.touchStart(el, { touches: [touch], targetTouches: [touch] })
  } else if (type === 'move') {
    fireEvent.touchMove(el, {
      touches: [touch],
      targetTouches: [touch],
      cancelable: opts?.cancelable ?? true,
    })
  } else if (type === 'cancel') {
    fireEvent.touchCancel(el, { touches: [], changedTouches: [touch] })
  } else {
    fireEvent.touchEnd(el, { changedTouches: [touch], touches: [] })
  }
}

async function longPressDrag(
  el: HTMLElement,
  endY: number,
  opts?: { cancel?: boolean },
) {
  await withLongPressTimers(async () => {
    await act(async () => {
      touchAt(el, 'start', 240)
      vi.advanceTimersByTime(MEMO_REORDER_LONG_PRESS_MS)
      touchAt(el, 'move', endY)
      if (opts?.cancel) {
        touchAt(el, 'cancel', endY)
      } else {
        touchAt(el, 'end', endY)
      }
    })
  })
}

function pointerSwipe(
  el: HTMLElement,
  opts: { dy: number; dx?: number; cancel?: boolean; endY?: number },
) {
  const startX = 120
  const startY = 240
  const dx = opts.dx ?? 0
  const endY = opts.endY ?? startY + (opts.dy ?? 0)
  const pointerInit = {
    clientX: startX,
    clientY: startY,
    button: 0,
    buttons: 1,
    pointerId: 1,
    pointerType: 'touch',
    isPrimary: true,
  }
  el.setPointerCapture = vi.fn()
  el.releasePointerCapture = vi.fn()
  fireEvent.pointerDown(el, pointerInit)
  if (endY !== startY || dx !== 0) {
    fireEvent.pointerMove(el, {
      ...pointerInit,
      clientX: startX + dx,
      clientY: endY,
    })
  }
  if (opts.cancel) {
    fireEvent.pointerCancel(el, {
      ...pointerInit,
      clientX: startX + dx,
      clientY: endY,
    })
    return
  }
  fireEvent.pointerUp(el, {
    ...pointerInit,
    clientX: startX + dx,
    clientY: endY,
    buttons: 0,
  })
}

describe('ShoppingMemoPage mobile reorder', () => {
  beforeEach(() => {
    resetAuthIdentityForTests()
    listFolders.mockReset()
    listMemoItems.mockReset()
    listRecordsForFolders.mockReset()
    reorderMemoItems.mockReset()
    removeMemoItem.mockReset()
    getSession.mockReset()
    onAuthStateChange.mockReset()

    onAuthStateChange.mockImplementation(() => {
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    })
    getSession.mockResolvedValue({
      data: {
        session: {
          user: { id: 'user-a' },
          access_token: 'token-a',
          refresh_token: 'refresh',
        },
      },
    })

    listFolders.mockResolvedValue([folderA, folderB])
    listRecordsForFolders.mockResolvedValue([])
    applyAuthIdentity({
      access_token: 'token-a',
      refresh_token: 'refresh',
      expires_in: 3600,
      token_type: 'bearer',
      user: {
        id: 'user-a',
        aud: 'authenticated',
        role: 'authenticated',
        email: 'a@example.com',
        app_metadata: {},
        user_metadata: {},
        created_at: '2026-01-01T00:00:00Z',
      },
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    cleanup()
    resetAuthIdentityForTests()
  })

  it('moves item with arrow key on the screen-reader reorder control', async () => {
    listMemoItems.mockResolvedValue([memoItem('folder-a', 0), memoItem('folder-b', 1)])
    reorderMemoItems.mockResolvedValue(undefined)

    renderPage()

    await waitFor(() => {
      expect(reorderA11yButton('B')).toBeTruthy()
    })

    const control = reorderA11yButton('B')
    expect(control.classList.contains('memo-reorder-a11y-btn')).toBe(true)
    control.focus()
    await act(async () => {
      fireEvent.keyDown(control, { key: 'ArrowUp' })
    })

    await waitFor(() => {
      expect(reorderMemoItems).toHaveBeenCalledWith(
        ['folder-a', 'folder-b'],
        ['folder-b', 'folder-a'],
      )
    })

    await waitFor(() => {
      expect(liveRegion()?.textContent).toBe('Bを1番目に移動しました')
    })
  })

  it('commits drag reorder when long-pressing and dragging the first item to the end', async () => {
    listMemoItems.mockResolvedValue([
      memoItem('folder-a', 0),
      memoItem('folder-b', 1),
      memoItem('folder-c', 2),
    ])
    listFolders.mockResolvedValue([folderA, folderB, folderC])
    reorderMemoItems.mockResolvedValue(undefined)

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('A')).toBeTruthy()
    })

    await withListItemRectsAsync(async () => {
      const surface = cardGestureSurface('A')
      await longPressDrag(surface, 280)

      await waitFor(() => {
        expect(reorderMemoItems).toHaveBeenCalledWith(
          ['folder-a', 'folder-b', 'folder-c'],
          ['folder-b', 'folder-c', 'folder-a'],
        )
      })
    })
  })

  it('commits drag reorder after long press and a small vertical move', async () => {
    listMemoItems.mockResolvedValue([
      memoItem('folder-a', 0),
      memoItem('folder-b', 1),
      memoItem('folder-c', 2),
    ])
    listFolders.mockResolvedValue([folderA, folderB, folderC])
    reorderMemoItems.mockResolvedValue(undefined)

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('B')).toBeTruthy()
    })

    await withListItemRectsAsync(async () => {
      const surface = cardGestureSurface('B')
      await longPressDrag(surface, 30)

      await waitFor(() => {
        expect(reorderMemoItems).toHaveBeenCalledWith(
          ['folder-a', 'folder-b', 'folder-c'],
          ['folder-b', 'folder-a', 'folder-c'],
        )
      })
    })
  })

  it('does not commit reorder when touch is cancelled mid-drag', async () => {
    listMemoItems.mockResolvedValue([memoItem('folder-a', 0), memoItem('folder-b', 1)])
    reorderMemoItems.mockResolvedValue(undefined)

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('B')).toBeTruthy()
    })

    const surface = cardGestureSurface('B')
    await longPressDrag(surface, 180, { cancel: true })

    expect(reorderMemoItems).not.toHaveBeenCalled()
  })

  it('shows insertion marker before the first row while dragging upward', async () => {
    listMemoItems.mockResolvedValue([memoItem('folder-a', 0), memoItem('folder-b', 1)])
    reorderMemoItems.mockResolvedValue(undefined)

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('B')).toBeTruthy()
    })

    await withListItemRectsAsync(async () => {
      const surface = cardGestureSurface('B')
      await withLongPressTimers(async () => {
        await act(async () => {
          touchAt(surface, 'start', 200)
          vi.advanceTimersByTime(MEMO_REORDER_LONG_PRESS_MS)
          touchAt(surface, 'move', 30)
        })
      })

      await waitFor(() => {
        expect(document.querySelector('.bg-stone-800.h-1')).toBeTruthy()
      })
    })
  })

  it('does not announce success when reorder RPC fails', async () => {
    listMemoItems.mockResolvedValue([memoItem('folder-a', 0), memoItem('folder-b', 1)])
    reorderMemoItems.mockRejectedValue(new Error('network'))

    renderPage()

    await waitFor(() => {
      expect(reorderA11yButton('B')).toBeTruthy()
    })

    const control = reorderA11yButton('B')
    control.focus()
    await act(async () => {
      fireEvent.keyDown(control, { key: 'ArrowUp' })
    })

    await waitFor(() => {
      expect(reorderMemoItems).toHaveBeenCalled()
    })

    expect(liveRegion()?.textContent ?? '').not.toMatch(/移動しました/)
  })

  it('cancels long press when finger moves before hold completes', async () => {
    listMemoItems.mockResolvedValue([memoItem('folder-a', 0), memoItem('folder-b', 1)])
    reorderMemoItems.mockResolvedValue(undefined)

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('B')).toBeTruthy()
    })

    const surface = cardGestureSurface('B')
    await withLongPressTimers(async () => {
      await act(async () => {
        touchAt(surface, 'start', 200)
        touchAt(surface, 'move', 170)
        vi.advanceTimersByTime(MEMO_REORDER_LONG_PRESS_MS)
        touchAt(surface, 'end', 170)
      })
    })

    expect(reorderMemoItems).not.toHaveBeenCalled()
  })

  it('uses compact sibling row height for lifted placeholder', async () => {
    listMemoItems.mockResolvedValue([memoItem('folder-a', 0), memoItem('folder-b', 1)])
    reorderMemoItems.mockResolvedValue(undefined)

    const compactRowHeight = 52

    await withListItemRectsAsync(async () => {
      renderPage()

      await waitFor(() => {
        expect(screen.getByText('B')).toBeTruthy()
      })

      const surface = cardGestureSurface('B')
      await withLongPressTimers(async () => {
        await act(async () => {
          touchAt(surface, 'start', 240)
          vi.advanceTimersByTime(MEMO_REORDER_LONG_PRESS_MS)
          touchAt(surface, 'move', 200)
        })
      })

      await waitFor(() => {
        const placeholder = document.querySelector(
          'li [aria-hidden="true"].border-dashed',
        ) as HTMLElement | null
        expect(placeholder?.style.height).toBe(`${compactRowHeight}px`)
      })
    }, compactRowHeight)
  })

  it('does not start reorder when swiping horizontally for delete', async () => {
    listMemoItems.mockResolvedValue([memoItem('folder-a', 0), memoItem('folder-b', 1)])
    reorderMemoItems.mockResolvedValue(undefined)

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('B')).toBeTruthy()
    })

    const swipeRow = screen.getByText('B').closest('[style*="translateX"]')
      ?.parentElement as HTMLElement
    const inner = swipeRow?.querySelector('[style*="translateX"]') as HTMLElement

    await withLongPressTimers(async () => {
      await act(async () => {
        touchAt(cardGestureSurface('B'), 'start', 200)
        pointerSwipe(inner, { dx: -120, dy: 0, endY: 200 })
        vi.advanceTimersByTime(MEMO_REORDER_LONG_PRESS_MS)
      })
    })

    expect(reorderMemoItems).not.toHaveBeenCalled()
  })

  it('does not delete when horizontal pointer moves after long-press drag starts', async () => {
    listMemoItems.mockResolvedValue([memoItem('folder-a', 0), memoItem('folder-b', 1)])
    reorderMemoItems.mockResolvedValue(undefined)
    removeMemoItem.mockResolvedValue(undefined)

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('B')).toBeTruthy()
    })

    const surface = cardGestureSurface('B')

    await withListItemRectsAsync(async () => {
      await withLongPressTimers(async () => {
        await act(async () => {
          touchAt(surface, 'start', 240)
          vi.advanceTimersByTime(MEMO_REORDER_LONG_PRESS_MS)
          touchAt(surface, 'move', 200)
        })
      })

      const inner = swipeRowInner('B')
      await act(async () => {
        pointerSwipe(inner, { dx: -140, dy: 0, endY: 240 })
      })

      await withLongPressTimers(async () => {
        await act(async () => {
          touchAt(surface, 'end', 200)
        })
      })
    })

    expect(removeMemoItem).not.toHaveBeenCalled()
  })

  it('swipes left to delete once before long press completes', async () => {
    listMemoItems.mockResolvedValue([memoItem('folder-a', 0), memoItem('folder-b', 1)])
    reorderMemoItems.mockResolvedValue(undefined)
    removeMemoItem.mockResolvedValue(undefined)

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('B')).toBeTruthy()
    })

    const inner = swipeRowInner('B')
    await act(async () => {
      pointerSwipe(inner, { dx: -140, dy: 0, endY: 240 })
    })

    await waitFor(() => {
      expect(removeMemoItem).toHaveBeenCalledTimes(1)
      expect(removeMemoItem).toHaveBeenCalledWith('folder-b')
    })
    expect(reorderMemoItems).not.toHaveBeenCalled()
  })

  it('does not start reorder from the card title toggle region', async () => {
    listMemoItems.mockResolvedValue([memoItem('folder-a', 0), memoItem('folder-b', 1)])
    reorderMemoItems.mockResolvedValue(undefined)

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('B')).toBeTruthy()
    })

    const titleToggle = screen.getByText('B').closest('[data-memo-card-toggle]')
    expect(titleToggle).toBeTruthy()

    await withLongPressTimers(async () => {
      await act(async () => {
        touchAt(titleToggle as HTMLElement, 'start', 240)
        vi.advanceTimersByTime(MEMO_REORDER_LONG_PRESS_MS)
        touchAt(titleToggle as HTMLElement, 'move', 180)
        touchAt(titleToggle as HTMLElement, 'end', 180)
      })
    })

    expect(reorderMemoItems).not.toHaveBeenCalled()
  })

  it('keeps open state and form input after a successful compact-list reorder', async () => {
    listMemoItems.mockResolvedValue([memoItem('folder-a', 0), memoItem('folder-b', 1)])
    reorderMemoItems.mockResolvedValue(undefined)

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('B')).toBeTruthy()
    })

    await act(async () => {
      fireEvent.click(screen.getByText('B'))
    })

    await waitFor(() => {
      expect(screen.getByLabelText('確認日')).toBeTruthy()
    })

    const storeInput = screen.getByLabelText('店名') as HTMLInputElement
    await act(async () => {
      fireEvent.change(storeInput, { target: { value: 'テスト店' } })
    })

    await withListItemRectsAsync(async () => {
      await longPressDrag(cardGestureSurface('B'), 30)
    })

    await waitFor(() => {
      expect(reorderMemoItems).toHaveBeenCalledWith(
        ['folder-a', 'folder-b'],
        ['folder-b', 'folder-a'],
      )
    })

    await waitFor(() => {
      expect(screen.getByLabelText('確認日')).toBeTruthy()
      expect((screen.getByLabelText('店名') as HTMLInputElement).value).toBe(
        'テスト店',
      )
    })
  })

  it('does not call reorder RPC on non-cancelable touchmove during drag', async () => {
    listMemoItems.mockResolvedValue([memoItem('folder-a', 0), memoItem('folder-b', 1)])
    reorderMemoItems.mockResolvedValue(undefined)

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('B')).toBeTruthy()
    })

    const surface = cardGestureSurface('B')

    await withLongPressTimers(async () => {
      await act(async () => {
        touchAt(surface, 'start', 240)
        vi.advanceTimersByTime(MEMO_REORDER_LONG_PRESS_MS)
        touchAt(surface, 'move', 200, 120, { cancelable: false })
        touchAt(surface, 'end', 200)
      })
    })

    expect(reorderMemoItems).not.toHaveBeenCalled()
  })
})
