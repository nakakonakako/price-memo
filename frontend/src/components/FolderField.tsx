import { useEffect, useMemo, useRef, useState } from 'react'
import {
  filterFolders,
  findFolderByName,
} from '@/features/folders/api/foldersApi'
import type { PriceFolder } from '@/features/folders/types'
import { parseFolderName } from '@/features/folders/utils/folderName'
import { toUserMessage } from '@/lib/userError'

type Props = {
  folders: PriceFolder[]
  folderId: string
  onFolderChange: (id: string) => void
  onCreateFolder: (name: string) => Promise<PriceFolder>
  disabled?: boolean
  required?: boolean
  className?: string
  placeholder?: string
}

export function FolderField({
  folders,
  folderId,
  onFolderChange,
  onCreateFolder,
  disabled,
  required,
  className = '',
  placeholder = '品目名で検索',
}: Props) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [registering, setRegistering] = useState(false)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [pinned, setPinned] = useState<PriceFolder | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const registerLockRef = useRef(false)
  const foldersRef = useRef(folders)
  useEffect(() => {
    foldersRef.current = folders
  }, [folders])

  const selectedFromProps = folders.find((f) => f.id === folderId) ?? null
  const selected =
    selectedFromProps ??
    (pinned && pinned.id === folderId ? pinned : null)
  const selectedLabel = selected
    ? parseFolderName(selected.name).displayName
    : ''

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const displayedQuery = open ? query : selectedLabel
  const filtered = useMemo(
    () => filterFolders(folders, displayedQuery),
    [folders, displayedQuery],
  )
  const exact = findFolderByName(folders, displayedQuery)
  const trimmedQuery = displayedQuery.trim()
  const showRegister =
    trimmedQuery.length > 0 && !exact && !registering

  const fieldClass =
    className ||
    'w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-stone-500'

  const selectFolder = (folder: PriceFolder) => {
    if (!foldersRef.current.some((f) => f.id === folder.id)) {
      foldersRef.current = [...foldersRef.current, folder]
    }
    setPinned(folder)
    onFolderChange(folder.id)
    setQuery(parseFolderName(folder.name).displayName)
    setOpen(false)
    setFieldError(null)
  }

  const registerNew = async () => {
    if (!trimmedQuery || registerLockRef.current) return
    const existing = findFolderByName(foldersRef.current, trimmedQuery)
    if (existing) {
      selectFolder(existing)
      return
    }
    registerLockRef.current = true
    setRegistering(true)
    setFieldError(null)
    try {
      const created = await onCreateFolder(trimmedQuery)
      selectFolder(created)
    } catch (err) {
      const latestMatch = findFolderByName(foldersRef.current, trimmedQuery)
      if (latestMatch) {
        selectFolder(latestMatch)
        return
      }
      setFieldError(toUserMessage(err, '品目の登録に失敗しました。'))
    } finally {
      registerLockRef.current = false
      setRegistering(false)
    }
  }

  return (
    <div ref={rootRef} className="relative space-y-1">
      <input
        type="text"
        value={displayedQuery}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
          if (!e.target.value.trim()) {
            setPinned(null)
            onFolderChange('')
          }
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
        className={fieldClass}
        aria-autocomplete="list"
        aria-expanded={open}
      />
      {open && !disabled && (
        <div
          className="absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden rounded-md border border-stone-200 bg-white shadow-lg"
        >
          {filtered.length === 0 && !showRegister ? (
            <p className="px-3 py-2 text-sm text-stone-500">
              {folders.length === 0
                ? '品目がまだありません。名前を入力して登録してください。'
                : '一致する品目がありません。'}
            </p>
          ) : (
            <ul className="max-h-44 overflow-y-auto py-1">
              {filtered.map((folder) => (
                <li key={folder.id}>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm text-stone-800 hover:bg-stone-100"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selectFolder(folder)}
                  >
                    {parseFolderName(folder.name).displayName}
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
              「{trimmedQuery}」を品目に登録
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
