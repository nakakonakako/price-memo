// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { applyAuthIdentity, resetAuthIdentityForTests } from '@/lib/authIdentity'
import {
  MEMO_REORDER_UNKNOWN_ORDER_MESSAGE,
  useMemoItemReorder,
} from './useMemoItemReorder'

const reorderMemoItems = vi.fn()

vi.mock('../api/memoApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/memoApi')>()
  return {
    ...actual,
    reorderMemoItems: (...args: unknown[]) => reorderMemoItems(...args),
  }
})

function memoItem(folderId: string, sortOrder: number) {
  return {
    id: `memo-${folderId}`,
    user_id: 'user-a',
    folder_id: folderId,
    sort_order: sortOrder,
    created_at: '2026-01-01T00:00:00Z',
    folder: {
      id: folderId,
      user_id: 'user-a',
      name: folderId,
      created_at: '2026-01-01T00:00:00Z',
    },
  }
}

describe('useMemoItemReorder', () => {
  const reorderGenerationRef = { current: 0 }
  const reorderInFlightRef = { current: false }
  const loadGenerationRef = { current: 0 }
  const skipPreserveMemoOrderRef = { current: false }

  beforeEach(() => {
    resetAuthIdentityForTests()
    reorderMemoItems.mockReset()
    reorderGenerationRef.current = 0
    reorderInFlightRef.current = false
    loadGenerationRef.current = 0
    skipPreserveMemoOrderRef.current = false
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
    resetAuthIdentityForTests()
  })

  it('reverts optimistic order when reorder fails and reload fails', async () => {
    const initial = [memoItem('folder-a', 0), memoItem('folder-b', 1)]
    let items = initial
    const setMemoItems = vi.fn((updater: typeof items | ((prev: typeof items) => typeof items)) => {
      items = typeof updater === 'function' ? updater(items) : updater
    })
    const setError = vi.fn()
    const load = vi.fn().mockResolvedValue('error')
    reorderMemoItems.mockRejectedValue({ code: '08006' })

    const { result } = renderHook(() =>
      useMemoItemReorder({
        memoItems: items,
        setMemoItems,
        setError,
        load,
        interactionsLocked: false,
        refs: {
          reorderGenerationRef,
          reorderInFlightRef,
          loadGenerationRef,
          skipPreserveMemoOrderRef,
        },
      }),
    )

    await act(async () => {
      await result.current.commitReorder('folder-b', 'folder-a')
    })

    await waitFor(() => {
      expect(setMemoItems).toHaveBeenCalled()
      expect(items.map((m) => m.folder_id)).toEqual(['folder-a', 'folder-b'])
      expect(setError).toHaveBeenCalled()
    })
    const lastError = setError.mock.calls.at(-1)?.[0]
    expect(
      typeof lastError === 'function'
        ? lastError('並べ替えの保存に失敗しました。')
        : lastError,
    ).toContain(MEMO_REORDER_UNKNOWN_ORDER_MESSAGE)
    expect(skipPreserveMemoOrderRef.current).toBe(false)
  })
})
