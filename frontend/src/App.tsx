import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
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

  useEffect(() => {
    if (isLargeScreen && tab === 'trends') {
      setTab('folders')
    }
  }, [isLargeScreen, tab])

  useEffect(() => {
    setVisited((prev) => (prev[tab] ? prev : { ...prev, [tab]: true }))
  }, [tab])

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
      <TabPanel active={tab === 'memo'}>
        <ShoppingMemoPage active={tab === 'memo'} />
      </TabPanel>
      {visited.folders && (
        <TabPanel active={tab === 'folders'}>
          <FoldersPage active={tab === 'folders'} />
        </TabPanel>
      )}
      {visited.trends && (
        <TabPanel active={tab === 'trends'}>
          <Suspense fallback={<TabFallback />}>
            <TrendsPage active={tab === 'trends'} />
          </Suspense>
        </TabPanel>
      )}
      {visited.howto && (
        <TabPanel active={tab === 'howto'}>
          <Suspense fallback={<TabFallback />}>
            <HowToPage />
          </Suspense>
        </TabPanel>
      )}
    </MainLayout>
  )
}
