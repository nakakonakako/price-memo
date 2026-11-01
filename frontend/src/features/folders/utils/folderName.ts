/** Compatibility shape for memo callers pending their separately coordinated update. */
export function parseFolderName(name: string): {
  displayName: string
  reading: null
} {
  return { displayName: name, reading: null }
}

/** Sort by an explicitly stored reading when present, otherwise by the name. */
export function folderSortKey(name: string, reading?: string | null): string {
  return reading?.trim() || name
}

/** Searchable folder text includes the literal name and explicit reading. */
export function folderSearchText(name: string, reading?: string | null): string {
  const normalizedReading = reading?.trim()
  return normalizedReading ? `${name} ${normalizedReading}` : name
}
