import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  createStore,
  filterStores,
  findStoreByName,
  getStoresCached,
  getStoresCacheEpoch,
  peekStoresCache,
  upsertStoresCache,
} from '@/features/stores/api/storesApi'
import { subscribeStoresCacheRefresh } from '@/features/stores/api/storesCache'
import type { PriceStore } from '@/features/stores/types'
import { subscribeCatalogRevisions } from '@/lib/catalogSync'
import { CloseIcon } from '@/components/icons/CloseIcon'
import { toUserMessage } from '@/lib/userError'

type Props = {
  value: string
  onChange: (name: string) => void
  disabled?: boolean
  required?: boolean
  className?: string
  placeholder?: string
  /** false … 既存店舗の選択のみ（比較店舗など） */
  allowRegister?: boolean
  /** 指定時は店舗マスタではなくこの名前だけを候補にする（検索は従来どおり kanaSearch） */
  candidateNames?: readonly string[]
  /** true のとき入力欄右端にクリアボタン（文字があるときのみ） */
  clearable?: boolean
  /** clearable 時の accessible name */
  clearAriaLabel?: string
  /** clearable 時、クリアボタンの hover/focus 見た目を入力枠内に収める（比較店舗向け） */
  clearFitsInput?: boolean
}

export function StoreField({
  value,
  onChange,
  disabled,
  required,
  className = '',
  placeholder = '店舗名で検索',
  allowRegister = true,
  candidateNames,
  clearable = false,
  clearAriaLabel = 'クリア',
  clearFitsInput = false,
}: Props) {
  const [stores, setStores] = useState<PriceStore[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState(value)
  const [open, setOpen] = useState(false)
  const [registering, setRegistering] = useState(false)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  const candidateStores = useMemo((): PriceStore[] | null => {
    if (candidateNames == null) return null
    return candidateNames.map((name, index) => ({
      id: `candidate:${index}:${name}`,
      user_id: '',
      name,
      created_at: '',
    }))
  }, [candidateNames])

  useEffect(() => {
    if (candidateNames != null) return
    let cancelled = false
    const unsubscribe = subscribeCatalogRevisions(() => {
      const current = peekStoresCache()
      if (current) setStores(current)
    })
    const unsubscribeRealtimeRefresh = subscribeStoresCacheRefresh(setStores)
    getStoresCached()
      .then((nextStores) => {
        if (!cancelled) setStores(peekStoresCache() ?? nextStores)
      })
      .catch(() => {
        /* optional */
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
      unsubscribe()
      unsubscribeRealtimeRefresh()
    }
  }, [candidateNames])

  const listStores = candidateStores ?? stores
  const listLoading = candidateStores ? false : loading

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const displayedQuery = open ? query : value
  const filtered = useMemo(
    () => filterStores(listStores, displayedQuery),
    [listStores, displayedQuery],
  )
  const exact = findStoreByName(listStores, displayedQuery)
  const trimmedQuery = displayedQuery.trim()
  const showRegister =
    allowRegister &&
    trimmedQuery.length > 0 &&
    !exact &&
    !listLoading &&
    !registering

  const showClear =
    clearable &&
    !disabled &&
    !registering &&
    displayedQuery.length > 0

  const defaultFieldClass =
    'w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-stone-500'
  const fieldClass = className || defaultFieldClass
  const useClearInset = clearable && clearFitsInput
  const inputClass = useClearInset
    ? `${fieldClass} min-h-0 border-0 bg-transparent py-2 outline-none focus:border-0 focus:ring-0${showClear ? ' pr-11' : ''}`
    : `${fieldClass}${showClear ? ' pr-11' : ''}`
  const clearInsetWrapClass =
    'relative flex w-full min-h-11 items-stretch overflow-hidden rounded-md border border-stone-300 bg-white focus-within:border-stone-500'

  const pick = (name: string) => {
    onChange(name)
    setQuery(name)
    setOpen(false)
    setFieldError(null)
  }

  const clearSelection = (e: ReactMouseEvent | ReactPointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setQuery('')
    onChange('')
    setOpen(false)
    setFieldError(null)
  }

  const registerNew = async () => {
    if (!trimmedQuery) return
    const epoch = getStoresCacheEpoch()
    setRegistering(true)
    setFieldError(null)
    try {
      const created = await createStore(trimmedQuery)
      upsertStoresCache(created, epoch)
      pick(created.name)
    } catch (err) {
      setFieldError(toUserMessage(err, '店舗の登録に失敗しました。'))
    } finally {
      setRegistering(false)
    }
  }

  const clearButton = showClear ? (
    <button
      type="button"
      data-no-trash-drag
      aria-label={clearAriaLabel}
      className={
        useClearInset
          ? 'absolute inset-y-0 right-0 inline-flex w-11 shrink-0 items-center justify-center rounded-none text-stone-600 hover:bg-stone-100 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-stone-500'
          : 'absolute right-0 top-1/2 inline-flex h-11 w-11 shrink-0 -translate-y-1/2 items-center justify-center rounded-md text-stone-600 hover:bg-stone-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500'
      }
      onPointerDown={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
      onClick={clearSelection}
    >
      <CloseIcon className="h-4 w-4" />
    </button>
  ) : null

  return (
    <div ref={rootRef} className="relative">
      <div className={useClearInset ? clearInsetWrapClass : 'relative'}>
        <input
          type="text"
          value={displayedQuery}
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
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          className={inputClass}
          aria-autocomplete="list"
          aria-expanded={open}
        />
        {clearButton}
      </div>
      {open && !disabled && (
        <div
          className="absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden rounded-md border border-stone-200 bg-white shadow-lg"
        >
          {listLoading ? (
            <p className="px-3 py-2 text-sm text-stone-500">読み込み中...</p>
          ) : filtered.length === 0 && !showRegister ? (
            <p className="px-3 py-2 text-sm text-stone-500">
              {candidateStores
                ? candidateStores.length === 0
                  ? 'この品目の記録にある店舗がありません。'
                  : '一致する店舗がありません。'
                : listStores.length === 0
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
        <p className="mt-1 text-xs text-red-700">{fieldError}</p>
      )}
    </div>
  )
}
