/**
 * FileSearch — real file search backed by GET /api/fs/search (Spec §3.4).
 *
 * Features:
 *   - Debounced (200ms) search using the real backend search endpoint
 *   - Searches from the session CWD (via CwdProvider)
 *   - Click a file → openTab in the workspace
 *   - Click a directory → switch to the file browser panel (if onPanelChange provided)
 *   - Match highlighting on the file name
 *   - Loading / empty / no-results states
 */
import { useCallback, useEffect, useState } from 'react'
import { Search, X, Loader2, Folder } from 'lucide-react'

import { useI18n } from '@/providers/i18n'
import { useCwd } from '@/hooks/useCwd'
import { useDebounce } from '@/hooks/useDebounce'
import { searchFiles, type FsSearchEntry } from '@/hooks/useFileSystem'
import { languageOf } from '@/components/file/fileTypes'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { TabManager } from '@/hooks/useTabManager'
import { FileNodeIcon } from './FileNodeIcon'
import type { SidebarPanel } from './RightSidebar'

interface FileSearchProps {
  tabManager: TabManager
  /** Switch to another sidebar panel (e.g. clicking a dir → files). */
  onPanelChange?: (panel: SidebarPanel | null) => void
}

const DEBOUNCE_MS = 200

export function FileSearch({ tabManager, onPanelChange }: FileSearchProps) {
  const { t } = useI18n()
  const { cwd } = useCwd()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<FsSearchEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const debounced = useDebounce(query, DEBOUNCE_MS)
  const searchRoot = cwd ?? '/'

  // Trigger search when the debounced query changes.
  useEffect(() => {
    const q = debounced.trim()
    if (!q) {
      setResults([])
      setLoading(false)
      setError(null)
      return
    }
    const ac = new AbortController()
    setLoading(true)
    setError(null)
    searchFiles(q, searchRoot, 50, ac.signal)
      .then((res) => {
        setResults(res)
      })
      .catch((e) => {
        if (!ac.signal.aborted) {
          setError(e instanceof Error ? e.message : 'Search failed')
          setResults([])
        }
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false)
      })
    return () => ac.abort()
  }, [debounced, searchRoot])

  const openFile = useCallback(
    (entry: FsSearchEntry) => {
      tabManager.openTab({
        type: 'file',
        title: entry.name,
        icon: 'file',
        closable: true,
        data: { filePath: entry.path, language: languageOf(entry.name) },
      })
    },
    [tabManager],
  )

  const handleClick = useCallback(
    (entry: FsSearchEntry) => {
      if (entry.isDir) {
        // Navigate to file browser panel.
        onPanelChange?.('files')
      } else {
        openFile(entry)
      }
    },
    [openFile, onPanelChange],
  )

  return (
    <div className="flex h-full flex-col">
      <div className="relative px-2 py-2">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-3.5 -translate-y-1/2 text-text-muted" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('sidebar.searchPlaceholder')}
          className="h-7 pl-8 pr-7 text-xs"
          aria-label={t('sidebar.search')}
          autoFocus
        />
        {query && (
          <button
            type="button"
            aria-label={t('common.close')}
            onClick={() => setQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {loading ? (
          <div className="flex items-center gap-2 px-3 py-4 text-text-muted">
            <Loader2 className="size-3.5 animate-spin" />
            <span className="text-xs">{t('common.loading')}</span>
          </div>
        ) : error ? (
          <div className="px-3 py-4 text-center text-xs text-red-400">{error}</div>
        ) : debounced.trim() === '' ? (
          <div className="px-3 py-6 text-center text-xs text-text-muted">
            {t('sidebar.searchHint')}
          </div>
        ) : results.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-text-muted">
            {t('sidebar.noResults')}
          </div>
        ) : (
          <ul className="py-1 text-sm">
            {results.map((entry) => (
              <li key={entry.path}>
                <button
                  type="button"
                  onClick={() => handleClick(entry)}
                  className="flex w-full flex-col items-start gap-0.5 px-3 py-1.5 text-left transition-colors hover:bg-bg-tertiary"
                >
                  <span className="flex items-center gap-1.5">
                    {entry.isDir ? (
                      <Folder className="size-3.5 shrink-0 text-text-secondary" />
                    ) : (
                      <FileNodeIcon
                        fileName={entry.name}
                        className="size-3.5 shrink-0 text-text-secondary"
                      />
                    )}
                    <span className="truncate text-text-primary">
                      {highlight(entry.name, debounced)}
                    </span>
                  </span>
                  <span className="truncate pl-5 text-[11px] text-text-muted">
                    {highlight(relativePath(entry.path, searchRoot), debounced)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>
    </div>
  )
}

/** Highlight the first case-insensitive match of `query` in `text`. */
function highlight(text: string, query: string) {
  const q = query.trim()
  if (!q) return text
  const idx = text.toLowerCase().indexOf(q.toLowerCase())
  if (idx < 0) return text
  const before = text.slice(0, idx)
  const match = text.slice(idx, idx + q.length)
  const after = text.slice(idx + q.length)
  return (
    <>
      {before}
      <mark className="rounded-sm bg-app-accent/30 text-text-primary">{match}</mark>
      {after}
    </>
  )
}

/** Make an absolute path relative to the search root for display. */
function relativePath(fullPath: string, root: string): string {
  if (root === '/') return fullPath
  if (fullPath.startsWith(root)) {
    const rel = fullPath.slice(root.length)
    return rel.startsWith('/') ? rel : `/${rel}`
  }
  return fullPath
}
