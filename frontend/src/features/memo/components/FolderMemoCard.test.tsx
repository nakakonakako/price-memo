// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import type { PriceRecord } from '@/features/records/types'
import {
  FolderMemoCard,
  type RecordStoreCandidate,
} from './FolderMemoCard'

const useMediaQuery = vi.fn(() => false)

vi.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: (query: string) => useMediaQuery(query),
}))

vi.mock('@/components/catalog/DraggableCatalogItem', () => ({
  DraggableCatalogItem: ({
    children,
    onClick,
  }: {
    children: React.ReactNode
    onClick?: () => void
  }) => (
    <div data-testid="draggable" onClick={onClick}>
      {children}
    </div>
  ),
}))

const compareStoreField = vi.fn()
const recordStoreField = vi.fn()

vi.mock('@/components/StoreField', () => ({
  StoreField: (props: {
    value: string
    onChange: (v: string) => void
    allowRegister?: boolean
    placeholder?: string
    candidateNames?: readonly string[]
    clearable?: boolean
    clearAriaLabel?: string
  }) => {
    const label =
      props.allowRegister === false ? 'compare-store' : 'record-store'
    const track =
      props.allowRegister === false ? compareStoreField : recordStoreField
    track(props)
    return (
      <>
        <input
          aria-label={label}
          placeholder={props.placeholder}
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
        />
        {props.clearable && props.value ? (
          <button
            type="button"
            aria-label={props.clearAriaLabel ?? 'クリア'}
            onClick={() => props.onChange('')}
          >
            比較クリア
          </button>
        ) : null}
      </>
    )
  },
}))

vi.mock('@/features/records/api/recordsApi', () => ({
  createRecord: vi.fn(),
}))

vi.mock('./MemoMobileReorder', () => ({
  MemoMobileReorderA11yControls: () => null,
  MemoMobileReorderGestureRoot: ({
    children,
  }: {
    children: React.ReactNode
  }) => <>{children}</>,
  MemoMobileReorderInsertMarker: () => null,
  MemoMobileReorderItemRegistrar: () => null,
}))

const sampleRecords: PriceRecord[] = [
  {
    id: 'r1',
    folder_id: 'f1',
    recorded_at: '2026-01-10',
    store_name: '店A',
    price: 100,
    amount: 100,
    unit: 'g',
    note: null,
    created_at: '2026-01-10T00:00:00Z',
    updated_at: '2026-01-10T00:00:00Z',
    user_id: 'u1',
  },
  {
    id: 'r2',
    folder_id: 'f1',
    recorded_at: '2026-01-15',
    store_name: '店A',
    price: 150,
    amount: 100,
    unit: 'g',
    note: null,
    created_at: '2026-01-15T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',
    user_id: 'u1',
  },
]

