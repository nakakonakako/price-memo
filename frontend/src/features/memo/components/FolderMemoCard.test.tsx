// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { PriceRecord } from '@/features/records/types'
import { FolderMemoCard } from './FolderMemoCard'

vi.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: () => false,
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
  }) => {
    const label =
      props.allowRegister === false ? 'compare-store' : 'record-store'
    const track =
      props.allowRegister === false ? compareStoreField : recordStoreField
    track(props)
    return (
      <input
        aria-label={label}
        placeholder={props.placeholder}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      />
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
]

describe('FolderMemoCard BL-10 record flow', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('scrollTo', vi.fn())
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
})
