// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import type { PriceRecord } from '@/features/records/types'
import type { PriceFolder } from '../types'

if (typeof globalThis.PointerEvent === 'undefined') {
  globalThis.PointerEvent = class extends MouseEvent {
    readonly pointerId: number
    readonly pointerType: string
    readonly isPrimary: boolean

    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params)
      this.pointerId = params.pointerId ?? 0
      this.pointerType = params.pointerType ?? 'mouse'
      this.isPrimary = params.isPrimary ?? true
    }
  } as typeof PointerEvent
}

const useMediaQuery = vi.fn()
const deleteRecord = vi.fn()
const listAllRecords = vi.fn()
const listRecords = vi.fn()

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getSession: vi.fn(), onAuthStateChange: vi.fn() },
  },
}))

vi.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: (query: string) => useMediaQuery(query),
}))

vi.mock('../hooks/useFolders', () => ({
  useFolders: () => ({
    folders: [folder],
    isLoading: false,
    isMutating: false,
    error: null,
    create: vi.fn(),
    rename: vi.fn(),
    remove: vi.fn(),
    refresh: vi.fn(),
  }),
}))

vi.mock('@/features/records/api/recordsApi', () => ({
  createRecord: vi.fn(),
  deleteRecord: (...args: unknown[]) => deleteRecord(...args),
  listAllRecords: () => listAllRecords(),
  listRecords: (...args: unknown[]) => listRecords(...args),
  updateRecord: vi.fn(),
}))

const { getStoresCached } = vi.hoisted(() => ({
  getStoresCached: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/features/stores/api/storesApi', () => ({
  createStore: vi.fn(),
  deleteStore: vi.fn(),
  getStoresCached,
  getStoresCacheEpoch: vi.fn().mockReturnValue(0),
  peekStoresCache: vi.fn().mockReturnValue([]),
  removeFromStoresCache: vi.fn(),
  renameStore: vi.fn(),
  setStoresCache: vi.fn(),
  upsertStoresCache: vi.fn(),
}))

vi.mock('@/features/trends/components/FolderTrendPanel', () => ({
  FolderTrendPanel: () => null,
}))

vi.mock('@/components/ScrollToTopButton', () => ({
  ScrollToTopButton: () => null,
}))

import { FoldersPage } from './FoldersPage'

const folder: PriceFolder = {
  id: 'folder-1',
  user_id: 'user-1',
  name: '牛乳（ぎゅうにゅう）',
  created_at: '2026-01-01T00:00:00Z',
}

const recordA: PriceRecord = {
  id: 'record-a',
  user_id: 'user-1',
  folder_id: folder.id,
  recorded_at: '2026-03-02',
  store_name: '店A',
  price: 200,
  amount: 1,
  unit: '本',
  note: null,
  receipt_item_id: null,
  label_image_path: null,
  sort_order: 0,
  created_at: '2026-03-02T00:00:00Z',
  updated_at: '2026-03-02T00:00:00Z',
}

const recordB: PriceRecord = {
  ...recordA,
  id: 'record-b',
  recorded_at: '2026-03-01',
  created_at: '2026-03-01T00:00:00Z',
  updated_at: '2026-03-01T00:00:00Z',
}

function ensurePointerCapture() {
  if (!HTMLElement.prototype.setPointerCapture) {
    HTMLElement.prototype.setPointerCapture = vi.fn()
  }
  if (!HTMLElement.prototype.releasePointerCapture) {
    HTMLElement.prototype.releasePointerCapture = vi.fn()
  }
}

function dispatchPointer(
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  target: HTMLElement,
  init: {
    clientX: number
    clientY: number
    pointerId: number
    button?: number
  },
) {
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: init.clientX,
      clientY: init.clientY,
      pointerId: init.pointerId,
      pointerType: 'mouse',
      isPrimary: true,
      button: init.button ?? 0,
    }),
  )
}

function pointerTap(target: HTMLElement, clientX: number, clientY: number) {
  const pointerId = 10
  dispatchPointer('pointerdown', target, { clientX, clientY, pointerId })
  dispatchPointer('pointerup', target, { clientX, clientY, pointerId })
}

