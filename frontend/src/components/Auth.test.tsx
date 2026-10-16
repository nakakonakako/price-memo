// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { DATA_HANDLING_DISCLOSURE_TEST_ID } from '@/features/data-management/components/DataHandlingDisclosureContent'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithOAuth: vi.fn().mockResolvedValue({ error: null }),
    },
  },
}))

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

import { Auth } from './Auth'

describe('Auth', () => {
  afterEach(() => cleanup())

  it('shows the data-handling disclosure before login', () => {
    render(<Auth />)

    fireEvent.click(screen.getByRole('button', { name: 'データの取り扱い' }))

    expect(screen.getByTestId(DATA_HANDLING_DISCLOSURE_TEST_ID)).toBeTruthy()
    expect(
      screen.getByText(/本アプリからGoogle Geminiへのデータ送信は行いません/),
    ).toBeTruthy()
  })
})
