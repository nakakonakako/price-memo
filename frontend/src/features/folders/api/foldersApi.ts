import { supabase } from '@/lib/supabase'
import type { PriceFolder } from '../types'

export async function listFolders(): Promise<PriceFolder[]> {
  const { data, error } = await supabase
    .from('price_folders')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) throw error
  return (data ?? []) as PriceFolder[]
}

export async function createFolder(name: string): Promise<PriceFolder> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError) throw userError
  if (!user) throw new Error('ログインが必要です')

  const trimmed = name.trim()
  if (!trimmed) throw new Error('フォルダ名を入力してください')

  const { data: maxRow } = await supabase
    .from('price_folders')
    .select('sort_order')
    .eq('user_id', user.id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const sort_order = (maxRow?.sort_order ?? -1) + 1

  const { data, error } = await supabase
    .from('price_folders')
    .insert({ name: trimmed, user_id: user.id, sort_order })
    .select()
    .single()

  if (error) throw error
  return data as PriceFolder
}

export async function renameFolder(
  id: string,
  name: string,
): Promise<PriceFolder> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('フォルダ名を入力してください')

  const { data, error } = await supabase
    .from('price_folders')
    .update({ name: trimmed, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as PriceFolder
}

export async function deleteFolder(id: string): Promise<void> {
  const { error } = await supabase.from('price_folders').delete().eq('id', id)
  if (error) throw error
}

/** Persist folder display order (ids in desired order). */
export async function reorderFolders(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const now = new Date().toISOString()
  const results = await Promise.all(
    ids.map((id, sort_order) =>
      supabase
        .from('price_folders')
        .update({ sort_order, updated_at: now })
        .eq('id', id),
    ),
  )
  const failed = results.find((r) => r.error)
  if (failed?.error) throw failed.error
}