function pointerDrag(
  target: HTMLElement,
  points: Array<{ clientX: number; clientY: number; pointerId: number }>,
) {
  const [first, ...moves] = points
  dispatchPointer('pointerdown', target, { ...first, button: 0 })
  for (const point of moves) {
    dispatchPointer('pointermove', target, point)
  }
  const last = points[points.length - 1]
  dispatchPointer('pointerup', target, { ...last, button: 0 })
}

function mockRect(el: HTMLElement, rect: Partial<DOMRect>) {
  const full: DOMRect = {
    x: rect.left ?? 0,
    y: rect.top ?? 0,
    width: rect.width ?? 200,
    height: rect.height ?? 48,
    top: rect.top ?? 0,
    left: rect.left ?? 0,
    right: (rect.left ?? 0) + (rect.width ?? 200),
    bottom: (rect.top ?? 0) + (rect.height ?? 48),
    toJSON: () => ({}),
  }
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue(full)
}

function recordRowLabelText(record: PriceRecord, compact = true) {
  const date =
    compact && record.recorded_at === '2026-03-02'
      ? '3/2'
      : compact && record.recorded_at === '2026-03-01'
        ? '3/1'
        : record.recorded_at
  return `${date} · ${record.store_name}`
}

function recordRowSummary(record: PriceRecord, compact = true) {
  return new RegExp(recordRowLabelText(record, compact))
}

function findRecordListItem(record: PriceRecord, compact = true) {
  const matches = screen.getAllByText(recordRowSummary(record, compact))
  for (const node of matches) {
    const li = node.closest('li')
    if (li?.querySelector('button[aria-label="複製"]')) {
      return li
    }
  }
  throw new Error('record list item not found')
}

async function waitForCatalogRecords(recordCount = 2) {
  await waitFor(() => {
    expect(
      screen.getByRole('button', {
        name: `すべての記録（${recordCount}）`,
      }),
    ).toBeTruthy()
  })
}

function folderCardSurface() {
  return screen.getByText('牛乳')
}

function recordRowUsesTrashDrag(li: HTMLElement) {
  const wrapper = li.firstElementChild
  return wrapper?.classList.contains('touch-none') === true
}

function findSwipeSurface(li: HTMLElement) {
  const root = li.firstElementChild
  if (!root) throw new Error('swipe root not found')
  const surface = Array.from(root.children).find((el) =>
    el.classList.contains('bg-inherit'),
  )
  if (!(surface instanceof HTMLElement)) {
    throw new Error('swipe surface not found')
  }
  return surface
}

function findTrashDragSurface(li: HTMLElement) {
  const wrapper = li.firstElementChild
  if (!wrapper?.classList.contains('touch-none')) {
    throw new Error('trash drag wrapper not found')
  }
  return wrapper as HTMLElement
}

function performLeftSwipe(
  surface: HTMLElement,
  opts?: { distance?: number; rowWidth?: number },
) {
  const distance = opts?.distance ?? 160
  const rowWidth = opts?.rowWidth ?? 320
  const swipeRoot = surface.closest('.relative.overflow-hidden') as HTMLElement
  if (swipeRoot) {
    Object.defineProperty(swipeRoot, 'offsetWidth', {
      configurable: true,
      value: rowWidth,
    })
  }
  mockRect(surface, { left: 40, top: 120, width: rowWidth, height: 44 })
  const startX = 180
  const y = 140
  const pointerId = 1
  pointerDrag(surface, [
    { clientX: startX, clientY: y, pointerId },
    { clientX: startX - 12, clientY: y, pointerId },
    { clientX: startX - distance, clientY: y, pointerId },
  ])
}

function performTrashDrag(recordSurface: HTMLElement, trashZone: HTMLElement) {
  mockRect(recordSurface, { left: 40, top: 120, width: 280, height: 44 })
  mockRect(trashZone, { left: 520, top: 80, width: 120, height: 400 })
  const pointerId = 2
  const startX = 120
  const startY = 140
  pointerDrag(recordSurface, [
    { clientX: startX, clientY: startY, pointerId },
    { clientX: startX, clientY: startY + 12, pointerId },
    { clientX: 560, clientY: 200, pointerId },
  ])
}

