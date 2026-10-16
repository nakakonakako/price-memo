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

  it('renders user-facing data-handling copy without browser storage jargon', () => {
    render(<DataHandlingDisclosure />)
    fireEvent.click(screen.getByRole('button', { name: 'データの取り扱い' }))

    const disclosure = screen.getByTestId(DATA_HANDLING_DISCLOSURE_TEST_ID)
    const text = disclosure.textContent ?? ''

    expect(text).toMatch(/登録したアプリデータは Supabase のデータベースに保存/)
    expect(text).toMatch(/利用中のみブラウザ内に一時的に保持/)
    expect(text).toMatch(/ログイン状態（セッション）の情報は.*ブラウザ側で保持/)
    expect(text).not.toMatch(/localStorage/i)
    expect(text).not.toMatch(/sessionStorage/i)
    expect(text).not.toMatch(/IndexedDB/)

    expect(text).toMatch(
      /フォルダ・価格記録・買い物メモ・店舗名など、price-memo に登録した主なデータには、自動削除や有効期限の設定はありません/,
    )

    expect(text).toMatch(/データベース上の削除は、Supabase に保存されている price-memo の登録データを対象/)
    expect(text).toMatch(/バックアップやサービス提供者側の運用ログに残るコピーは、この削除の対象外/)
    expect(text).toMatch(/直ちにすべて消えるとは限りません/)
    expect(text).not.toMatch(/保持期間/)
    expect(text).not.toMatch(/本アプリのコードからは確認していません/)
  })
})
