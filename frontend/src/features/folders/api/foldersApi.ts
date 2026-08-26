import { supabase } from '@/lib/supabase'
import type { PriceFolder } from '../types'

export async function listFolders(): Promise<PriceFolder[]> {
  const { data, error } = await supabase
    .from('price_folders')
    .select('*')
    .order('name', { ascending: true })

  if (error) throw error
  return data ?? []
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

  const { data, error } = await supabase
    .from('price_folders')
    .insert({ name: trimmed, user_id: user.id })
    .select()
    .single()

  if (error) throw error
  return data
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
  return data
}

export async function deleteFolder(id: string): Promise<void> {
  const { error } = await supabase.from('price_folders').delete().eq('id', id)
  if (error) throw error
}
