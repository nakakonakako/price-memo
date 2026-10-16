type CatalogRevisions = {
  folders: number
  records: number
  stores: number
}

export type FolderDeletedEvent = {
  folderId: string
  userId: string
}

type Listener = (revs: CatalogRevisions) => void
type FolderDeletedListener = (event: FolderDeletedEvent) => void

let foldersRev = 0
let recordsRev = 0
let storesRev = 0
const listeners = new Set<Listener>()
const folderDeletedListeners = new Set<FolderDeletedListener>()

function snapshot(): CatalogRevisions {
  return { folders: foldersRev, records: recordsRev, stores: storesRev }
}

function notify() {
  const revs = snapshot()
  for (const listener of listeners) listener(revs)
}

/** Current revision counters for cross-tab keep-alive sync. */
export function getCatalogRevisions(): CatalogRevisions {
  return snapshot()
}

export function bumpFoldersRevision() {
  foldersRev += 1
  notify()
}

export function bumpRecordsRevision() {
  recordsRev += 1
  notify()
}

export function bumpStoresRevision() {
  storesRev += 1
  notify()
}

export function subscribeCatalogRevisions(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Publish a successful folder deletion with its revision in one notification. */
export function publishFolderDeleted(event: FolderDeletedEvent): void {
  foldersRev += 1
  for (const listener of folderDeletedListeners) listener(event)
  notify()
}

export function subscribeFolderDeleted(
  listener: FolderDeletedListener,
): () => void {
  folderDeletedListeners.add(listener)
  return () => {
    folderDeletedListeners.delete(listener)
  }
}

/** Reset revision counters when the authenticated user changes. */
export function resetCatalogSync() {
  foldersRev = 0
  recordsRev = 0
  storesRev = 0
}
