import type { ReactNode } from 'react'

export type TabId = 'folders' | 'records' | 'trends'

const TABS: { id: TabId; label: string }[] = [
  { id: 'folders', label: 'フォルダ' },
  { id: 'records', label: '記録' },
  { id: 'trends', label: '値段推移' },
]

type Props = {
  activeTab: TabId
  onTabChange: (tab: TabId) => void
  children: ReactNode
}

export function MainLayout({ activeTab, onTabChange, children }: Props) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-stone-300/80 bg-[#f6f4f0]/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs tracking-wide text-stone-500">機能 B · 厳密単価比較</p>
            <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
              単価メモ
            </h1>
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
