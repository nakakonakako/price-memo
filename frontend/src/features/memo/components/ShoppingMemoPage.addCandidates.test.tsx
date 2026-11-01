// @vitest-environment jsdom
import type { ReactNode } from 'react'
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
import type { PriceFolder } from '@/features/folders/types'
import { filterFolders } from '@/features/folders/api/foldersApi'

const listFolders = vi.fn()
const listMemoItems = vi.fn()
const listRecords = vi.fn()
const listRecordsForFolders = vi.fn()
const createFolder = vi.fn()
const addMemoItem = vi.fn()
const getSession = vi.fn()
const onAuthStateChange = vi.fn()

vi.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: () => false,
}))

vi.mock('@/features/folders/api/foldersApi', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/features/folders/api/foldersApi')>()
  return {
    ...actual,
    createFolder: (...args: unknown[]) => createFolder(...args),
    listFolders: () => listFolders(),
  }
})

vi.mock('@/features/records/api/recordsApi', () => ({
  listRecords: (...args: unknown[]) => listRecords(...args),
  listRecordsForFolders: (ids: string[]) => listRecordsForFolders(ids),
}))

vi.mock('../api/memoApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/memoApi')>()
  return {
    ...actual,
    addMemoItem: (...args: unknown[]) => addMemoItem(...args),
    removeMemoItem: vi.fn(),
    listMemoItems: () => listMemoItems(),
    reorderMemoItems: vi.fn(),
  }
})

vi.mock('@/components/trash/TrashDragContext', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/components/trash/TrashDragContext')>()
  return {
    ...actual,
    useTrashDrag: () => ({
      registerList: vi.fn(),
      insertBeforeId: null,
      activeId: null,
      activeKind: null,
      dragOverTrash: false,
      dragging: false,
    }),
  }
})

vi.mock('@/components/trash/TrashDragProvider', () => ({
  TrashDragProvider: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  MemoTrashZone: () => null,
}))

const folderMemoCardProps = vi.fn()

vi.mock('./FolderMemoCard', () => ({
  FolderMemoCard: (props: {
    folderId: string
    forceOpen?: boolean
  }) => {
    folderMemoCardProps(props)
    return (
      <li data-testid={`memo-card-${props.folderId}`}>{props.folderId}</li>
    )
  },
}))

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

