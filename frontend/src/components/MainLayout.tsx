import type { ReactNode } from 'react'

export type TabId = 'folders' | 'records' | 'trends' | 'link'

const TABS: { id: TabId; label: string }[] = [
  { id: 'folders', label: 'フォルダ' },
  { id: 'records', label: '記録' },
  { id: 'trends', label: '値段推移' },
  { id: 'link', label: 'レシート紐付け' },
]

type Props = {
  activeTab: TabId
  onTabChange: (tab: TabId) => void
  children: ReactNode
  userLabel: string
  onLogout: () => void
}

export function MainLayout({
  activeTab,
  onTabChange,
  children,
  userLabel,
  onLogout,
}: Props) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-stone-300/80 bg-[#f6f4f0]/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs tracking-wide text-stone-500">
                機能 B · 厳密単価比較
              </p>
              <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
                単価メモ
              </h1>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <span className="hidden max-w-[10rem] truncate text-xs text-stone-500 sm:inline">
                {userLabel}
              </span>
              <button
                type="button"
                onClick={onLogout}
                className="rounded-md px-2.5 py-1 text-xs text-stone-600 hover:bg-stone-200/70"
              >
                ログアウト
              </button>
            </div>
          </div>
          <nav className="flex gap-1" aria-label="メイン">
            {TABS.map((tab) => {
              const active = tab.id === activeTab
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onTabChange(tab.id)}
                  className={
                    active
                      ? 'rounded-md bg-stone-900 px-3 py-1.5 text-sm text-white'
                      : 'rounded-md px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-200/70'
                  }
                >
                  {tab.label}
                </button>
              )
            })}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
    </div>
  )
}
