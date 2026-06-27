/**
 * PathPicker — Remote-picker style path selector with autocomplete.
 *
 * Features:
 *   - Input field showing the current path value
 *   - Debounced (300ms) autocomplete of subdirectories using GET /api/fs/list
 *   - Popover dropdown with clickable candidates
 *   - Keyboard navigation: ↑/↓ to move, Enter to select, Esc to close
 *   - Starts from `/` — typing shows matching subdirs of the parent path
 *
 * The autocomplete works by:
 *   1. Parsing the current input to find the "directory part" (everything up
 *      to the last `/`) and the "prefix" (after the last `/`).
 *   2. Listing that directory's entries (dirs only).
 *   3. Filtering entries whose name starts with the prefix.
 *
 * If the input is a valid directory path (ends with `/`), all subdirs are shown
 * without prefix filtering.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronRight, Folder, Loader2 } from 'lucide-react'

import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
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
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const debouncedValue = useDebounce(value, DEBOUNCE_MS)

  // Parse the input into a directory to list and a prefix to filter by.
  const { dirPath, prefix } = parseInput(debouncedValue)

  // Fetch subdirectories when the debounced value changes.
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
        // Ignore aborted requests and network errors.
        if (!ac.signal.aborted) setEntries([])
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false)
      })
    return () => ac.abort()
  }, [dirPath, prefix, open])

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
      if (!open || entries.length === 0) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightIdx((prev) => (prev + 1) % entries.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightIdx((prev) => (prev <= 0 ? entries.length - 1 : prev - 1))
      } else if (e.key === 'Enter' && highlightIdx >= 0) {
        e.preventDefault()
        selectEntry(entries[highlightIdx])
      } else if (e.key === 'Escape') {
        setOpen(false)
      }
    },
    [open, entries, highlightIdx, selectEntry],
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
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
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={2}
        className="w-[var(--radix-popover-trigger-width)] min-w-[200px] p-0"
      >
        <ScrollArea className="max-h-[240px]">
          <div className="py-1 text-sm">
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
        </ScrollArea>
      </PopoverContent>
    </Popover>
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
    // Remove trailing slashes (except for root).
    const cleaned = trimmed.replace(/\/+$/, '') || '/'
    return { dirPath: cleaned, prefix: '' }
  }

  const lastSlash = trimmed.lastIndexOf('/')
  if (lastSlash <= 0) {
    return { dirPath: '/', prefix: trimmed }
  }
  return {
    dirPath: trimmed.slice(0, lastSlash),
    prefix: trimmed.slice(lastSlash + 1),
  }
}
