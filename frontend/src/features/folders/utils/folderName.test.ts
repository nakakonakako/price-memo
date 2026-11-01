import { describe, expect, it } from 'vitest'
import {
  folderSearchText,
  folderSortKey,
  parseFolderName,
} from './folderName'

describe('folder name utilities', () => {
  it('keeps all parentheses in the displayed folder name', () => {
    expect(parseFolderName('牛乳（ぎゅうにゅう）')).toEqual({
      displayName: '牛乳（ぎゅうにゅう）',
      reading: null,
    })
  })

  it('uses only the explicitly stored reading for sort and search', () => {
    expect(folderSortKey('牛乳（通常表記）', 'ぎゅうにゅう')).toBe('ぎゅうにゅう')
    expect(folderSortKey('牛乳（通常表記）', null)).toBe('牛乳（通常表記）')
    expect(folderSearchText('牛乳（通常表記）', 'ぎゅうにゅう')).toBe(
      '牛乳（通常表記） ぎゅうにゅう',
    )
  })
})
