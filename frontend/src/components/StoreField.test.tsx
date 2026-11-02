// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { PriceStore } from '@/features/stores/types'

const { getStoresCached, createStore, peekStoresCache } = vi.hoisted(() => ({
  getStoresCached: vi.fn(),
  createStore: vi.fn(),
  peekStoresCache: vi.fn(),
}))

vi.mock('@/features/stores/api/storesApi', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/features/stores/api/storesApi')>()
  return {
    ...actual,
    getStoresCached,
    createStore,
    peekStoresCache,
    getStoresCacheEpoch: vi.fn().mockReturnValue(0),
    upsertStoresCache: vi.fn(),
  }
})

vi.mock('@/features/stores/api/storesCache', () => ({
  subscribeStoresCacheRefresh: vi.fn(() => () => {}),
}))

vi.mock('@/lib/catalogSync', () => ({
  subscribeCatalogRevisions: vi.fn(() => () => {}),
}))

import { StoreField } from './StoreField'

const masterStores: PriceStore[] = [
  {
    id: 's1',
    user_id: 'u1',
    name: 'セブンイレブン',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 's2',
    user_id: 'u1',
    name: 'ローソン',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
]

function openDropdown(input: HTMLElement) {
  fireEvent.focus(input)
}

describe('StoreField BL-11 store candidates', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    getStoresCached.mockResolvedValue(masterStores)
    peekStoresCache.mockReturnValue(undefined)
  })

  it('lists only candidateNames with kana search and no register when restricted', () => {
    const onChange = vi.fn()
    render(
      <StoreField
        value=""
        onChange={onChange}
        allowRegister={false}
        candidateNames={['店A', 'セブンイレブン']}
        placeholder="比較"
      />,
    )

    const input = screen.getByPlaceholderText('比較')
    openDropdown(input)
    expect(screen.getByRole('button', { name: '店A' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'セブンイレブン' })).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: /を店舗に登録/ }),
    ).toBeNull()

    fireEvent.change(input, { target: { value: 'せぶん' } })
    expect(screen.getByRole('button', { name: 'セブンイレブン' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '店A' })).toBeNull()
    expect(
      screen.queryByRole('button', { name: /を店舗に登録/ }),
    ).toBeNull()
  })

  it('shows empty state when candidateNames is empty and register is disabled', () => {
    render(
      <StoreField
        value=""
        onChange={vi.fn()}
        allowRegister={false}
        candidateNames={[]}
      />,
    )

    openDropdown(screen.getByPlaceholderText('店舗名で検索'))
    expect(
      screen.getByText('この品目の記録にある店舗がありません。'),
    ).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: /を店舗に登録/ }),
    ).toBeNull()
  })

  it('loads master stores and keeps register when candidateNames is omitted', async () => {
    const onChange = vi.fn()
    render(<StoreField value="" onChange={onChange} />)

    await waitFor(() => {
      expect(getStoresCached).toHaveBeenCalled()
    })

    const input = screen.getByPlaceholderText('店舗名で検索')
    openDropdown(input)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'セブンイレブン' })).toBeTruthy()
    })
    expect(screen.getByRole('button', { name: 'ローソン' })).toBeTruthy()

    fireEvent.change(input, { target: { value: '新規店舗' } })
    expect(
      screen.getByRole('button', { name: '「新規店舗」を店舗に登録' }),
    ).toBeTruthy()
  })
})
