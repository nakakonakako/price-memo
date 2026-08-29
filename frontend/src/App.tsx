import { useState } from 'react'
import { Auth } from '@/components/Auth'
import { MainLayout, type TabId } from '@/components/MainLayout'
import { useAuth } from '@/contexts/AuthContext'
import { FoldersPage } from '@/features/folders/components/FoldersPage'
import { ShoppingMemoPage } from '@/features/memo/components/ShoppingMemoPage'
import { TrendsPage } from '@/features/trends/components/TrendsPage'

export default function App() {
  const { session, isLoading, logout } = useAuth()
  const [tab, setTab] = useState<TabId>('memo')

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-stone-500">
        読み込み中...
      </div>
    )
  }

  if (!session) {
    return <Auth />
  }

  return (
    <MainLayout
      activeTab={tab}
      onTabChange={setTab}
      userLabel={session.user.email ?? 'ユーザー'}
      onLogout={logout}
      wideContent={tab === 'folders'}
    >
      {tab === 'memo' && <ShoppingMemoPage />}
      {tab === 'folders' && <FoldersPage />}
      {tab === 'trends' && <TrendsPage />}
    </MainLayout>
  )
}
