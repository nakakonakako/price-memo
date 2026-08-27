/** Trailing reading in half- or full-width parentheses, e.g. 牛乳(ぎゅうにゅう) / 牛乳（ぎゅうにゅう）. */
const TRAILING_READING =
  /^(.*)[（(]([^（）()]*)[）)]\s*$/u

export function parseFolderName(name: string): {
  displayName: string
  reading: string | null
} {
  const m = name.match(TRAILING_READING)
  if (!m) return { displayName: name, reading: null }

  const reading = m[2].trim()
  if (!reading) return { displayName: name, reading: null }

  const displayName = m[1].replace(/\s+$/u, '')
  return {
    displayName: displayName.length > 0 ? displayName : name,
    reading,
  }
}

/** Sort key: trailing reading if present, otherwise the visible name. */
export function folderSortKey(name: string): string {
  const { displayName, reading } = parseFolderName(name)
  return reading ?? displayName
}
