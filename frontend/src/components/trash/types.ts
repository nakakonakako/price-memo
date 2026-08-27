export type TrashDragPayload =
  | { kind: 'memo-folder'; id: string }
  | { kind: 'folder'; id: string }
  | { kind: 'folder-record'; id: string; folderId: string }

export type DragEndResult =
  | { action: 'delete'; payload: TrashDragPayload }
  | {
      action: 'reorder'
      payload: TrashDragPayload
      /** Insert before this id; null = append to end */
      beforeId: string | null
    }
  | { action: 'cancel'; payload: TrashDragPayload }
