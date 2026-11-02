// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import type { PriceStore } from '@/features/stores/types'

const { getStoresCached, createStore, peekStoresCache } = vi.hoisted(() => ({
  getStoresCached: vi.fn(),
  createStore: vi.fn(),
  peekStoresCache: vi.fn(),
}))

vi.mock('@/features/stores/api/storesApi', async () => {
  const { equalsSearchQuery, matchesSearchQuery } = await import('@/lib/kanaSearch')
  return {
    getStoresCached,
    createStore,
    peekStoresCache,
    getStoresCacheEpoch: vi.fn().mockReturnValue(0),
    upsertStoresCache: vi.fn(),
    findStoreByName: (stores: PriceStore[], input: string) => {
      const nq = input.trim()
      if (!nq) return undefined
      return stores.find((s) => equalsSearchQuery(s.name, nq))
    },
    filterStores: (stores: PriceStore[], query: string) => {
      const q = query.trim()
      if (!q) return stores
      return stores.filter((s) => matchesSearchQuery(s.name, q))
    },
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

describe('StoreField clearable compare store', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    getStoresCached.mockResolvedValue(masterStores)
    peekStoresCache.mockReturnValue(undefined)
  })

  it('clears selected value and returns to all-store scope', () => {
    function Harness() {
      const [value, setValue] = useState('セブンイレブン')
      return (
        <StoreField
          value={value}
          onChange={setValue}
          clearable
          clearAriaLabel="比較店舗をクリア"
          candidateNames={['セブンイレブン']}
          allowRegister={false}
        />
      )
    }

    render(<Harness />)

    fireEvent.click(screen.getByRole('button', { name: '比較店舗をクリア' }))
    expect(
      screen.queryByRole('button', { name: '比較店舗をクリア' }),
    ).toBeNull()
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('')
  })

  it('clears in-progress search text and selected value', () => {
    function Harness() {
      const [value, setValue] = useState('店A')
      return (
        <StoreField
          value={value}
          onChange={setValue}
          clearable
          clearAriaLabel="比較店舗をクリア"
          candidateNames={['店A', '店B']}
          allowRegister={false}
        />
      )
    }

    render(<Harness />)

    const input = screen.getByDisplayValue('店A')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '店' } })
    expect(screen.getByRole('button', { name: '比較店舗をクリア' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '比較店舗をクリア' }))
    expect((input as HTMLInputElement).value).toBe('')
  })

  it('does not show clear button when clearable is false', () => {
    render(
      <StoreField value="セブンイレブン" onChange={vi.fn()} candidateNames={['セブンイレブン']} />,
    )
    expect(
      screen.queryByRole('button', { name: '比較店舗をクリア' }),
    ).toBeNull()
    expect(screen.queryByRole('button', { name: 'クリア' })).toBeNull()
  })
})