async function openFolderPreview(
  isDesktop: boolean,
  recordCount = 2,
) {
  await waitForCatalogRecords(recordCount)
  const surface = folderCardSurface()
  await act(async () => {
    if (isDesktop) {
      const dragHost = surface.closest('.touch-none.select-none')
      if (dragHost) {
        mockRect(dragHost as HTMLElement, { left: 0, top: 0, width: 320, height: 64 })
      }
      pointerTap(surface, 40, 32)
    } else {
      const clickTarget =
        surface.closest('.cursor-pointer') ?? surface
      fireEvent.click(clickTarget)
    }
  })
  await waitFor(() => {
    const expected =
      recordCount === 1 ? recordB : recordA
    expect(findRecordListItem(expected)).toBeTruthy()
  })
}

async function openFolderDetailFromRecordCount(recordCount = 2) {
  await waitForCatalogRecords(recordCount)
  fireEvent.click(
    screen.getByRole('button', { name: `すべての記録（${recordCount}）` }),
  )
  await waitFor(() => {
    expect(findRecordListItem(recordA, false)).toBeTruthy()
  })
}

function folderCardTrashDragRoot() {
  const root = folderCardSurface().closest('.touch-none.select-none')
  if (!(root instanceof HTMLElement)) {
    throw new Error('folder card trash drag root not found')
  }
  return root
}

