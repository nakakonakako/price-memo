import { useCallback, useEffect, useRef, useState } from 'react'
import { listFolders } from '@/features/folders/api/foldersApi'
import type { PriceFolder } from '@/features/folders/types'
import { getCurrentAuthUserId } from '@/lib/authIdentity'
import { getCatalogRevisions } from '@/lib/catalogSync'
import { useResumeCatalogRefresh } from '@/hooks/useResumeCatalogRefresh'
import { toUserMessage } from '@/lib/userError'
import { FolderTrendPanel } from './FolderTrendPanel'

export function TrendsPage({ active = true }: { active?: boolean }) {
  const [folders, setFolders] = useState<PriceFolder[]>([])
  const [foldersLoading, setFoldersLoading] = useState(true)
  const [folderId, setFolderId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const catalogRevSeen = useRef<ReturnType<typeof getCatalogRevisions> | null>(
    null,
  )
  const resumeRefreshGenerationRef = useRef(0)

  const invalidateResumeLoads = useCallback(() => {
    resumeRefreshGenerationRef.current += 1
  }, [])

  const refreshFromServerResume = useCallback(async () => {
    const generation = resumeRefreshGenerationRef.current
    const userIdAtStart = getCurrentAuthUserId()
    if (!userIdAtStart) return
    try {
      const list = await listFolders()
      if (
        resumeRefreshGenerationRef.current !== generation ||
        getCurrentAuthUserId() !== userIdAtStart
      ) {
        return
      }
      setFolders(list)
      setFolderId((id) =>
        id && list.some((f) => f.id === id) ? id : (list[0]?.id ?? null),
      )
      setError(null)
    } catch {
      /* keep existing folders */
    }
  }, [])

  useResumeCatalogRefresh({
    active,
    onResumeSignal: invalidateResumeLoads,
    onRefresh: refreshFromServerResume,
  })

  useEffect(() => {
    const generation = resumeRefreshGenerationRef.current
    const userIdAtStart = getCurrentAuthUserId()
    let cancelled = false
    ;(async () => {
      setFoldersLoading(true)
      try {
        const list = await listFolders()
        if (
          cancelled ||
          generation !== resumeRefreshGenerationRef.current ||
          getCurrentAuthUserId() !== userIdAtStart
        ) {
          return
        }
        setFolders(list)
        setFolderId((prev) => prev ?? list[0]?.id ?? null)
      } catch (err) {
        if (
          !cancelled &&
          generation === resumeRefreshGenerationRef.current &&
          getCurrentAuthUserId() === userIdAtStart
        ) {
          setError(toUserMessage(err, 'フォルダの取得に失敗しました。'))
        }
      } finally {
        if (
          !cancelled &&
          generation === resumeRefreshGenerationRef.current &&
          getCurrentAuthUserId() === userIdAtStart
        ) {
          setFoldersLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!active) return
    const cur = getCatalogRevisions()
    if (catalogRevSeen.current == null) {
      catalogRevSeen.current = cur
      return
    }
    const prev = catalogRevSeen.current
    catalogRevSeen.current = cur
    if (cur.folders === prev.folders) return
    const generation = ++resumeRefreshGenerationRef.current
    const userIdAtStart = getCurrentAuthUserId()
    void listFolders()
      .then((list) => {
        if (
          generation !== resumeRefreshGenerationRef.current ||
          getCurrentAuthUserId() !== userIdAtStart
        ) {
          return
        }
        setFolders(list)
        setFolderId((id) =>
          id && list.some((f) => f.id === id) ? id : (list[0]?.id ?? null),
        )
      })
      .catch(() => {})
  }, [active])

  const fieldClass =
    'w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-stone-500'

  return (
    <section className="space-y-4">
      {foldersLoading ? (
        <p className="text-sm text-stone-500">フォルダを読み込み中...</p>
      ) : folders.length === 0 ? (
        <p className="rounded-md border border-dashed border-stone-300 bg-white/60 px-4 py-8 text-center text-sm text-stone-500">
          記録がありません
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
