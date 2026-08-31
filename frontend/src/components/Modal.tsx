import type { ReactNode } from 'react'
import { DialogShell } from './DialogShell'

type Props = {
  title: string
  open: boolean
  onClose: () => void
  children: ReactNode
}

export function Modal({ title, open, onClose, children }: Props) {
  return (
    <DialogShell
      open={open}
      onClose={onClose}
      title={title}
      titleId="modal-title"
    >
      {children}
    </DialogShell>
  )
}
