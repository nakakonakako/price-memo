import type { ReactNode } from 'react'
import { TrashDragItem } from '@/components/trash/TrashDragItem'
import type { TrashDragPayload } from '@/components/trash/types'
import { SwipeToDeleteRow } from './SwipeToDeleteRow'

type Props = {
  dragEnabled: boolean
  payload: TrashDragPayload
  onClick?: () => void
  onDelete: () => void
  className?: string
  children: ReactNode
}

export function DraggableCatalogItem({
  dragEnabled,
  payload,
  onClick,
  onDelete,
  className = '',
  children,
}: Props) {
  if (!dragEnabled) {
    return (
      <SwipeToDeleteRow onDelete={onDelete} className={className}>
        <div className={onClick ? 'cursor-pointer' : undefined} onClick={onClick}>
          {children}
        </div>
      </SwipeToDeleteRow>
    )
  }

  return (
    <TrashDragItem payload={payload} onClick={onClick} className={className}>
      {children}
    </TrashDragItem>
  )
}
