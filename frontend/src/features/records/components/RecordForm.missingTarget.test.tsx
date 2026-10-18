// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import {
  createMissingTargetError,
  MISSING_TARGET_MESSAGE,
} from '@/lib/appError'
import { RecordForm } from './RecordForm'

vi.mock('@/components/FolderField', () => ({
  FolderField: () => null,
}))

vi.mock('@/components/StoreField', () => ({
  StoreField: ({
    onChange,
    value,
  }: {
    onChange: (v: string) => void
    value: string
  }) => (
    <input
      aria-label="店舗"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}))

vi.mock('../api/recordsApi', () => ({
  searchReceiptItems: vi.fn(),
}))

describe('RecordForm missing target', () => {
  beforeEach(() => {
    vi.stubGlobal('scrollTo', vi.fn())
  })

  it('keeps draft values when submit fails with MissingTarget', async () => {
    const onSubmit = vi.fn().mockRejectedValue(createMissingTargetError())

    render(
      <RecordForm
        folderId="folder-a"
        folderName="牛乳"
        initial={{
          recorded_at: '2026-01-15',
          store_name: '店A',
          price: '120',
          amount: '1',
          unit: '本',
          note: '下書きメモ',
        }}
        mode="edit"
        onSubmit={onSubmit}
      />,
    )

    const noteInput = screen.getByDisplayValue('下書きメモ') as HTMLInputElement
    expect(noteInput.value).toBe('下書きメモ')

    fireEvent.click(screen.getByRole('button', { name: '保存する' }))

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled()
    })
    expect(noteInput.value).toBe('下書きメモ')
    expect(screen.getByText(MISSING_TARGET_MESSAGE)).toBeTruthy()
  })
})
