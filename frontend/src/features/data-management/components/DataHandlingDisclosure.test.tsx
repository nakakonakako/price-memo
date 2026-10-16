// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { DataHandlingDisclosure } from './DataHandlingDisclosure'
import { DATA_HANDLING_DISCLOSURE_TEST_ID } from './DataHandlingDisclosureContent'

vi.mock('@/components/DialogShell', () => ({
  DialogShell: ({
    open,
    title,
    children,
  }: {
    open: boolean
    title: string
    children: React.ReactNode
  }) =>
    open ? (
      <div role="dialog" aria-label={title}>
        <h2>{title}</h2>
        {children}
      </div>
    ) : null,
}))

describe('DataHandlingDisclosure', () => {
  afterEach(() => cleanup())

  it('opens the shared disclosure without delete actions', () => {
    render(<DataHandlingDisclosure />)

    fireEvent.click(screen.getByRole('button', { name: 'データの取り扱い' }))

    expect(screen.getByRole('dialog', { name: 'データの取り扱い' })).toBeTruthy()
    expect(screen.getByTestId(DATA_HANDLING_DISCLOSURE_TEST_ID)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'すべてのデータを削除' })).toBeNull()
    expect(screen.queryByRole('button', { name: '削除を確定する' })).toBeNull()
  })
})
