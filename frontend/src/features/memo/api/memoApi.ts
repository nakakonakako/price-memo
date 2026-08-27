import { supabase } from '@/lib/supabase'
import type { PriceFolder } from '@/features/folders/types'

export type PriceMemoItem = {
  id: string
  user_id: string
  folder_id: string
  sort_order: number
  created_at: string
  folder: PriceFolder
}

type MemoRow = {
  id: string
  user_id: string
  folder_id: string
  sort_order: number
  created_at: string
  folder: PriceFolder | PriceFolder[] | null
}

function normalize(row: MemoRow): PriceMemoItem | null {
  const folder = Array.isArray(row.folder) ? row.folder[0] : row.folder
  if (!folder) return null
  return {
    id: row.id,
    user_id: row.user_id,
    folder_id: row.folder_id,
    sort_order: row.sort_order,
    created_at: row.created_at,
    folder,
  }
}

export async function listMemoItems(): Promise<PriceMemoItem[]> {
  const { data, error } = await supabase
    .from('price_memo_items')
    .select('id, user_id, folder_id, sort_order, created_at, folder:price_folders(*)')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) throw error
  return ((data ?? []) as MemoRow[])
    .map(normalize)
    .filter((r): r is PriceMemoItem => r != null)
}

export async function addMemoItem(folderId: string): Promise<PriceMemoItem> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError) throw userError
  if (!user) throw new Error('ログインが必要です')

  const { data: existing } = await supabase
    .from('price_memo_items')
    .select('id, user_id, folder_id, sort_order, created_at, folder:price_folders(*)')
    .eq('user_id', user.id)
    .eq('folder_id', folderId)
    .maybeSingle()

  if (existing) {
    const normalized = normalize(existing as MemoRow)
    if (normalized) return normalized
  }

  const { data: maxRow } = await supabase
    .from('price_memo_items')
    .select('sort_order')
    .eq('user_id', user.id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const sort_order = (maxRow?.sort_order ?? -1) + 1

  const { data, error } = await supabase
    .from('price_memo_items')
    .insert({
      user_id: user.id,
      folder_id: folderId,
      sort_order,
    })
    .select('id, user_id, folder_id, sort_order, created_at, folder:price_folders(*)')
    .single()

  if (error) throw error
  const normalized = normalize(data as MemoRow)
  if (!normalized) throw new Error('メモへの追加に失敗しました。')
  return normalized
}

export async function removeMemoItem(folderId: string): Promise<void> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError) throw userError
  if (!user) throw new Error('ログインが必要です')

  const { error } = await supabase
    .from('price_memo_items')
    .delete()
    .eq('user_id', user.id)
    .eq('folder_id', folderId)

  if (error) throw error
}

/** Persist memo display order (folder ids in desired order). */
export async function reorderMemoItems(folderIds: string[]): Promise<void> {
  if (folderIds.length === 0) return
  const results = await Promise.all(
    folderIds.map((folder_id, sort_order) =>
      supabase
        .from('price_memo_items')
        .update({ sort_order })
        .eq('folder_id', folder_id),
    ),
  )
  const failed = results.find((r) => r.error)
  if (failed?.error) throw failed.error
}
