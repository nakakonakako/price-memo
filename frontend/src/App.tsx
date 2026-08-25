import { useState } from 'react'
import { MainLayout, type TabId } from '@/components/MainLayout'
import { FoldersPage } from '@/features/folders/components/FoldersPage'
import { RecordsPage } from '@/features/records/components/RecordsPage'
import { TrendsPage } from '@/features/trends/components/TrendsPage'

export default function App() {
  const [tab, setTab] = useState<TabId>('folders')

  return (
    <MainLayout activeTab={tab} onTabChange={setTab}>
      {tab === 'folders' && <FoldersPage />}
      {tab === 'records' && <RecordsPage />}
      {tab === 'trends' && <TrendsPage />}
    </MainLayout>
  )
}