describe('FoldersPage folder record delete', () => {
  beforeEach(() => {
    ensurePointerCapture()
    window.scrollTo = vi.fn()
    deleteRecord.mockReset()
    listAllRecords.mockReset().mockResolvedValue([recordA, recordB])
    listRecords.mockReset().mockResolvedValue([recordA, recordB])
    getStoresCached.mockReset().mockResolvedValue([])
  })

  afterEach(() => {
    cleanup()
  })

  describe('desktop (PC trash drag)', () => {
    beforeEach(() => {
      useMediaQuery.mockReturnValue(true)
    })

    it('enables trash drag on preview and detail record rows', async () => {
      render(<FoldersPage active />)

      await waitFor(() => expect(listAllRecords).toHaveBeenCalled())

      await openFolderPreview(true)
      expect(recordRowUsesTrashDrag(findRecordListItem(recordA))).toBe(true)

      fireEvent.click(
        screen.getByRole('button', { name: `すべての記録（2）` }),
      )
      await waitFor(() => {
        expect(recordRowUsesTrashDrag(findRecordListItem(recordB, false))).toBe(
          true,
        )
      })
    })

    it('removes only the deleted record after trash drop in preview', async () => {
      deleteRecord.mockResolvedValue(undefined)
      render(<FoldersPage active />)
      await waitFor(() => expect(listAllRecords).toHaveBeenCalled())

      await openFolderPreview(true)

      const recordLi = findRecordListItem(recordA)
      const recordSurface = findTrashDragSurface(recordLi)
      const trashZone = screen.getByLabelText('ゴミ箱')

      await act(async () => {
        performTrashDrag(recordSurface, trashZone)
      })

      await waitFor(() => expect(deleteRecord).toHaveBeenCalledWith(recordA.id))
      await waitFor(() => {
        expect(() => findRecordListItem(recordA)).toThrow()
      })
      expect(findRecordListItem(recordB)).toBeTruthy()
      expect(screen.getByText('牛乳')).toBeTruthy()
    })

    it('removes only the deleted record after trash drop in folder detail', async () => {
      deleteRecord.mockResolvedValue(undefined)
      render(<FoldersPage active />)
      await waitFor(() => expect(listAllRecords).toHaveBeenCalled())

      await openFolderDetailFromRecordCount()

      const recordLi = findRecordListItem(recordB, false)
      const recordSurface = findTrashDragSurface(recordLi)
      const trashZone = screen.getByLabelText('ゴミ箱')

      await act(async () => {
        performTrashDrag(recordSurface, trashZone)
      })

      await waitFor(() => expect(deleteRecord).toHaveBeenCalledWith(recordB.id))
      await waitFor(() => {
        expect(() => findRecordListItem(recordB, false)).toThrow()
      })
      expect(findRecordListItem(recordA, false)).toBeTruthy()
      expect(screen.getByRole('button', { name: '一覧へ戻る' })).toBeTruthy()
    })

    it('keeps the record and shows an error when delete fails', async () => {
      deleteRecord.mockRejectedValue(new Error('network'))
      render(<FoldersPage active />)
      await waitFor(() => expect(listAllRecords).toHaveBeenCalled())

      await openFolderPreview(true)

      const recordLi = findRecordListItem(recordA)
      const recordSurface = findTrashDragSurface(recordLi)
      const trashZone = screen.getByLabelText('ゴミ箱')

      await act(async () => {
        performTrashDrag(recordSurface, trashZone)
      })

      await waitFor(() =>
        expect(
          screen.getByText(
            '通信に失敗しました。接続を確認してからもう一度お試しください。',
          ),
        ).toBeTruthy(),
      )
      expect(findRecordListItem(recordA)).toBeTruthy()
    })

    it('does not start folder trash drag when pointerdown begins on a record row', async () => {
      render(<FoldersPage active />)
      await waitFor(() => expect(listAllRecords).toHaveBeenCalled())

      await openFolderPreview(true)

      const folderDragRoot = folderCardTrashDragRoot()
      const folderCaptureSpy = vi.spyOn(folderDragRoot, 'setPointerCapture')

      const recordSurface = findTrashDragSurface(findRecordListItem(recordA))
      await act(async () => {
        dispatchPointer('pointerdown', recordSurface, {
          clientX: 120,
          clientY: 140,
          pointerId: 3,
        })
      })

      expect(folderCaptureSpy).not.toHaveBeenCalled()
      folderCaptureSpy.mockRestore()
    })

    it('keeps expand and action controls on preview rows', async () => {
      render(<FoldersPage active />)
      await waitFor(() => expect(listAllRecords).toHaveBeenCalled())

      await openFolderPreview(true)
      const recordLi = findRecordListItem(recordA)
      expect(
        recordLi.querySelector('button[aria-label="複製"]'),
      ).toBeTruthy()
      expect(recordLi.querySelector('button[aria-label="編集"]')).toBeTruthy()
      fireEvent.click(
        findRecordListItem(recordA).querySelector('p.text-sm') as HTMLElement,
      )
      await waitFor(() => {
        expect(screen.getByText(`${recordA.recorded_at} · 店A`)).toBeTruthy()
      })
    })
  })

  describe('mobile (swipe delete)', () => {
    beforeEach(() => {
      useMediaQuery.mockReturnValue(false)
    })

    it('uses swipe path for preview and detail record rows', async () => {
      render(<FoldersPage active />)
      await waitFor(() => expect(listAllRecords).toHaveBeenCalled())

      await openFolderPreview(false)
      expect(recordRowUsesTrashDrag(findRecordListItem(recordA))).toBe(false)

      fireEvent.click(
        screen.getByRole('button', { name: `すべての記録（2）` }),
      )
      await waitFor(() => {
        expect(recordRowUsesTrashDrag(findRecordListItem(recordB, false))).toBe(
          false,
        )
      })
    })

    it('removes the record via left swipe in preview without removing the folder', async () => {
      deleteRecord.mockResolvedValue(undefined)
      render(<FoldersPage active />)
      await waitFor(() => expect(listAllRecords).toHaveBeenCalled())

      await openFolderPreview(false)

      const recordLi = findRecordListItem(recordA)
      const swipeSurface = findSwipeSurface(recordLi)

      await act(async () => {
        performLeftSwipe(swipeSurface)
      })

      await waitFor(() => expect(deleteRecord).toHaveBeenCalledWith(recordA.id))
      await waitFor(() => {
        expect(() => findRecordListItem(recordA)).toThrow()
      })
      expect(screen.getByText('牛乳')).toBeTruthy()
    })

    it('removes the record via left swipe in folder detail', async () => {
      deleteRecord.mockResolvedValue(undefined)
      render(<FoldersPage active />)
      await waitFor(() => expect(listAllRecords).toHaveBeenCalled())

      await openFolderDetailFromRecordCount()

      const recordLi = findRecordListItem(recordB, false)
      const swipeSurface = findSwipeSurface(recordLi)

      await act(async () => {
        performLeftSwipe(swipeSurface)
      })

      await waitFor(() => expect(deleteRecord).toHaveBeenCalledWith(recordB.id))
      await waitFor(() => {
        expect(() => findRecordListItem(recordB, false)).toThrow()
      })
      expect(findRecordListItem(recordA, false)).toBeTruthy()
      expect(screen.getByRole('button', { name: '一覧へ戻る' })).toBeTruthy()
    })

    it('does not start folder swipe tracking when pointerdown begins on a record row', async () => {
      render(<FoldersPage active />)
      await waitFor(() => expect(listAllRecords).toHaveBeenCalled())

      await openFolderPreview(false)

      const folderLi = folderCardSurface().closest('li')
      if (!(folderLi instanceof HTMLElement)) {
        throw new Error('folder card list item not found')
      }
      const folderSwipeSurface = findSwipeSurface(folderLi)
      const folderCaptureSpy = vi.spyOn(folderSwipeSurface, 'setPointerCapture')

      const swipeSurface = findSwipeSurface(findRecordListItem(recordA))
      await act(async () => {
        dispatchPointer('pointerdown', swipeSurface, {
          clientX: 180,
          clientY: 140,
          pointerId: 4,
        })
      })

      expect(folderCaptureSpy).not.toHaveBeenCalled()
      folderCaptureSpy.mockRestore()
    })

    it('keeps the record and shows an error when swipe delete fails', async () => {
      deleteRecord.mockRejectedValue(new Error('network'))
      render(<FoldersPage active />)
      await waitFor(() => expect(listAllRecords).toHaveBeenCalled())

      await openFolderPreview(false)

      const swipeSurface = findSwipeSurface(findRecordListItem(recordA))
      await act(async () => {
        performLeftSwipe(swipeSurface)
      })

      await waitFor(() =>
        expect(
          screen.getByText(
            '通信に失敗しました。接続を確認してからもう一度お試しください。',
          ),
        ).toBeTruthy(),
      )
      expect(findRecordListItem(recordA)).toBeTruthy()
    })
  })

  describe('reload persistence', () => {
    beforeEach(() => {
      useMediaQuery.mockReturnValue(true)
    })

    it('does not resurrect a deleted record after unmount and remount', async () => {
      let serverRecords: PriceRecord[] = [recordA, recordB]
      listAllRecords.mockImplementation(async () => [...serverRecords])
      listRecords.mockImplementation(async () => [...serverRecords])
      deleteRecord.mockImplementation(async (id: string) => {
        serverRecords = serverRecords.filter((row) => row.id !== id)
      })

      const first = render(<FoldersPage active />)
      await waitFor(() => expect(listAllRecords).toHaveBeenCalled())

      await openFolderPreview(true)

      const recordSurface = findTrashDragSurface(findRecordListItem(recordA))
      const trashZone = screen.getByLabelText('ゴミ箱')
      await act(async () => {
        performTrashDrag(recordSurface, trashZone)
      })

      await waitFor(() => expect(deleteRecord).toHaveBeenCalledWith(recordA.id))
      await waitFor(() => {
        expect(() => findRecordListItem(recordA)).toThrow()
      })

      first.unmount()
      cleanup()
      listAllRecords.mockClear()

      render(<FoldersPage active />)
      await waitFor(() => expect(listAllRecords).toHaveBeenCalled())

      await openFolderPreview(true, 1)

      await waitFor(() => {
        expect(() => findRecordListItem(recordA)).toThrow()
      })
      expect(findRecordListItem(recordB)).toBeTruthy()
      expect(serverRecords.map((row) => row.id)).toEqual([recordB.id])
    })
  })
})
