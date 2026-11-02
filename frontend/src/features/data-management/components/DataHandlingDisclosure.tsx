import { useState } from 'react'
import { DialogShell } from '@/components/DialogShell'
import { DataHandlingDisclosureContent } from './DataHandlingDisclosureContent'

const DIALOG_TITLE = 'データの取り扱い'

type Props = {
  className?: string
  linkLabel?: string
}

export function DataHandlingDisclosure({ className, linkLabel }: Props) {
  const [open, setOpen] = useState(false)
  const buttonLabel = linkLabel ?? DIALOG_TITLE

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          'text-sm text-stone-600 underline decoration-stone-300 underline-offset-2 hover:text-stone-900'
        }
      >
        {buttonLabel}
      </button>
      <DialogShell
        open={open}
        onClose={() => setOpen(false)}
        title={DIALOG_TITLE}
        titleId="data-handling-disclosure-title"
        width="wide"
      >
        <DataHandlingDisclosureContent />
      </DialogShell>
    </>
  )
}
