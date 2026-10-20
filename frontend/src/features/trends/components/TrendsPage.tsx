import { useCallback, useEffect, useRef, useState } from 'react'
import { listFolders } from '@/features/folders/api/foldersApi'
import type { PriceFolder } from '@/features/folders/types'
import { getCurrentAuthUserId } from '@/lib/authIdentity'
import { createVisibleLoadTracker } from '@/lib/visibleLoad'
import { getCatalogRevisions } from '@/lib/catalogSync'
import { useResumeCatalogRefresh } from '@/hooks/useResumeCatalogRefresh'
import { useExternalCatalogRefresh } from '@/hooks/useExternalCatalogRefresh'
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
  const visibleLoadRef = useRef(createVisibleLoadTracker())

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
    } finally {
      visibleLoadRef.current.settle()
      if (getCurrentAuthUserId() === userIdAtStart) setFoldersLoading(false)
    }
  }, [])

  useResumeCatalogRefresh({
    active,
    onResumeSignal: invalidateResumeLoads,
    onRefresh: refreshFromServerResume,
  })

  useExternalCatalogRefresh({
    active,
    tables: ['price_folders'],
    onSignal: invalidateResumeLoads,
    onRefresh: refreshFromServerResume,
  })

  useEffect(() => {
    const visibleLoad = visibleLoadRef.current
    const generation = ++resumeRefreshGenerationRef.current
    const userIdAtStart = getCurrentAuthUserId()
    let cancelled = false
    let initialVisibleLoadReleased = false
    const releaseInitialVisibleLoad = () => {
      if (initialVisibleLoadReleased) return false
      initialVisibleLoadReleased = true
      return visibleLoad.end()
    }
    visibleLoad.begin()
    void (async () => {
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
          releaseInitialVisibleLoad() &&
          !cancelled &&
          getCurrentAuthUserId() === userIdAtStart
        ) {
          setFoldersLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
      resumeRefreshGenerationRef.current += 1
      releaseInitialVisibleLoad()
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
            <FolderTrendPanel folderId={folderId} resumeSyncActive={active} />
          )}
        </>
      )}
    </section>
  )
}