const folderA: PriceFolder = {
  id: 'folder-a',
  user_id: 'user-a',
  name: 'A',
  created_at: '2026-01-01T00:00:00Z',
}
const folderB: PriceFolder = {
  id: 'folder-b',
  user_id: 'user-a',
  name: 'B',
  created_at: '2026-01-01T00:00:00Z',
}
const folderC: PriceFolder = {
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

async function waitForInitialLoad() {
  await waitFor(() => {
    expect(screen.getByTestId('memo-card-folder-a')).toBeTruthy()
  })
}

async function openAddPanel() {
  fireEvent.click(screen.getByRole('button', { name: 'メモを追加' }))
  await waitFor(() => {
    expect(screen.getByPlaceholderText(/品目名/)).toBeTruthy()
  })
}

function addPanel() {
  const input = screen.getByPlaceholderText(/品目名/)
  return input.closest('div.space-y-2') as HTMLElement
}

describe('ShoppingMemoPage add candidates', () => {
  let memoOnServer: ReturnType<typeof memoItem>[]

  beforeEach(() => {
    resetAuthIdentityForTests()
    listFolders.mockReset()
    listMemoItems.mockReset()
    listRecords.mockReset()
    listRecordsForFolders.mockReset()
    createFolder.mockReset()
    addMemoItem.mockReset()
    getSession.mockReset()
    onAuthStateChange.mockReset()
    folderMemoCardProps.mockReset()

    onAuthStateChange.mockImplementation((cb) => {
      void cb('INITIAL_SESSION', {
        user: { id: 'user-a' },
        access_token: 'token-a',
        refresh_token: 'refresh',
      })
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

    listFolders.mockResolvedValue([folderA, folderB, folderC])
    memoOnServer = [memoItem('folder-a', 0), memoItem('folder-b', 1)]
    listMemoItems.mockImplementation(() => Promise.resolve(memoOnServer))
    listRecords.mockResolvedValue([])
    listRecordsForFolders.mockResolvedValue([])
    addMemoItem.mockImplementation(async (folderId: string) => {
      const item = memoItem(folderId, memoOnServer.length)
      memoOnServer = [item, ...memoOnServer]
      return item
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('shows existing folders that are not on the memo', async () => {
    renderPage()
    await waitForInitialLoad()
    await openAddPanel()

    fireEvent.change(screen.getByPlaceholderText(/品目名/), {
      target: { value: 'C' },
    })

    const panel = addPanel()
    expect(within(panel).getByRole('button', { name: /メモに追加/ })).toBeTruthy()
    expect(within(panel).queryByRole('button', { name: '+ 読み仮名' })).toBeNull()
    expect(within(panel).queryByPlaceholderText('読み仮名（任意）')).toBeNull()
    expect(
      screen.queryByText('一致するフォルダがありません。'),
    ).toBeNull()
  })

  it('shows centered no-match copy when nothing matches', async () => {
    renderPage()
    await waitForInitialLoad()
    await openAddPanel()

    fireEvent.change(screen.getByPlaceholderText(/品目名/), {
      target: { value: 'zzz' },
    })

    const message = screen.getByText('一致するフォルダがありません。')
    expect(message.className).toContain('text-center')
    expect(screen.getByRole('button', { name: '+ 読み仮名' })).toBeTruthy()
    expect(
      screen.queryByText(/追加ボタンで新規作成/),
    ).toBeNull()
  })

  it('keeps no-match copy visible while memo add is in flight', async () => {
    const newFolder: PriceFolder = {
      id: 'folder-new',
      user_id: 'user-a',
      name: '新規品目',
      created_at: '2026-01-01T00:00:00Z',
    }
    createFolder.mockResolvedValue(newFolder)

    let resolveAdd: (() => void) | null = null
    addMemoItem.mockImplementation(
      (folderId: string) =>
        new Promise((resolve) => {
          resolveAdd = () => {
            const item = memoItem(folderId, memoOnServer.length)
            memoOnServer = [item, ...memoOnServer]
            resolve(item)
          }
        }),
    )

    renderPage()
    await waitForInitialLoad()
    await openAddPanel()

    fireEvent.change(screen.getByPlaceholderText(/品目名/), {
      target: { value: '新規品目' },
    })
    expect(screen.getByText('一致するフォルダがありません。')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '追加' }))

    await waitFor(() => {
      expect(createFolder).toHaveBeenCalledWith('新規品目', null)
    })

    const panel = addPanel()
    expect(within(panel).queryByRole('button', { name: /メモに追加/ })).toBeNull()
    expect(
      within(panel).getByText('一致するフォルダがありません。'),
    ).toBeTruthy()

    await act(async () => {
      resolveAdd?.()
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(screen.getByTestId('memo-card-folder-new')).toBeTruthy()
      expect(screen.queryByPlaceholderText(/品目名/)).toBeNull()
    })
    expect(
      folderMemoCardProps.mock.calls.some(
        ([props]) => props.folderId === 'folder-new' && props.forceOpen === true,
      ),
    ).toBe(false)
  })

  it('keeps the add panel open and shows an error when memo add fails', async () => {
    const newFolder: PriceFolder = {
      id: 'folder-new',
      user_id: 'user-a',
      name: '失敗品目',
      created_at: '2026-01-01T00:00:00Z',
    }
    createFolder.mockResolvedValue(newFolder)
    addMemoItem.mockRejectedValue(new Error('add failed'))

    renderPage()
    await waitForInitialLoad()
    await openAddPanel()

    fireEvent.change(screen.getByPlaceholderText(/品目名/), {
      target: { value: '失敗品目' },
    })
    fireEvent.click(screen.getByRole('button', { name: '追加' }))

    await waitFor(() => {
      expect(screen.getByText('追加に失敗しました。')).toBeTruthy()
    })
    expect(screen.getByPlaceholderText(/品目名/)).toBeTruthy()
    expect(
      (screen.getByPlaceholderText(/品目名/) as HTMLInputElement).value,
    ).toBe('失敗品目')
  })

  it('keeps picked candidate visible but disabled while adding, then closes panel on success', async () => {
    let resolveAdd: (() => void) | null = null
    addMemoItem.mockImplementation(
      (folderId: string) =>
        new Promise((resolve) => {
          resolveAdd = () => {
            const item = memoItem(folderId, memoOnServer.length)
            memoOnServer = [item, ...memoOnServer]
            resolve(item)
          }
        }),
    )

    renderPage()
    await waitForInitialLoad()
    await openAddPanel()

    fireEvent.change(screen.getByPlaceholderText(/品目名/), {
      target: { value: 'C' },
    })
    const pickButton = screen.getByRole('button', { name: /メモに追加/ })
    fireEvent.click(pickButton)

    const panel = addPanel()
    await waitFor(() => {
      expect(addMemoItem).toHaveBeenCalledWith('folder-c')
    })
    const candidateButton = within(panel).getByRole('button', {
      name: /メモに追加/,
    })
    expect((candidateButton as HTMLButtonElement).disabled).toBe(true)
    expect(
      within(panel).queryByText('追加できるフォルダはありません'),
    ).toBeNull()

    await act(async () => {
      resolveAdd?.()
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(screen.getByTestId('memo-card-folder-c')).toBeTruthy()
      expect(screen.queryByPlaceholderText(/品目名/)).toBeNull()
    })
    expect(
      folderMemoCardProps.mock.calls.some(
        ([props]) => props.folderId === 'folder-c' && props.forceOpen === true,
      ),
    ).toBe(false)
  })

  it('supports consecutive add operations without stale candidate UI', async () => {
    renderPage()
    await waitForInitialLoad()
    await openAddPanel()

    fireEvent.change(screen.getByPlaceholderText(/品目名/), {
      target: { value: 'C' },
    })
    fireEvent.click(screen.getByRole('button', { name: /メモに追加/ }))

    await waitFor(() => {
      expect(screen.getByTestId('memo-card-folder-c')).toBeTruthy()
      expect(screen.queryByPlaceholderText(/品目名/)).toBeNull()
    })

    fireEvent.click(screen.getByRole('button', { name: 'メモを追加' }))
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/品目名/)).toBeTruthy()
    })

    fireEvent.change(screen.getByPlaceholderText(/品目名/), {
      target: { value: 'zzz' },
    })
    expect(screen.getByText('追加できるフォルダはありません')).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: /メモに追加/ }),
    ).toBeNull()
  })

  it('completes memo add when only record fetch fails after addMemoItem', async () => {
    listRecords.mockRejectedValue(new Error('records failed'))

    renderPage()
    await waitForInitialLoad()
    await openAddPanel()

    fireEvent.change(screen.getByPlaceholderText(/品目名/), {
      target: { value: 'C' },
    })
    fireEvent.click(screen.getByRole('button', { name: /メモに追加/ }))

    await waitFor(() => {
      expect(screen.getByTestId('memo-card-folder-c')).toBeTruthy()
      expect(screen.queryByPlaceholderText(/品目名/)).toBeNull()
    })
    expect(screen.queryByText('メモへの追加に失敗しました。')).toBeNull()
    expect(screen.getByText(/メモへの追加は完了しています/)).toBeTruthy()
  })

  it('finds candidates by explicit reading with the same semantics as folder list', async () => {
    const milk: PriceFolder = {
      id: 'folder-milk',
      user_id: 'user-a',
      name: '牛乳（通常表記）',
      reading: 'ぎゅうにゅう',
      sort_order: 0,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }
    listFolders.mockResolvedValue([folderA, folderB, folderC, milk])

    renderPage()
    await waitForInitialLoad()
    await openAddPanel()

    fireEvent.change(screen.getByPlaceholderText(/品目名/), {
      target: { value: 'ぎゅうにゅう' },
    })

    const panel = addPanel()
    expect(
      within(panel).getByRole('button', { name: /牛乳（通常表記）/ }),
    ).toBeTruthy()
    expect(filterFolders([milk], 'ぎゅうにゅう').map((f) => f.id)).toEqual([
      'folder-milk',
    ])
  })

  it('shows literal folder names including parentheses in candidates', async () => {
    const beans: PriceFolder = {
      id: 'folder-beans',
      user_id: 'user-a',
      name: '納豆（3パック）',
      reading: null,
      sort_order: 0,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }
    listFolders.mockResolvedValue([folderA, folderB, folderC, beans])

    renderPage()
    await waitForInitialLoad()
    await openAddPanel()

    fireEvent.change(screen.getByPlaceholderText(/品目名/), {
      target: { value: '3パック' },
    })

    expect(screen.getByText('納豆（3パック）')).toBeTruthy()
  })

  it('sorts candidates by reading when present', async () => {
    const alpha: PriceFolder = {
      id: 'folder-alpha',
      user_id: 'user-a',
      name: 'あ品目',
      reading: null,
      sort_order: 0,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }
    const sortedByReading: PriceFolder = {
      id: 'folder-sorted',
      user_id: 'user-a',
      name: '品目Z',
      reading: 'あいうえお',
      sort_order: 1,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }
    listFolders.mockResolvedValue([folderA, folderB, folderC, sortedByReading, alpha])

    renderPage()
    await waitForInitialLoad()
    await openAddPanel()

    fireEvent.change(screen.getByPlaceholderText(/品目名/), {
      target: { value: '品' },
    })

    const labels = within(addPanel())
      .getAllByRole('button', { name: /メモに追加/ })
      .map((btn) => btn.textContent?.replace(/メモに追加/g, '').trim())
    expect(labels.indexOf('品目Z')).toBeLessThan(labels.indexOf('あ品目'))
  })

  it('does not bind an existing folder by reading on submit', async () => {
    const milk: PriceFolder = {
      id: 'folder-milk',
      user_id: 'user-a',
      name: '牛乳（通常表記）',
      reading: 'ぎゅうにゅう',
      sort_order: 0,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }
    const readingOnlyName: PriceFolder = {
      id: 'folder-reading-only',
      user_id: 'user-a',
      name: 'ぎゅうにゅう',
      reading: null,
      sort_order: 1,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }
    createFolder.mockResolvedValue(readingOnlyName)
    listFolders.mockResolvedValue([folderA, folderB, folderC, milk])

    renderPage()
    await waitForInitialLoad()
    await openAddPanel()

    fireEvent.change(screen.getByPlaceholderText(/品目名/), {
      target: { value: 'ぎゅうにゅう' },
    })
    fireEvent.click(screen.getByRole('button', { name: '追加' }))

    await waitFor(() => {
      expect(createFolder).toHaveBeenCalledWith('ぎゅうにゅう', null)
      expect(addMemoItem).not.toHaveBeenCalledWith('folder-milk')
    })
  })

  it('reuses an existing folder on submit by literal name only', async () => {
    const milk: PriceFolder = {
      id: 'folder-milk',
      user_id: 'user-a',
      name: '牛乳（通常表記）',
      reading: 'ぎゅうにゅう',
      sort_order: 0,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }
    listFolders.mockResolvedValue([folderA, folderB, folderC, milk])

    renderPage()
    await waitForInitialLoad()
    await openAddPanel()

    fireEvent.change(screen.getByPlaceholderText(/品目名/), {
      target: { value: '牛乳（通常表記）' },
    })
    fireEvent.click(screen.getByRole('button', { name: '追加' }))

    await waitFor(() => {
      expect(createFolder).not.toHaveBeenCalled()
      expect(addMemoItem).toHaveBeenCalledWith('folder-milk')
    })
  })

  it('creates memo folders with the entered reading', async () => {
    const named: PriceFolder = {
      id: 'folder-named',
      user_id: 'user-a',
      name: '牛乳（ぎゅうにゅう）',
      reading: null,
      sort_order: 0,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }
    createFolder.mockResolvedValue(named)

    renderPage()
    await waitForInitialLoad()
    await openAddPanel()

    fireEvent.change(screen.getByPlaceholderText(/品目名/), {
      target: { value: '牛乳（ぎゅうにゅう）' },
    })
    fireEvent.click(screen.getByRole('button', { name: '+ 読み仮名' }))
    fireEvent.change(screen.getByPlaceholderText('読み仮名（任意）'), {
      target: { value: 'ぎゅうにゅう' },
    })
    fireEvent.click(screen.getByRole('button', { name: '追加' }))

    await waitFor(() => {
      expect(createFolder).toHaveBeenCalledWith('牛乳（ぎゅうにゅう）', 'ぎゅうにゅう')
      expect(createFolder).toHaveBeenCalledTimes(1)
    })
  })

  it('clears reading and collapses the field when the folder name changes', async () => {
    renderPage()
    await waitForInitialLoad()
    await openAddPanel()

    const nameInput = screen.getByPlaceholderText(/品目名/)
    fireEvent.change(nameInput, { target: { value: '新規品目' } })
    fireEvent.click(screen.getByRole('button', { name: '+ 読み仮名' }))
    const readingInput = screen.getByPlaceholderText('読み仮名（任意）')
    fireEvent.change(readingInput, { target: { value: 'しんき' } })

    fireEvent.change(nameInput, { target: { value: '別の品目' } })

    expect(screen.queryByPlaceholderText('読み仮名（任意）')).toBeNull()
    expect(screen.getByRole('button', { name: '+ 読み仮名' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '+ 読み仮名' }))
    expect(
      (screen.getByPlaceholderText('読み仮名（任意）') as HTMLInputElement).value,
    ).toBe('')
  })

  it('does not update the reading of an existing folder when adding it', async () => {
    const existing: PriceFolder = {
      id: 'folder-existing',
      user_id: 'user-a',
      name: '既存品目',
      reading: 'きそん',
      created_at: '2026-01-01T00:00:00Z',
    }
    listFolders.mockResolvedValue([folderA, folderB, existing])
    memoOnServer = [
      ...memoOnServer,
      {
        ...memoItem('folder-existing', 2),
        folder: existing,
      },
    ]

    renderPage()
    await waitForInitialLoad()
    await openAddPanel()
    fireEvent.change(screen.getByPlaceholderText(/品目名/), {
      target: { value: '既存品目' },
    })
    fireEvent.click(screen.getByRole('button', { name: '+ 読み仮名' }))
    fireEvent.change(screen.getByPlaceholderText('読み仮名（任意）'), {
      target: { value: '上書きしない' },
    })
    fireEvent.click(screen.getByRole('button', { name: '追加' }))

    await waitFor(() => expect(screen.queryByPlaceholderText(/品目名/)).toBeNull())
    expect(addMemoItem).not.toHaveBeenCalledWith('folder-existing')
    expect(createFolder).not.toHaveBeenCalled()
  })

  it('does not trigger a full memo list reload after addMemoItem', async () => {
    renderPage()
    await waitForInitialLoad()
    const callsAfterLoad = listMemoItems.mock.calls.length

    await openAddPanel()
    fireEvent.change(screen.getByPlaceholderText(/品目名/), {
      target: { value: 'C' },
    })
    fireEvent.click(screen.getByRole('button', { name: /メモに追加/ }))

    await waitFor(() => {
      expect(screen.getByTestId('memo-card-folder-c')).toBeTruthy()
    })
    expect(listMemoItems.mock.calls.length).toBe(callsAfterLoad)
  })
})
