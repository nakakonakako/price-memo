import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { PriceUnit } from '../types'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import {
  CUSTOM_UNIT_VALUE,
  mergeUnitOptions,
  UNIT_PRESETS,
} from '../utils/unitPrice'

type Props = {
  value: PriceUnit
  onChange: (unit: PriceUnit) => void
  /** Units already used for this folder/target — shown first */
  preferredUnits?: PriceUnit[]
  disabled?: boolean
  className?: string
  /** inline = input below select; modal = dialog for custom unit (no layout shift) */
  customInputMode?: 'inline' | 'modal'
}

export function UnitField({
  value,
  onChange,
  preferredUnits = [],
  disabled,
  className = '',
  customInputMode = 'modal',
}: Props) {
  const options = useMemo(
    () => mergeUnitOptions(preferredUnits, value),
    [preferredUnits, value],
  )
  const optionValues = useMemo(
    () => new Set(options.map((o) => o.value)),
    [options],
  )
  const isKnownOption = optionValues.has(value)

  const [customDraft, setCustomDraft] = useState(() =>
    isKnownOption ? '' : value,
  )
  const [inlineCustomActive, setInlineCustomActive] = useState(!isKnownOption)
  const [modalOpen, setModalOpen] = useState(false)
  const previousUnitRef = useRef<PriceUnit>(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isKnownOption) {
      setCustomDraft('')
      setInlineCustomActive(false)
    } else if (value) {
      setCustomDraft(value)
      setInlineCustomActive(true)
    }
  }, [value, isKnownOption])

  useEffect(() => {
    if (!modalOpen) return
    const t = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(t)
  }, [modalOpen])

  const fieldClass =
    className ||
    'w-full rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-stone-500'

  const selectValue = modalOpen
    ? CUSTOM_UNIT_VALUE
    : isKnownOption
      ? value
      : CUSTOM_UNIT_VALUE

  const openCustomModal = () => {
    previousUnitRef.current = value
    const fromPreset = UNIT_PRESETS.some((p) => p.value === value)
    setCustomDraft(fromPreset ? '' : value)
    setModalOpen(true)
  }

  const closeCustomModal = () => setModalOpen(false)

  const confirmCustomUnit = () => {
    const trimmed = customDraft.trim()
    if (!trimmed) return
    onChange(trimmed)
    closeCustomModal()
  }

  const cancelCustomModal = () => {
    closeCustomModal()
    if (!optionValues.has(previousUnitRef.current)) {
      onChange(previousUnitRef.current)
    }
  }

  const handleSelectChange = (next: string) => {
    if (next === CUSTOM_UNIT_VALUE) {
      if (customInputMode === 'modal') {
        openCustomModal()
        return
      }
      setInlineCustomActive(true)
      if (customDraft.trim()) onChange(customDraft.trim())
      return
    }
    closeCustomModal()
    setInlineCustomActive(false)
    onChange(next)
  }

  const showInlineCustom =
    customInputMode === 'inline' && inlineCustomActive

  useBodyScrollLock(customInputMode === 'modal' && modalOpen)

  const select = (
    <select
      className={fieldClass}
      value={selectValue}
      disabled={disabled}
      onChange={(e) => handleSelectChange(e.target.value)}
      onClick={() => {
        if (customInputMode === 'modal' && selectValue === CUSTOM_UNIT_VALUE) {
          openCustomModal()
        }
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
      <option value={CUSTOM_UNIT_VALUE}>その他…</option>
    </select>
  )

  return (
    <>
      {customInputMode === 'inline' ? (
        <div className="space-y-1">
          {select}
          {showInlineCustom && (
            <input
              type="text"
              className={fieldClass}
              value={customDraft}
              disabled={disabled}
              placeholder="kg / 枚 / L"
              onChange={(e) => {
                const v = e.target.value
                setCustomDraft(v)
                if (v.trim()) onChange(v.trim())
              }}
            />
          )}
        </div>
      ) : (
        select
      )}

      {customInputMode === 'modal' &&
        modalOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[90] flex items-center justify-center overscroll-none p-4"
            role="presentation"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) cancelCustomModal()
            }}
            onTouchMove={(e) => {
              if (e.target === e.currentTarget) e.preventDefault()
            }}
          >
            <div
              className="absolute inset-0 bg-black/40"
              aria-hidden
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="unit-custom-title"
              className="relative w-full max-w-sm rounded-lg border border-stone-200 bg-white p-4 shadow-xl"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <h3
                id="unit-custom-title"
                className="text-base font-medium text-stone-900"
              >
                単位を入力
              </h3>
              <p className="mt-1 text-sm text-stone-600">
                リストにない単位（kg、枚、L など）を入力してください。
              </p>
              <input
                ref={inputRef}
                type="text"
                className="mt-3 w-full rounded-md border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-500"
                value={customDraft}
                placeholder="例: kg / 枚 / L"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    confirmCustomUnit()
                  }
                  if (e.key === 'Escape') cancelCustomModal()
                }}
                onChange={(e) => setCustomDraft(e.target.value)}
              />
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-md px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100"
                  onClick={cancelCustomModal}
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  className="rounded-md bg-stone-900 px-3 py-1.5 text-sm text-white hover:bg-stone-800 disabled:opacity-50"
                  disabled={!customDraft.trim()}
                  onClick={confirmCustomUnit}
                >
                  決定
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
