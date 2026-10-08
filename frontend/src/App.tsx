import {
  lazy,
  Suspense,
  useCallback,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { Auth } from '@/components/Auth'
import { MainLayout, type TabId } from '@/components/MainLayout'
import { useAuth } from '@/contexts/AuthContext'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import type { FolderDetailRequest } from '@/features/folders/folderDetailRequest'
import { ShoppingMemoPage } from '@/features/memo/components/ShoppingMemoPage'

const FoldersPage = lazy(() =>
  import('@/features/folders/components/FoldersPage').then((m) => ({
    default: m.FoldersPage,
  })),
)
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

function AuthenticatedApp({
  session,
  logout,
}: {
  session: Session
  logout: () => Promise<void>
}) {
  const [tab, setTab] = useState<TabId>('memo')
  const [visited, setVisited] = useState<Record<TabId, boolean>>({
    memo: true,
    folders: false,
    trends: false,
    howto: false,
  })
  const isLargeScreen = useMediaQuery('(min-width: 1024px)')
  const [folderDetailRequest, setFolderDetailRequest] =
    useState<FolderDetailRequest | null>(null)
  const folderDetailRequestSeq = useRef(0)

  const activeTab = isLargeScreen && tab === 'trends' ? 'folders' : tab
  const changeTab = (nextTab: TabId) => {
    const next = isLargeScreen && nextTab === 'trends' ? 'folders' : nextTab
    setTab(next)
    setVisited((prev) => (prev[next] ? prev : { ...prev, [next]: true }))
  }
  const requestFolderDetail = (folderId: string) => {
    folderDetailRequestSeq.current += 1
    setFolderDetailRequest({
      id: folderDetailRequestSeq.current,
      folderId,
    })
    changeTab('folders')
  }
  const handleFolderDetailRequestHandled = useCallback((requestId: number) => {
    setFolderDetailRequest((current) =>
      current?.id === requestId ? null : current,
    )
  }, [])

  return (
    <MainLayout
      activeTab={activeTab}
      onTabChange={changeTab}
      userLabel={session.user.email ?? 'ユーザー'}
      onLogout={logout}
      hiddenTabs={isLargeScreen ? ['trends'] : []}
    >
      <TabPanel active={activeTab === 'memo'}>
        <ShoppingMemoPage
          active={activeTab === 'memo'}
          onOpenFolder={requestFolderDetail}
        />
      </TabPanel>
      {(visited.folders || activeTab === 'folders') && (
        <TabPanel active={activeTab === 'folders'}>
          <Suspense fallback={<TabFallback />}>
            <FoldersPage
              active={activeTab === 'folders'}
              folderDetailRequest={folderDetailRequest}
              onFolderDetailRequestHandled={handleFolderDetailRequestHandled}
            />
          </Suspense>
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

export default function App() {
  const { session, isLoading, logout } = useAuth()

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
    <AuthenticatedApp
      key={session.user.id}
      session={session}
      logout={logout}
    />
  )
}
