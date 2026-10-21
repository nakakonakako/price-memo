// @vitest-environment jsdom
import '@/test/pointerEventPolyfill'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { applyAuthIdentity, resetAuthIdentityForTests } from '@/lib/authIdentity'
import { AuthProvider } from '@/contexts/AuthContext'

const listFolders = vi.fn()
const listMemoItems = vi.fn()
const listRecordsForFolders = vi.fn()
const reorderMemoItems = vi.fn()
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
    removeMemoItem: vi.fn(),
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
    cleanup()
    resetAuthIdentityForTests()
  })

  it('shows reorder handles and moves item with arrow key', async () => {
    listMemoItems.mockResolvedValue([memoItem('folder-a', 0), memoItem('folder-b', 1)])
    reorderMemoItems.mockResolvedValue(undefined)

    renderPage()

    await waitFor(() => {
      expect(screen.getByLabelText('Aの並べ替え')).toBeTruthy()
    })

    const handle = screen.getByLabelText('Bの並べ替え')
    handle.focus()
    await act(async () => {
      fireEvent.keyDown(handle, { key: 'ArrowUp' })
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

  it('does not toggle card open when the reorder handle is clicked', async () => {
    listMemoItems.mockResolvedValue([memoItem('folder-a', 0), memoItem('folder-b', 1)])
    reorderMemoItems.mockResolvedValue(undefined)

    renderPage()

    await waitFor(() => {
      expect(screen.getByLabelText('Bの並べ替え')).toBeTruthy()
    })

    const handle = screen.getByLabelText('Bの並べ替え')
    await act(async () => {
      fireEvent.click(handle)
    })

    expect(screen.queryByLabelText('確認日')).toBeNull()

    const cardTitle = screen.getByText('B')
    await act(async () => {
      fireEvent.click(cardTitle)
    })

    await waitFor(() => {
      expect(screen.getByLabelText('確認日')).toBeTruthy()
    })
  })

  it('moves one step with a short vertical swipe on the handle', async () => {
    listMemoItems.mockResolvedValue([memoItem('folder-a', 0), memoItem('folder-b', 1)])
    reorderMemoItems.mockResolvedValue(undefined)

    renderPage()

    await waitFor(() => {
      expect(screen.getByLabelText('Bの並べ替え')).toBeTruthy()
    })

    const handle = screen.getByLabelText('Bの並べ替え')
    await act(async () => {
      pointerSwipe(handle, { dy: -20 })
    })

    await waitFor(() => {
      expect(reorderMemoItems).toHaveBeenCalledWith(
        ['folder-a', 'folder-b'],
        ['folder-b', 'folder-a'],
      )
    })
  })

  it('moves one step down with a short vertical swipe from the first handle', async () => {
    listMemoItems.mockResolvedValue([
      memoItem('folder-a', 0),
      memoItem('folder-b', 1),
      memoItem('folder-c', 2),
    ])
    listFolders.mockResolvedValue([folderA, folderB, folderC])
    reorderMemoItems.mockResolvedValue(undefined)

    renderPage()

    await waitFor(() => {
      expect(screen.getByLabelText('Aの並べ替え')).toBeTruthy()
    })

    const handle = screen.getByLabelText('Aの並べ替え')
    await act(async () => {
      pointerSwipe(handle, { dy: 20 })
    })

    await waitFor(() => {
      expect(reorderMemoItems).toHaveBeenCalledWith(
        ['folder-a', 'folder-b', 'folder-c'],
        ['folder-b', 'folder-a', 'folder-c'],
      )
    })
  })

  it('commits drag reorder when dragging the first item to the end of the list', async () => {
    listMemoItems.mockResolvedValue([
      memoItem('folder-a', 0),
      memoItem('folder-b', 1),
      memoItem('folder-c', 2),
    ])
    listFolders.mockResolvedValue([folderA, folderB, folderC])
    reorderMemoItems.mockResolvedValue(undefined)

    renderPage()

    await waitFor(() => {
      expect(screen.getByLabelText('Aの並べ替え')).toBeTruthy()
    })

    await withListItemRectsAsync(async () => {
      const handle = screen.getByLabelText('Aの並べ替え')
      await act(async () => {
        pointerSwipe(handle, { dy: 0, endY: 280 })
      })

      await waitFor(() => {
        expect(reorderMemoItems).toHaveBeenCalledWith(
          ['folder-a', 'folder-b', 'folder-c'],
          ['folder-b', 'folder-c', 'folder-a'],
        )
      })
    })
  })

  it('commits drag reorder after a long vertical swipe', async () => {
    listMemoItems.mockResolvedValue([
      memoItem('folder-a', 0),
      memoItem('folder-b', 1),
      memoItem('folder-c', 2),
    ])
    listFolders.mockResolvedValue([folderA, folderB, folderC])
    reorderMemoItems.mockResolvedValue(undefined)

    renderPage()

    await waitFor(() => {
      expect(screen.getByLabelText('Bの並べ替え')).toBeTruthy()
    })

    await withListItemRectsAsync(async () => {
      const handle = screen.getByLabelText('Bの並べ替え')
      await act(async () => {
        pointerSwipe(handle, { dy: 0, endY: 30 })
      })

      await waitFor(() => {
        expect(reorderMemoItems).toHaveBeenCalledWith(
          ['folder-a', 'folder-b', 'folder-c'],
          ['folder-b', 'folder-a', 'folder-c'],
        )
      })
    })
  })

  it('does not commit reorder when pointer is cancelled mid-drag', async () => {
    listMemoItems.mockResolvedValue([memoItem('folder-a', 0), memoItem('folder-b', 1)])
    reorderMemoItems.mockResolvedValue(undefined)

    renderPage()

    await waitFor(() => {
      expect(screen.getByLabelText('Bの並べ替え')).toBeTruthy()
    })

    const handle = screen.getByLabelText('Bの並べ替え')
    await act(async () => {
      pointerSwipe(handle, { dy: -40, cancel: true })
    })

    expect(reorderMemoItems).not.toHaveBeenCalled()
  })

  it('shows insertion marker before the first row while dragging upward', async () => {
    listMemoItems.mockResolvedValue([memoItem('folder-a', 0), memoItem('folder-b', 1)])
    reorderMemoItems.mockResolvedValue(undefined)

    renderPage()

    await waitFor(() => {
      expect(screen.getByLabelText('Bの並べ替え')).toBeTruthy()
    })

    await withListItemRectsAsync(async () => {
      const handle = screen.getByLabelText('Bの並べ替え')
      handle.setPointerCapture = vi.fn()
      await act(async () => {
        fireEvent.pointerDown(handle, {
          clientX: 100,
          clientY: 200,
          button: 0,
          buttons: 1,
          pointerId: 1,
          pointerType: 'touch',
          isPrimary: true,
        })
        fireEvent.pointerMove(handle, {
          clientX: 100,
          clientY: 30,
          button: 0,
          buttons: 1,
          pointerId: 1,
          pointerType: 'touch',
          isPrimary: true,
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
      expect(screen.getByLabelText('Bの並べ替え')).toBeTruthy()
    })

    const handle = screen.getByLabelText('Bの並べ替え')
    handle.focus()
    await act(async () => {
      fireEvent.keyDown(handle, { key: 'ArrowUp' })
    })

    await waitFor(() => {
      expect(reorderMemoItems).toHaveBeenCalled()
    })

    expect(liveRegion()?.textContent ?? '').not.toMatch(/移動しました/)
  })

  it('keeps touch-action on the handle only', async () => {
    listMemoItems.mockResolvedValue([memoItem('folder-a', 0), memoItem('folder-b', 1)])
    reorderMemoItems.mockResolvedValue(undefined)

    renderPage()

    await waitFor(() => {
      expect(screen.getByLabelText('Bの並べ替え')).toBeTruthy()
    })

    const handle = screen.getByLabelText('Bの並べ替え')
    expect(handle.className).toContain('touch-none')

    const cardTitle = screen.getByText('B')
    expect(cardTitle.className).not.toContain('touch-none')
  })

  it('uses measured placeholder height while lifted', async () => {
    listMemoItems.mockResolvedValue([memoItem('folder-a', 0), memoItem('folder-b', 1)])
    reorderMemoItems.mockResolvedValue(undefined)

    const rowHeight = 132

    await withListItemRectsAsync(async () => {
      renderPage()

      await waitFor(() => {
        expect(screen.getByLabelText('Bの並べ替え')).toBeTruthy()
      })

      const handle = screen.getByLabelText('Bの並べ替え')
      handle.setPointerCapture = vi.fn()
      await act(async () => {
        fireEvent.pointerDown(handle, {
          clientX: 120,
          clientY: 240,
          button: 0,
          buttons: 1,
          pointerId: 1,
          pointerType: 'touch',
          isPrimary: true,
        })
        fireEvent.pointerMove(handle, {
          clientX: 120,
          clientY: 200,
          button: 0,
          buttons: 1,
          pointerId: 1,
          pointerType: 'touch',
          isPrimary: true,
        })
      })

      await waitFor(() => {
        const placeholder = document.querySelector(
          'li [aria-hidden="true"].border-dashed',
        ) as HTMLElement | null
        expect(placeholder?.style.height).toBe(`${rowHeight}px`)
      })
    }, rowHeight)
  })
})
