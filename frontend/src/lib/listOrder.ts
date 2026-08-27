export function loadIdOrder(key: string): string[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === 'string')
      : []
  } catch {
    return []
  }
}

export function saveIdOrder(key: string, ids: string[]) {
  localStorage.setItem(key, JSON.stringify(ids))
}

export function applyIdOrder<T extends { id: string }>(
  items: T[],
  order: string[],
): T[] {
  const map = new Map(items.map((item) => [item.id, item]))
  const result: T[] = []
  for (const id of order) {
    const item = map.get(id)
    if (item) {
      result.push(item)
      map.delete(id)
    }
  }
  return [...result, ...map.values()]
}

export function reorderIds(
  ids: string[],
  draggedId: string,
  beforeId: string | null,
): string[] {
  const without = ids.filter((id) => id !== draggedId)
  if (beforeId == null) return [...without, draggedId]
  const idx = without.indexOf(beforeId)
  if (idx < 0) return [...without, draggedId]
  return [...without.slice(0, idx), draggedId, ...without.slice(idx)]
}
