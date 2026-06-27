/**
 * PathPicker — Remote-picker style path selector with autocomplete.
 *
 * Uses a plain Input + absolute-positioned dropdown (no Radix Popover) to
 * avoid focus/z-index conflicts when used inside a Dialog.
 *
 * Features:
 *   - Input field showing the current path value
 *   - Debounced (300ms) autocomplete of subdirectories using GET /api/fs/list
 *   - Dropdown with clickable candidates
 *   - Keyboard navigation: ↑/↓ to move, Enter to select, Esc to close
 *   - Starts from `/` — typing shows matching subdirs of the parent path
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronRight, Folder, Loader2 } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { useI18n } from '@/providers/i18n'
import { useDebounce } from '@/hooks/useDebounce'
import { listDir, type FsEntry } from '@/hooks/useFileSystem'
import { cn } from '@/lib/utils'

export interface PathPickerProps {
  value: string
  onChange: (path: string) => void
  placeholder?: string
  className?: string
  /** Compact mode: smaller height (for use in dialogs). */
  compact?: boolean
  /** External onKeyDown (e.g. Enter to submit a dialog). Called after internal handler. */
  onKeyDown?: (e: React.KeyboardEvent) => void
}

const DEBOUNCE_MS = 300

export function PathPicker({ value, onChange, placeholder, className, compact, onKeyDown: externalOnKeyDown }: PathPickerProps) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [entries, setEntries] = useState<FsEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(-1)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const debouncedValue = useDebounce(value, DEBOUNCE_MS)

  const { dirPath, prefix } = parseInput(debouncedValue)

  // Fetch subdirectories when the debounced value changes and dropdown is open.
  useEffect(() => {
    if (!open) return
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setLoading(true)
    listDir(dirPath, true, ac.signal)
      .then((all) => {
        const dirs = all.filter((e) => e.isDir)
        const filtered = prefix
          ? dirs.filter((e) => e.name.toLowerCase().startsWith(prefix.toLowerCase()))
          : dirs
        setEntries(filtered)
        setHighlightIdx(-1)
      })
      .catch(() => {
        if (!ac.signal.aborted) setEntries([])
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false)
      })
    return () => ac.abort()
  }, [dirPath, prefix, open])

  // Close dropdown on outside click.
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const selectEntry = useCallback(
    (entry: FsEntry) => {
      const fullPath = entry.name === '/' ? '/' : `${dirPath === '/' ? '' : dirPath}/${entry.name}`
      onChange(fullPath)
      setOpen(false)
      inputRef.current?.focus()
    },
    [dirPath, onChange],
  )

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown' && open && entries.length > 0) {
        e.preventDefault()
        setHighlightIdx((prev) => (prev + 1) % entries.length)
      } else if (e.key === 'ArrowUp' && open && entries.length > 0) {
        e.preventDefault()
        setHighlightIdx((prev) => (prev <= 0 ? entries.length - 1 : prev - 1))
      } else if (e.key === 'Enter' && open && highlightIdx >= 0) {
        e.preventDefault()
        selectEntry(entries[highlightIdx])
      } else if (e.key === 'Escape') {
        setOpen(false)
      }
    },
    [open, entries, highlightIdx, selectEntry],
  )

  return (
    <div ref={wrapperRef} className="relative">
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          onKeyDown(e)
          externalOnKeyDown?.(e)
        }}
        placeholder={placeholder ?? t('session.workPathPlaceholder')}
        className={cn(compact ? 'h-8' : 'h-9', 'text-sm', className)}
        aria-label={t('session.workPath')}
      />
      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-md border bg-bg-secondary shadow-lg">
          <div className="max-h-[240px] overflow-y-auto py-1 text-sm">
            {loading ? (
              <div className="flex items-center gap-2 px-3 py-2 text-text-muted">
                <Loader2 className="size-3.5 animate-spin" />
                <span>{t('common.loading')}</span>
              </div>
            ) : entries.length === 0 ? (
              <div className="px-3 py-2 text-xs text-text-muted">{t('sidebar.noResults')}</div>
            ) : (
              entries.map((entry, idx) => {
                const fullPath =
                  entry.name === '/' ? '/' : `${dirPath === '/' ? '' : dirPath}/${entry.name}`
                return (
                  <button
                    key={fullPath}
                    type="button"
                    onMouseEnter={() => setHighlightIdx(idx)}
                    onClick={() => selectEntry(entry)}
                    className={cn(
                      'flex w-full items-center gap-1.5 px-3 py-1.5 text-left transition-colors hover:bg-bg-tertiary',
                      highlightIdx === idx && 'bg-bg-tertiary',
                    )}
                  >
                    {idx === highlightIdx ? (
                      <ChevronRight className="size-3.5 shrink-0 text-text-muted" />
                    ) : (
                      <span className="size-3.5 shrink-0" />
                    )}
                    <Folder className="size-3.5 shrink-0 text-text-secondary" />
                    <span className="truncate text-text-primary">{entry.name}</span>
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Parse a path input into the directory to list and a name prefix to filter by.
 *
 * Examples:
 *   "/"           → dirPath="/", prefix=""
 *   "/root"       → dirPath="/", prefix="root"
 *   "/root/Code"  → dirPath="/root", prefix="Code"
 *   "/root/Code/" → dirPath="/root/Code", prefix=""
 */
function parseInput(input: string): { dirPath: string; prefix: string } {
  const trimmed = input.trim()
  if (!trimmed) return { dirPath: '/', prefix: '' }

  // If it ends with '/', the whole thing is a directory path.
  if (trimmed.endsWith('/')) {
    const clean = trimmed.replace(/\/+$/, '') || '/'
    return { dirPath: clean, prefix: '' }
  }

  const lastSlash = trimmed.lastIndexOf('/')
  if (lastSlash <= 0) {
    return { dirPath: '/', prefix: trimmed }
  }
  return { dirPath: trimmed.slice(0, lastSlash), prefix: trimmed.slice(lastSlash + 1) }
}
