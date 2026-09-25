import { useMemo, useRef, useState, type ReactNode } from 'react'
import type { PriceUnit } from '../types'
import {
  CUSTOM_UNIT_VALUE,
  mergeUnitOptions,
  UNIT_PRESETS,
} from '../utils/unitPrice'

type Parts = {
  select: ReactNode
  customInput: ReactNode | null
}

type Props = {
  value: PriceUnit
  onChange: (unit: PriceUnit) => void
  /** Units already used for this folder/target — shown first */
  preferredUnits?: PriceUnit[]
  disabled?: boolean
  className?: string
  customInputClassName?: string
  children?: (parts: Parts) => ReactNode
}

export function UnitField({
  value,
  onChange,
  preferredUnits = [],
  disabled,
  className = '',
  customInputClassName = '',
  children,
}: Props) {
  const options = useMemo(
    () => mergeUnitOptions(preferredUnits, value),
    [preferredUnits, value],
  )
  const presetValues = useMemo(
    () => new Set(UNIT_PRESETS.map((p) => p.value)),
    [],
  )
  const isPresetOption = presetValues.has(value)

  const [customDraftState, setCustomDraftState] = useState({
    value,
    draft: isPresetOption ? '' : value,
  })
  const customDraft =
    customDraftState.value === value
      ? customDraftState.draft
      : isPresetOption
        ? ''
        : value
  const [customActive, setCustomActive] = useState(!isPresetOption)
  const previousUnitRef = useRef<PriceUnit>(value)

  const customActiveForValue = customActive || !isPresetOption

  const fieldClass =
    className ||
    'w-full rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-stone-500'

  const customClass =
    customInputClassName ||
    'w-full rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-stone-500'

  const selectValue = customActiveForValue
    ? CUSTOM_UNIT_VALUE
    : isPresetOption
      ? value
      : CUSTOM_UNIT_VALUE

  const commitCustom = () => {
    const trimmed = customDraft.trim()
    if (trimmed) {
      onChange(trimmed)
      return
    }
    setCustomActive(false)
    onChange(previousUnitRef.current)
    setCustomDraftState({ value, draft: '' })
  }

  const handleSelectChange = (next: string) => {
    if (next === CUSTOM_UNIT_VALUE) {
      previousUnitRef.current = isPresetOption ? value : value
      setCustomActive(true)
      setCustomDraftState({ value, draft: isPresetOption ? '' : value })
      return
    }
    setCustomActive(false)
    setCustomDraftState({ value, draft: '' })
    onChange(next)
  }

  const select = (
    <select
      className={fieldClass}
      value={selectValue}
      disabled={disabled}
      onChange={(e) => handleSelectChange(e.target.value)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
      <option value={CUSTOM_UNIT_VALUE}>その他…</option>
    </select>
  )

  const customInput =
    customActiveForValue ? (
      <input
        type="text"
        className={customClass}
        value={customDraft}
        disabled={disabled}
        placeholder="kg / 枚 / L"
        onBlur={commitCustom}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            e.currentTarget.blur()
          }
        }}
        onChange={(e) =>
          setCustomDraftState({ value, draft: e.target.value })
        }
      />
    ) : null

  if (children) {
    return <>{children({ select, customInput })}</>
  }

  return (
    <div className="space-y-1">
      {select}
      {customInput}
    </div>
  )
}
