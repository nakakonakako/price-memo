import type { ReactNode } from 'react'
import { CloseIcon } from '@/components/icons/CloseIcon'

type Props = {
  name: string
  reading: string
  readingExpanded: boolean
  disabled: boolean
  onNameChange: (value: string) => void
  onReadingChange: (value: string) => void
  onReadingExpandedChange: (expanded: boolean) => void
  actions: ReactNode
}

const fieldClass =
  'min-w-0 w-full rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-stone-500 disabled:opacity-50'

const rowSecondaryMinH = 'min-h-[2.125rem]'

/** Controlled name fields; visibility state never changes the supplied value. */
export function FolderNameFields({
  name,
  reading,
  readingExpanded,
  disabled,
  onNameChange,
  onReadingChange,
  onReadingExpandedChange,
  actions,
}: Props) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <input
        type="text"
        aria-label="フォルダ名"
        value={name}
        onChange={(event) => onNameChange(event.target.value)}
        className={fieldClass}
        autoFocus
        disabled={disabled}
      />
      <div className={`flex min-w-0 items-center gap-1 ${rowSecondaryMinH}`}>
        <div
          className={`flex min-w-0 flex-1 items-center ${rowSecondaryMinH}`}
        >
          {readingExpanded ? (
            <div className={`relative min-w-0 flex-1 ${rowSecondaryMinH}`}>
              <input
                type="text"
                aria-label="読み仮名（任意）"
                value={reading}
                onChange={(event) => onReadingChange(event.target.value)}
                placeholder="読み仮名（任意）"
                className={`${fieldClass} pr-9`}
                disabled={disabled}
              />
              {reading !== '' ? (
                <button
                  type="button"
                  onClick={() => onReadingChange('')}
                  disabled={disabled}
                  aria-label="読み仮名をクリア"
                  className="absolute right-0.5 top-1/2 inline-flex h-7 w-7 shrink-0 -translate-y-1/2 items-center justify-center rounded-md text-stone-600 hover:bg-white/70 disabled:opacity-50"
                >
                  <CloseIcon className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onReadingExpandedChange(true)}
              disabled={disabled}
              className="shrink-0 rounded-md px-2 py-1.5 text-xs text-stone-600 hover:bg-white/70 disabled:opacity-50"
            >
              ＋ 読み仮名を追加
            </button>
          )}
        </div>
        <div className="flex shrink-0 items-center">{actions}</div>
      </div>
    </div>
  )
}
