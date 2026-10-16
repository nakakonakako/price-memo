import { useState } from 'react'
import { DialogShell } from '@/components/DialogShell'
import { DataHandlingDisclosureContent } from './DataHandlingDisclosureContent'

const DIALOG_TITLE = 'データの取り扱い'

type Props = {
  className?: string
}

export function DataHandlingDisclosure({ className }: Props) {
  const [open, setOpen] = useState(false)

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
        {DIALOG_TITLE}
      </button>
      <DialogShell
        open={open}
        onClose={() => setOpen(false)}
        title={DIALOG_TITLE}
        titleId="data-handling-disclosure-title"
      >
        <DataHandlingDisclosureContent />
      </DialogShell>
    </>
  )
}