describe('FolderMemoCard BL-10 record flow', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    useMediaQuery.mockImplementation(() => false)
    vi.stubGlobal('scrollTo', vi.fn())
  })

  describe.each([
    { viewport: 'desktop', isMobile: false },
    { viewport: 'mobile', isMobile: true },
  ])('stats metadata row ($viewport)', ({ isMobile }) => {
    beforeEach(() => {
      useMediaQuery.mockImplementation((query: string) =>
        query === '(max-width: 1023px)' ? isMobile : false,
      )
    })

    it('shows compare store and latest date when collapsed', () => {
      render(
        <FolderMemoCard
          folderId="f1"
          folderName="牛乳"
          records={sampleRecords}
          onSaved={vi.fn()}
        />,
      )

      expect(screen.getByText('2026-01-15')).toBeTruthy()
    })

    it('aligns collapsed metadata row with mobile stats grid when mobile', () => {
      if (!isMobile) {
        return
      }

      render(
        <FolderMemoCard
          folderId="f1"
          folderName="牛乳"
          records={sampleRecords}
          onSaved={vi.fn()}
        />,
      )

      const latestLabel = screen.getByText('直近')
      const statsGrid = latestLabel.closest('div')?.parentElement
      expect(statsGrid?.className).toContain('w-full')
      expect(statsGrid?.className).toContain('grid-cols-3')
      expect(statsGrid?.className).not.toContain('inline-grid')

      const dateEl = screen.getByText('2026-01-15')
      const metadataRow = dateEl.parentElement
      expect(metadataRow?.className).toContain('w-full')
      expect(metadataRow?.className).toContain('grid-cols-3')
      expect(metadataRow?.className).not.toContain('inline-grid')
      expect(dateEl.className).toContain('text-center')
    })

    it('hides compare store and latest date when expanded without trial price', () => {
      render(
        <FolderMemoCard
          folderId="f1"
          folderName="牛乳"
          records={sampleRecords}
          onSaved={vi.fn()}
        />,
      )

      fireEvent.click(screen.getByText('牛乳'))
      fireEvent.change(screen.getByLabelText('compare-store'), {
        target: { value: '店A' },
      })

      expect(screen.queryByText('2026-01-15')).toBeNull()
      expect(screen.queryByText('店A', { selector: 'p' })).toBeNull()
    })

    it('hides compare store and latest date when expanded with trial price', () => {
      render(
        <FolderMemoCard
          folderId="f1"
          folderName="牛乳"
          records={sampleRecords}
          onSaved={vi.fn()}
        />,
      )

      fireEvent.click(screen.getByText('牛乳'))
      fireEvent.change(screen.getByLabelText('compare-store'), {
        target: { value: '店A' },
      })
      fireEvent.change(screen.getByLabelText('値段'), {
        target: { value: '200' },
      })
      fireEvent.change(screen.getByLabelText('内容量'), {
        target: { value: '100' },
      })

      expect(screen.getByText('平均比')).toBeTruthy()
      expect(screen.queryByText('2026-01-15')).toBeNull()
      expect(screen.queryByText('店A', { selector: 'p' })).toBeNull()
    })
  })

  it('scopes stats to compare store independently from record store on save', async () => {
    const { createRecord } = await import('@/features/records/api/recordsApi')
    vi.mocked(createRecord).mockResolvedValue({
      ...sampleRecords[0],
      id: 'r-new',
      store_name: '記録店',
      price: 398,
      amount: 250,
    })

    const onSaved = vi.fn()
    render(
      <FolderMemoCard
        folderId="f1"
        folderName="テスト品目"
        records={sampleRecords}
        onSaved={onSaved}
      />,
    )

    fireEvent.click(screen.getByText('テスト品目'))

    fireEvent.change(screen.getByLabelText('compare-store'), {
      target: { value: '店A' },
    })
    fireEvent.change(screen.getByLabelText('値段'), {
      target: { value: '398' },
    })
    fireEvent.change(screen.getByLabelText('内容量'), {
      target: { value: '250' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'この価格を記録' }))

    fireEvent.change(screen.getByLabelText('record-store'), {
      target: { value: '記録店' },
    })

    fireEvent.click(screen.getByRole('button', { name: '統計に残す' }))

    await waitFor(() => {
      expect(createRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          store_name: '記録店',
          price: 398,
          amount: 250,
          unit: 'g',
        }),
      )
    })

    expect(compareStoreField).toHaveBeenCalled()
    expect(recordStoreField).toHaveBeenCalled()
    expect((screen.getByLabelText('値段') as HTMLInputElement).value).toBe(
      '398',
    )
  })

  it('keeps trial inputs when save fails', async () => {
    const { createRecord } = await import('@/features/records/api/recordsApi')
    vi.mocked(createRecord).mockRejectedValue(new Error('network'))

    render(
      <FolderMemoCard
        folderId="f1"
        folderName="牛乳"
        records={sampleRecords}
        onSaved={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByText('牛乳'))
    fireEvent.change(screen.getByLabelText('値段'), {
      target: { value: '500' },
    })
    fireEvent.change(screen.getByLabelText('内容量'), {
      target: { value: '200' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'この価格を記録' }))
    fireEvent.change(screen.getByLabelText('record-store'), {
      target: { value: '記録店' },
    })
    fireEvent.click(screen.getByRole('button', { name: '統計に残す' }))

    await waitFor(() => {
      expect(createRecord).toHaveBeenCalled()
    })

    expect((screen.getByLabelText('値段') as HTMLInputElement).value).toBe(
      '500',
    )
    expect((screen.getByLabelText('内容量') as HTMLInputElement).value).toBe(
      '200',
    )
  })

  it('does not treat empty price as zero-yen trial (no record section without price)', () => {
    render(
      <FolderMemoCard
        folderId="f1"
        folderName="牛乳"
        records={sampleRecords}
        onSaved={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByText('牛乳'))
    fireEvent.change(screen.getByLabelText('内容量'), {
      target: { value: '200' },
    })

    expect(
      (screen.getByRole('button', { name: 'この価格を記録' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
  })

  it('allows zero-yen trial when price is explicitly 0', () => {
    render(
      <FolderMemoCard
        folderId="f1"
        folderName="牛乳"
        records={sampleRecords}
        onSaved={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByText('牛乳'))
    fireEvent.change(screen.getByLabelText('値段'), {
      target: { value: '0' },
    })
    fireEvent.change(screen.getByLabelText('内容量'), {
      target: { value: '200' },
    })

    expect(
      (screen.getByRole('button', { name: 'この価格を記録' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false)
  })

  it('shows historical unit prices when trial price is empty', () => {
    render(
      <FolderMemoCard
        folderId="f1"
        folderName="牛乳"
        records={sampleRecords}
        onSaved={vi.fn()}
      />,
    )

    expect(screen.getByText('平均')).toBeTruthy()
    expect(screen.getByText('最安')).toBeTruthy()
    expect(screen.getByText('直近')).toBeTruthy()
    expect(screen.queryByText('平均比')).toBeNull()
    expect(screen.getAllByText('¥100').length).toBeGreaterThan(0)
  })

  it('promotes yen diffs with comparison labels when trial is comparable', () => {
    render(
      <FolderMemoCard
        folderId="f1"
        folderName="牛乳"
        records={sampleRecords}
        onSaved={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByText('牛乳'))
    fireEvent.change(screen.getByLabelText('値段'), {
      target: { value: '200' },
    })
    fireEvent.change(screen.getByLabelText('内容量'), {
      target: { value: '100' },
    })

    expect(screen.getByText('平均比')).toBeTruthy()
    expect(screen.getByText('最安比')).toBeTruthy()
    expect(screen.getByText('直近比')).toBeTruthy()
    expect(screen.getByText(/円\/100g/)).toBeTruthy()
    expect(screen.getByText('+75円↑')).toBeTruthy()
    expect(screen.getByText('+100円↑')).toBeTruthy()
    expect(screen.getByText('+50円↑')).toBeTruthy()
  })

  it('does not show comparison labels without a trial price', () => {
    render(
      <FolderMemoCard
        folderId="f1"
        folderName="牛乳"
        records={sampleRecords}
        onSaved={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByText('牛乳'))
    fireEvent.change(screen.getByLabelText('内容量'), {
      target: { value: '100' },
    })

    expect(screen.getByText('平均')).toBeTruthy()
    expect(screen.queryByText('平均比')).toBeNull()
    expect(screen.queryByText('円/100g')).toBeNull()
  })

  it('shares record store candidate across cards on the same confirmation date', async () => {
    const { createRecord } = await import('@/features/records/api/recordsApi')
    vi.mocked(createRecord).mockImplementation(async (input) => ({
      ...sampleRecords[0],
      id: 'r-new',
      folder_id: input.folder_id,
      store_name: input.store_name,
      recorded_at: input.recorded_at,
      price: input.price,
      amount: input.amount,
      unit: input.unit,
      note: input.note ?? null,
    }))

    function TwoCardsHarness() {
      const [candidate, setCandidate] = useState<RecordStoreCandidate | null>(
        null,
      )
      const onSaved = (record: PriceRecord) => {
        setCandidate({
          recordedAt: record.recorded_at,
          storeName: record.store_name,
        })
      }
      return (
        <>
          <FolderMemoCard
            folderId="f1"
            folderName="品目A"
            records={sampleRecords}
            recordStoreCandidate={candidate}
            onSaved={onSaved}
          />
          <FolderMemoCard
            folderId="f2"
            folderName="品目B"
            records={[]}
            recordStoreCandidate={candidate}
            onSaved={vi.fn()}
          />
        </>
      )
    }

    render(<TwoCardsHarness />)

    fireEvent.click(screen.getByText('品目A'))
    fireEvent.change(screen.getByLabelText('値段'), {
      target: { value: '100' },
    })
    fireEvent.change(screen.getByLabelText('内容量'), {
      target: { value: '100' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'この価格を記録' }))
    fireEvent.change(screen.getByLabelText('record-store'), {
      target: { value: '記録店' },
    })
    fireEvent.click(screen.getByRole('button', { name: '統計に残す' }))

    await waitFor(() => {
      expect(createRecord).toHaveBeenCalled()
    })

    fireEvent.click(screen.getByText('品目A'))
    fireEvent.click(screen.getByText('品目B'))
    fireEvent.change(screen.getByLabelText('値段'), {
      target: { value: '200' },
    })
    fireEvent.change(screen.getByLabelText('内容量'), {
      target: { value: '100' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'この価格を記録' }))

    await waitFor(() => {
      expect((screen.getByLabelText('record-store') as HTMLInputElement).value).toBe(
        '記録店',
      )
    })
  })
})

describe('FolderMemoCard BL-11 compare store candidates', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    useMediaQuery.mockImplementation(() => false)
    vi.stubGlobal('scrollTo', vi.fn())
  })

  const recordsTwoStores: PriceRecord[] = [
    ...sampleRecords,
    {
      ...sampleRecords[0],
      id: 'r3',
      store_name: '店B',
      recorded_at: '2026-01-20',
    },
  ]

  it('passes record-derived store names to compare StoreField only', () => {
    render(
      <FolderMemoCard
        folderId="f1"
        folderName="牛乳"
        records={recordsTwoStores}
        onSaved={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByText('牛乳'))
    fireEvent.change(screen.getByLabelText('値段'), {
      target: { value: '200' },
    })
    fireEvent.change(screen.getByLabelText('内容量'), {
      target: { value: '100' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'この価格を記録' }))

    expect(screen.getByLabelText('record-store')).toBeTruthy()
    expect(recordStoreField).toHaveBeenCalled()

    const compareProps = compareStoreField.mock.calls.at(-1)?.[0]
    expect(compareProps?.candidateNames).toEqual(['店A', '店B'])
    expect(compareProps?.allowRegister).toBe(false)
    expect(compareProps?.clearable).toBe(true)
    expect(compareProps?.clearAriaLabel).toBe('比較店舗をクリア')
    expect(compareProps?.placeholder).toBe('全店舗の記録と比較')

    const recordProps = recordStoreField.mock.calls.at(-1)?.[0]
    expect(recordProps?.candidateNames).toBeUndefined()
    expect(recordProps?.allowRegister).not.toBe(false)
    expect(recordProps?.clearable).toBeUndefined()
  })

  it('uses empty compare candidates when records are empty', () => {
    render(
      <FolderMemoCard
        folderId="f1"
        folderName="牛乳"
        records={[]}
        onSaved={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByText('牛乳'))

    expect(compareStoreField.mock.calls.at(-1)?.[0].candidateNames).toEqual([])
  })

  it('updates compare candidates after save adds a new store on the folder', async () => {
    const { createRecord } = await import('@/features/records/api/recordsApi')
    vi.mocked(createRecord).mockResolvedValue({
      ...sampleRecords[0],
      id: 'r-new',
      store_name: '新店',
    })

    function Harness() {
      const [records, setRecords] = useState<PriceRecord[]>(sampleRecords)
      return (
        <FolderMemoCard
          folderId="f1"
          folderName="牛乳"
          records={records}
          onSaved={(r) => setRecords((prev) => [...prev, r])}
        />
      )
    }

    render(<Harness />)
    fireEvent.click(screen.getByText('牛乳'))

    fireEvent.change(screen.getByLabelText('値段'), {
      target: { value: '100' },
    })
    fireEvent.change(screen.getByLabelText('内容量'), {
      target: { value: '100' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'この価格を記録' }))
    fireEvent.change(screen.getByLabelText('record-store'), {
      target: { value: '新店' },
    })
    fireEvent.click(screen.getByRole('button', { name: '統計に残す' }))

    await waitFor(() => {
      expect(compareStoreField.mock.calls.at(-1)?.[0].candidateNames).toEqual([
        '店A',
        '新店',
      ])
    })
  })

  it('clears compare store when its records are removed', () => {
    function Harness() {
      const [records, setRecords] = useState(recordsTwoStores)
      return (
        <>
          <FolderMemoCard
            folderId="f1"
            folderName="牛乳"
            records={records}
            onSaved={vi.fn()}
          />
          <button
            type="button"
            onClick={() => setRecords(sampleRecords)}
          >
            drop店B
          </button>
        </>
      )
    }

    render(<Harness />)
    fireEvent.click(screen.getByText('牛乳'))
    fireEvent.change(screen.getByLabelText('compare-store'), {
      target: { value: '店B' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'drop店B' }))

    expect((screen.getByLabelText('compare-store') as HTMLInputElement).value).toBe(
      '',
    )
  })

  it('includes legacy store names missing from master in compare candidates', () => {
    const legacyRecords: PriceRecord[] = [
      {
        ...sampleRecords[0],
        store_name: 'マスタ未登録店',
      },
    ]

    render(
      <FolderMemoCard
        folderId="f1"
        folderName="牛乳"
        records={legacyRecords}
        onSaved={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByText('牛乳'))

    expect(compareStoreField.mock.calls.at(-1)?.[0].candidateNames).toEqual([
      'マスタ未登録店',
    ])
  })

  it('does not put other folders stores into compare candidates', () => {
    render(
      <FolderMemoCard
        folderId="f1"
        folderName="品目A"
        records={sampleRecords}
        onSaved={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByText('品目A'))

    expect(compareStoreField.mock.calls.at(-1)?.[0].candidateNames).toEqual([
      '店A',
    ])
    expect(
      compareStoreField.mock.calls.at(-1)?.[0].candidateNames,
    ).not.toContain('店B')
  })

  it('clears compare store to all-store scope while keeping trial and record section', () => {
    render(
      <FolderMemoCard
        folderId="f1"
        folderName="牛乳"
        records={recordsTwoStores}
        onSaved={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByText('牛乳'))
    fireEvent.change(screen.getByLabelText('compare-store'), {
      target: { value: '店A' },
    })
    fireEvent.change(screen.getByLabelText('値段'), {
      target: { value: '250' },
    })
    fireEvent.change(screen.getByLabelText('内容量'), {
      target: { value: '500' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'この価格を記録' }))
    fireEvent.change(screen.getByLabelText('record-store'), {
      target: { value: '記録店' },
    })

    fireEvent.click(screen.getByRole('button', { name: '比較店舗をクリア' }))

    expect(
      (screen.getByLabelText('compare-store') as HTMLInputElement).value,
    ).toBe('')
    expect((screen.getByLabelText('値段') as HTMLInputElement).value).toBe('250')
    expect((screen.getByLabelText('内容量') as HTMLInputElement).value).toBe(
      '500',
    )
    expect(
      (screen.getByLabelText('record-store') as HTMLInputElement).value,
    ).toBe('記録店')
    expect(screen.getByLabelText('record-store')).toBeTruthy()
  })

  it('does not render compare clear on record StoreField', () => {
    render(
      <FolderMemoCard
        folderId="f1"
        folderName="牛乳"
        records={recordsTwoStores}
        onSaved={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByText('牛乳'))
    fireEvent.change(screen.getByLabelText('値段'), {
      target: { value: '100' },
    })
    fireEvent.change(screen.getByLabelText('内容量'), {
      target: { value: '100' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'この価格を記録' }))
    fireEvent.change(screen.getByLabelText('record-store'), {
      target: { value: '記録店' },
    })

    expect(
      screen.queryByRole('button', { name: '比較店舗をクリア' }),
    ).toBeNull()
  })
})
