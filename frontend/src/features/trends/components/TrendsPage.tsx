import { useEffect, useState } from 'react'
import { listFolders } from '@/features/folders/api/foldersApi'
import type { PriceFolder } from '@/features/folders/types'
import { toUserMessage } from '@/lib/userError'
import { FolderTrendPanel } from './FolderTrendPanel'

export function TrendsPage() {
  const [folders, setFolders] = useState<PriceFolder[]>([])
  const [foldersLoading, setFoldersLoading] = useState(true)
  const [folderId, setFolderId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setFoldersLoading(true)
      try {
        const list = await listFolders()
        if (cancelled) return
        setFolders(list)
        setFolderId((prev) => prev ?? list[0]?.id ?? null)
      } catch (err) {
        if (!cancelled) {
          setError(toUserMessage(err, 'フォルダの取得に失敗しました。'))
        }
      } finally {
        if (!cancelled) setFoldersLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const fieldClass =
    'w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-stone-500'

  return (
    <section className="space-y-4">
      {foldersLoading ? (
        <p className="text-sm text-stone-500">フォルダを読み込み中...</p>
      ) : folders.length === 0 ? (
        <p className="rounded-md border border-dashed border-stone-300 bg-white/60 px-4 py-8 text-center text-sm text-stone-500">
          先にフォルダと厳密レコードを追加してください。
        </p>
      ) : (
        <>
          <label className="block max-w-md space-y-1">
            <span className="text-xs font-medium text-stone-500">フォルダ</span>
            <select
              className={fieldClass}
              value={folderId ?? ''}
              onChange={(e) => setFolderId(e.target.value)}
            >
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>

          {error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          {folderId && (
            <FolderTrendPanel folderId={folderId} />
          )}
        </>
      )}
    </section>
  )
}
