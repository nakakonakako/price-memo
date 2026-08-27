import { PencilIcon } from '@/components/icons/PencilIcon'

type Props = {
  label: string
  onClick: () => void
  disabled?: boolean
  className?: string
}

export function EditIconButton({
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
      <PencilIcon className="h-6 w-6" />
    </button>
  )
}
