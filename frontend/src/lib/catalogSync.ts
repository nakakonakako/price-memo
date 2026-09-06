type CatalogRevisions = {
  folders: number
  records: number
}

type Listener = (revs: CatalogRevisions) => void

let foldersRev = 0
let recordsRev = 0
const listeners = new Set<Listener>()

function snapshot(): CatalogRevisions {
  return { folders: foldersRev, records: recordsRev }
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

export function subscribeCatalogRevisions(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
