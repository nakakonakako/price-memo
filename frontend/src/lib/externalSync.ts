export const PRICE_MEMO_TABLES = [
  'price_folders',
  'price_records',
  'price_memo_items',
  'price_stores',
] as const

export type PriceMemoTable = (typeof PRICE_MEMO_TABLES)[number]
export type PriceMemoOperation = 'INSERT' | 'UPDATE' | 'DELETE'

export type ExternalSyncListener = (
  tables: ReadonlySet<PriceMemoTable>,
) => void

const allowedTables = new Set<string>(PRICE_MEMO_TABLES)
const listeners = new Set<ExternalSyncListener>()
let pendingTables = new Set<PriceMemoTable>()
let flushTimer: ReturnType<typeof setTimeout> | null = null

export function isPriceMemoTable(value: unknown): value is PriceMemoTable {
  return typeof value === 'string' && allowedTables.has(value)
}

export function isPriceMemoOperation(
  value: unknown,
): value is PriceMemoOperation {
  return value === 'INSERT' || value === 'UPDATE' || value === 'DELETE'
}

export function subscribeExternalSync(
  listener: ExternalSyncListener,
): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Batch nearby Broadcast invalidations without mixing them with local revisions. */
export function requestExternalSync(
  tables: Iterable<PriceMemoTable>,
): void {
  for (const table of tables) pendingTables.add(table)
  if (pendingTables.size === 0 || flushTimer !== null) return

  flushTimer = setTimeout(() => {
    flushTimer = null
    const batch = pendingTables
    pendingTables = new Set()
    for (const listener of listeners) listener(batch)
  }, 50)
}

/** Drop queued notifications when the authenticated app identity changes. */
export function clearPendingExternalSync(): void {
  if (flushTimer !== null) clearTimeout(flushTimer)
  flushTimer = null
  pendingTables = new Set()
}

/** @internal test helper */
export function resetExternalSyncForTests(): void {
  clearPendingExternalSync()
  listeners.clear()
}
