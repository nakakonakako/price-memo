import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createStore,
  filterStores,
  findStoreByName,
  listStores,
} from '@/features/stores/api/storesApi'
import type { PriceStore } from '@/features/stores/types'
import { toUserMessage } from '@/lib/userError'

type Props = {
  value: string
  onChange: (name: string) => void
  disabled?: boolean
  required?: boolean
  className?: string
  placeholder?: string
}

export function StoreField({
  value,
  onChange,
  disabled,
  required,
  className = '',
  placeholder = '店舗名で検索',
}: Props) {
  const [stores, setStores] = useState<PriceStore[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState(value)
  const [open, setOpen] = useState(false)
  const [registering, setRegistering] = useState(false)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  const refresh = useCallback(async () => {
    try {
      setStores(await listStores())
    } catch {
      /* optional */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!open) setQuery(value)
  }, [value, open])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const filtered = useMemo(() => filterStores(stores, query), [stores, query])
  const exact = findStoreByName(stores, query)
  const trimmedQuery = query.trim()
  const showRegister =
    trimmedQuery.length > 0 && !exact && !loading && !registering

  const fieldClass =
    className ||
    'w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-stone-500'

  const pick = (name: string) => {
    onChange(name)
    setQuery(name)
    setOpen(false)
    setFieldError(null)
  }

  const registerNew = async () => {
    if (!trimmedQuery) return
    setRegistering(true)
    setFieldError(null)
    try {
      const created = await createStore(trimmedQuery)
      setStores((prev) =>
        [...prev, created].sort((a, b) => a.name.localeCompare(b.name, 'ja')),
      )
      pick(created.name)
    } catch (err) {
      setFieldError(toUserMessage(err, '店舗の登録に失敗しました。'))
    } finally {
      setRegistering(false)
    }
  }

  return (
    <div ref={rootRef} className="relative space-y-1">
      <input
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
          if (!e.target.value.trim()) onChange('')
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false)
          if (e.key === 'Enter' && showRegister) {
            e.preventDefault()
            void registerNew()
          }
        }}
        placeholder={placeholder}
        disabled={disabled || registering}
        required={required}
        className={fieldClass}
        aria-autocomplete="list"
        aria-expanded={open}
      />
      {open && !disabled && (
        <div
          className="absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden rounded-md border border-stone-200 bg-white shadow-lg"
        >
          {loading ? (
            <p className="px-3 py-2 text-sm text-stone-500">読み込み中...</p>
          ) : filtered.length === 0 && !showRegister ? (
            <p className="px-3 py-2 text-sm text-stone-500">
              {stores.length === 0
                ? '店舗がまだありません。名前を入力して登録してください。'
                : '一致する店舗がありません。'}
            </p>
          ) : (
            <ul className="max-h-44 overflow-y-auto py-1">
              {filtered.map((store) => (
                <li key={store.id}>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm text-stone-800 hover:bg-stone-100"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(store.name)}
                  >
                    {store.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {showRegister && (
            <button
              type="button"
              className="w-full border-t border-stone-100 px-3 py-2 text-left text-sm text-stone-800 hover:bg-stone-50"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => void registerNew()}
            >
              「{trimmedQuery}」を店舗に登録
            </button>
          )}
        </div>
      )}
      {fieldError && (
        <p className="text-xs text-red-700">{fieldError}</p>
      )}
    </div>
  )
}
