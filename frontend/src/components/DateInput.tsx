import type { InputHTMLAttributes } from 'react'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  /** Padding and other chrome on the wrapper. The native input stays padding-free. */
  wrapClassName?: string
}

export function DateInput({
  wrapClassName = '',
  className = '',
  ...props
}: Props) {
  return (
    <div
      className={`date-input-wrap w-full rounded-md border border-stone-300 bg-white focus-within:border-stone-500 ${wrapClassName}`}
    >
      <input
        type="date"
        className={`date-input text-sm ${className}`}
        {...props}
      />
    </div>
  )
}
