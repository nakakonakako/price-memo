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

  it('renders the approved user-facing data-handling copy', () => {
    render(<DataHandlingDisclosure />)
    fireEvent.click(screen.getByRole('button', { name: 'データの取り扱い' }))

    const disclosure = screen.getByTestId(DATA_HANDLING_DISCLOSURE_TEST_ID)
    const text = disclosure.textContent ?? ''

    expect(screen.getByRole('heading', { name: '1. 取得する情報と利用目的' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '2. データの保存先と外部サービス' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '3. データの保持と削除' })).toBeTruthy()

    expect(text).toMatch(
      /利用者が登録した商品フォルダ、店舗情報、価格記録、買い物メモを取得・保存します/,
    )
    expect(text).toMatch(/購入日、価格、数量、単位、任意で入力されたメモなどが含まれます/)
    expect(text).toMatch(/商品の単価比較、価格推移の表示、店舗別の記録管理、買い物メモの提供に使用します/)

    expect(text).toMatch(/Supabaseが提供するデータベースに保存します/)
    expect(text).toMatch(/Googleの認証サービスおよびSupabase Authを使用します/)
    expect(text).toMatch(/ログイン状態の維持に必要な情報はブラウザに保存され/)
    expect(text).toMatch(/アプリの利用中に一時的に保持されます/)
    expect(text).toMatch(
      /レシート明細の検索を実行した場合に限り、当該利用者の購入履歴を参照します/,
    )
    expect(text).toMatch(/本アプリからGoogle Geminiへのデータ送信は行いません/)

    expect(text).toMatch(/保存期限や定期的な自動削除は設定していません/)
    expect(text).toMatch(/本アプリに登録したデータを一括削除できます/)
    expect(text).toMatch(/バックアップやサービス運用上のログについては、削除後も一定期間情報が残る場合があります/)

    expect(text).not.toMatch(/localStorage/i)
    expect(text).not.toMatch(/sessionStorage/i)
    expect(text).not.toMatch(/IndexedDB/)
    expect(text).not.toMatch(/price-memo/)
  })
})
