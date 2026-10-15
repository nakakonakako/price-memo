import { useRef, useState } from 'react'
import { DialogShell } from '@/components/DialogShell'
import { useAuth } from '@/contexts/AuthContext'
import { getCurrentAuthUserId } from '@/lib/authIdentity'
import { invalidateStoresCache } from '@/features/stores/api/storesCache'
import { resetCatalogSync } from '@/lib/catalogSync'
import { supabase } from '@/lib/supabase'

type Props = {
  onDataDeleted: () => void
}

export function DataManagementPage({ onDataDeleted }: Props) {
  const { session } = useAuth()
  const [confirmationOpen, setConfirmationOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const inFlight = useRef(false)

  const deleteData = async () => {
    if (inFlight.current || !session?.user.id) return

    inFlight.current = true
    const userIdAtStart = session.user.id
    setIsDeleting(true)
    setError(null)
    setSuccess(false)

    try {
      const { error: rpcError } = await supabase.rpc(
        'delete_my_price_memo_data',
      )
      if (rpcError) throw rpcError

      if (getCurrentAuthUserId() !== userIdAtStart) return

      invalidateStoresCache()
      resetCatalogSync()
      setConfirmationOpen(false)
      setSuccess(true)
      onDataDeleted()
    } catch {
      if (getCurrentAuthUserId() === userIdAtStart) {
        setError(
          'データ削除に失敗しました。データの状態を確認してから、もう一度お試しください。',
        )
        setConfirmationOpen(false)
      }
    } finally {
      inFlight.current = false
      if (getCurrentAuthUserId() === userIdAtStart) setIsDeleting(false)
    }
  }

  return (
    <section className="space-y-5" aria-labelledby="data-management-title">
      <div>
        <p className="text-xs tracking-wide text-stone-500">アカウント設定</p>
        <h2
          id="data-management-title"
          className="mt-1 text-xl font-semibold text-stone-900"
        >
          データ管理
        </h2>
      </div>

      <section className="space-y-4 rounded-xl border border-red-200 bg-white p-4 sm:p-6">
        <div className="space-y-2">
          <h3 className="text-base font-semibold text-stone-900">
            price-memoのデータをすべて削除
          </h3>
          <p className="text-sm leading-6 text-stone-700">
            ログイン中のアカウントに保存されたフォルダ、価格記録、買い物メモ、店舗名を削除します。
          </p>
          <p className="break-words text-xs leading-5 text-stone-500">
            対象: price_folders / price_records / price_memo_items / price_stores
          </p>
          <p className="text-sm font-medium leading-6 text-red-800">
            削除したデータは復元できません。レシートアプリのデータとログインアカウントは削除されません。
          </p>
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          >
            {error}
          </p>
        )}
        {success && (
          <p role="status" className="text-sm text-green-800">
            price-memoのデータを削除しました。
          </p>
        )}

        <button
          type="button"
          disabled={isDeleting}
          onClick={() => {
            setError(null)
            setConfirmationOpen(true)
          }}
          className="w-full rounded-md bg-red-700 px-4 py-3 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          すべてのデータを削除
        </button>
      </section>

      <DialogShell
        open={confirmationOpen}
        onClose={() => {
          if (!isDeleting) setConfirmationOpen(false)
        }}
        title="データをすべて削除しますか？"
        titleId="delete-price-memo-title"
      >
        <div className="space-y-5 p-4 sm:p-6">
          <p className="text-sm leading-6 text-stone-700">
            ログイン中のアカウントの4種類のprice-memoデータを削除します。この操作は取り消せません。レシートアプリとアカウントには影響しません。
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              disabled={isDeleting}
              onClick={() => setConfirmationOpen(false)}
              className="rounded-md border border-stone-300 px-4 py-2.5 text-sm text-stone-700 hover:bg-stone-50 disabled:opacity-50"
            >
              キャンセル
            </button>
            <button
              type="button"
              disabled={isDeleting}
              onClick={() => void deleteData()}
              className="rounded-md bg-red-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isDeleting ? '削除中...' : '削除を確定する'}
            </button>
          </div>
        </div>
      </DialogShell>
    </section>
  )
}
