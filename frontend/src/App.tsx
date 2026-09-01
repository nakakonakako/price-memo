import { useEffect, useState } from 'react'
import { Auth } from '@/components/Auth'
import { MainLayout, type TabId } from '@/components/MainLayout'
import { useAuth } from '@/contexts/AuthContext'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { FoldersPage } from '@/features/folders/components/FoldersPage'
import { ShoppingMemoPage } from '@/features/memo/components/ShoppingMemoPage'
import { TrendsPage } from '@/features/trends/components/TrendsPage'
import { HowToPage } from '@/features/guide/components/HowToPage'

export default function App() {
  const { session, isLoading, logout } = useAuth()
  const [tab, setTab] = useState<TabId>('memo')
  const isLargeScreen = useMediaQuery('(min-width: 1024px)')

  useEffect(() => {
    if (isLargeScreen && tab === 'trends') {
      setTab('folders')
    }
  }, [isLargeScreen, tab])

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
      hiddenTabs={isLargeScreen ? ['trends'] : []}
    >
      {tab === 'memo' && <ShoppingMemoPage />}
      {tab === 'folders' && <FoldersPage />}
      {tab === 'trends' && <TrendsPage />}
      {tab === 'howto' && <HowToPage />}
    </MainLayout>
  )
}
