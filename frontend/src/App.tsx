import { lazy, Suspense, useState, type ReactNode } from 'react'
import { Auth } from '@/components/Auth'
import { MainLayout, type TabId } from '@/components/MainLayout'
import { useAuth } from '@/contexts/AuthContext'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { FoldersPage } from '@/features/folders/components/FoldersPage'
import { ShoppingMemoPage } from '@/features/memo/components/ShoppingMemoPage'

const TrendsPage = lazy(() =>
  import('@/features/trends/components/TrendsPage').then((m) => ({
    default: m.TrendsPage,
  })),
)
const HowToPage = lazy(() =>
  import('@/features/guide/components/HowToPage').then((m) => ({
    default: m.HowToPage,
  })),
)

function TabPanel({
  active,
  children,
}: {
  active: boolean
  children: ReactNode
}) {
  return (
    <div
      className={active ? undefined : 'hidden'}
      aria-hidden={!active}
    >
      {children}
    </div>
  )
}

function TabFallback() {
  return <p className="text-sm text-stone-500">読み込み中...</p>
}

export default function App() {
  const { session, isLoading, logout } = useAuth()
  const [tab, setTab] = useState<TabId>('memo')
  const [visited, setVisited] = useState<Record<TabId, boolean>>({
    memo: true,
    folders: false,
    trends: false,
    howto: false,
  })
  const isLargeScreen = useMediaQuery('(min-width: 1024px)')

  const activeTab = isLargeScreen && tab === 'trends' ? 'folders' : tab
  const changeTab = (nextTab: TabId) => {
    const next = isLargeScreen && nextTab === 'trends' ? 'folders' : nextTab
    setTab(next)
    setVisited((prev) => (prev[next] ? prev : { ...prev, [next]: true }))
  }

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
      activeTab={activeTab}
      onTabChange={changeTab}
      userLabel={session.user.email ?? 'ユーザー'}
      onLogout={logout}
      hiddenTabs={isLargeScreen ? ['trends'] : []}
    >
      <TabPanel active={activeTab === 'memo'}>
        <ShoppingMemoPage active={activeTab === 'memo'} />
      </TabPanel>
      {(visited.folders || activeTab === 'folders') && (
        <TabPanel active={activeTab === 'folders'}>
          <FoldersPage active={activeTab === 'folders'} />
        </TabPanel>
      )}
      {(visited.trends || activeTab === 'trends') && (
        <TabPanel active={activeTab === 'trends'}>
          <Suspense fallback={<TabFallback />}>
            <TrendsPage active={activeTab === 'trends'} />
          </Suspense>
        </TabPanel>
      )}
      {(visited.howto || activeTab === 'howto') && (
        <TabPanel active={activeTab === 'howto'}>
          <Suspense fallback={<TabFallback />}>
            <HowToPage />
          </Suspense>
        </TabPanel>
      )}
    </MainLayout>
  )
}
