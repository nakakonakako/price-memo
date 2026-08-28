import { CopyIcon } from '@/components/icons/CopyIcon'

type Props = {
  label: string
  onClick: () => void
  disabled?: boolean
  className?: string
}

export function CopyIconButton({
  label,
  onClick,
  disabled,
  className = '',
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
      className={`inline-flex h-12 min-h-12 w-12 min-w-12 shrink-0 items-center justify-center rounded-md text-stone-600 hover:bg-stone-100 disabled:opacity-50 ${className}`}
    >
      <CopyIcon className="h-5 w-5" />
    </button>
  )
}
