import { useCallback, useEffect, useMemo, useState } from 'react'
import { listFolders } from '@/features/folders/api/foldersApi'
import type { PriceFolder } from '@/features/folders/types'
import { listAllRecords } from '@/features/records/api/recordsApi'
import type { PriceRecord } from '@/features/records/types'
import { recordsByFolderId } from '../utils/stats'
import { FolderMemoCard } from './FolderMemoCard'

export function ShoppingMemoPage() {
  const [folders, setFolders] = useState<PriceFolder[]>([])
  const [records, setRecords] = useState<PriceRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [folderList, recordList] = await Promise.all([
        listFolders(),
        listAllRecords(),
      ])
      setFolders(folderList)
      setRecords(recordList)
    } catch (err) {
      setError(err instanceof Error ? err.message : '読み込みに失敗しました')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const byFolder = useMemo(() => recordsByFolderId(records), [records])

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-lg font-medium text-stone-900">買い物メモ</h2>
        <p className="text-sm text-stone-600">
          比較対象の平均・最安・直近を見て買い物します。棚の総額と数量を試算に入れ、必要なら統計へ残せます。
        </p>
      </div>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {isLoading ? (
        <p className="text-sm text-stone-500">読み込み中...</p>
      ) : folders.length === 0 ? (
        <p className="rounded-md border border-dashed border-stone-300 bg-white/60 px-4 py-8 text-center text-sm text-stone-500">
          先に「フォルダ」タブで比較したい商品の棚を作ってください。
        </p>
      ) : (
        <ul className="space-y-3">
          {folders.map((folder) => (
            <FolderMemoCard
              key={folder.id}
              folderId={folder.id}
              folderName={folder.name}
              records={byFolder.get(folder.id) ?? []}
              onSaved={() => void refresh()}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
