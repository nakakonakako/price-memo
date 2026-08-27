import { PencilIcon } from '@/components/icons/PencilIcon'

type Props = {
  label: string
  onClick: () => void
  disabled?: boolean
  className?: string
  /** Compact muted control for inline titles */
  quiet?: boolean
}

export function EditIconButton({
  label,
  onClick,
  disabled,
  className = '',
  quiet = false,
}: Props) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={
        quiet
          ? `inline-flex h-8 w-8 shrink-0 items-center justify-center rounded text-stone-400/70 hover:bg-black/5 hover:text-stone-600 disabled:opacity-50 ${className}`
          : `inline-flex h-12 min-h-12 w-12 min-w-12 shrink-0 items-center justify-center rounded-md text-stone-600 hover:bg-stone-100 disabled:opacity-50 ${className}`
      }
    >
      <PencilIcon className={quiet ? 'h-3.5 w-3.5' : 'h-6 w-6'} />
    </button>
  )
}
