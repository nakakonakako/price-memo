import { describe, expect, it, vi } from 'vitest'
import type { PriceFolder } from '../types'

vi.mock('@/lib/supabase', () => ({
  supabase: {},
}))

import { filterFolders, findFolderByName } from './foldersApi'

const folders: PriceFolder[] = [
  {
    id: 'milk',
    user_id: 'user',
    name: '牛乳（通常表記）',
    reading: 'ぎゅうにゅう',
    sort_order: 0,
    created_at: '',
    updated_at: '',
  },
  {
    id: 'beans',
    user_id: 'user',
    name: '納豆（3パック）',
    reading: null,
    sort_order: 1,
    created_at: '',
    updated_at: '',
  },
]

describe('folder name lookup', () => {
  it('searches both literal names and explicitly stored readings', () => {
    expect(filterFolders(folders, 'ぎゅうにゅう').map((folder) => folder.id)).toEqual([
      'milk',
    ])
    expect(filterFolders(folders, '3パック').map((folder) => folder.id)).toEqual([
      'beans',
    ])
  })

  it('matches a folder by its actual name, without parsing parentheses', () => {
    expect(findFolderByName(folders, '納豆（3パック）')?.id).toBe('beans')
    expect(findFolderByName(folders, '納豆')?.id).toBeUndefined()
  })
})
