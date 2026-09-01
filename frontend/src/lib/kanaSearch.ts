const KANA_OFFSET = 0x60

/** カタカナをひらがなに統一（検索用） */
export function toHiragana(value: string): string {
  return value.replace(/[\u30a1-\u30f6]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - KANA_OFFSET),
  )
}

/** 検索用に正規化（大小・かな統一） */
export function normalizeForSearch(value: string): string {
  return toHiragana(value.trim().toLocaleLowerCase('ja')).normalize('NFKC')
}

/** 長音「ー」を除いた緩い比較用 */
function normalizeForSearchLoose(value: string): string {
  return normalizeForSearch(value).replace(/ー/g, '')
}

/** 部分一致（ひらがな入力でカタカナ名にもヒット） */
export function matchesSearchQuery(haystack: string, query: string): boolean {
  const q = normalizeForSearch(query)
  if (!q) return true
  const hay = normalizeForSearch(haystack)
  if (hay.includes(q)) return true
  return normalizeForSearchLoose(hay).includes(normalizeForSearchLoose(q))
}

/** 完全一致（既存フォルダ・店舗の照合） */
export function equalsSearchQuery(a: string, b: string): boolean {
  const na = normalizeForSearch(a)
  const nb = normalizeForSearch(b)
  if (na === nb) return true
  return normalizeForSearchLoose(na) === normalizeForSearchLoose(nb)
}
