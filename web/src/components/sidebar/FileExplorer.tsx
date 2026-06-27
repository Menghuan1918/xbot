/**
 * FileExplorer — real file browser backed by GET /api/fs/list (Spec §3.3).
 *
 * Features:
 *   - Lazy-loads directory entries on expand (not upfront)
 *   - Follows the session CWD (via CwdProvider) as the root directory
 *   - Toolbar: hidden-files toggle, refresh button
 *   - Directory listings cached 30s (see useFileSystem.listDir)
 *   - Double-click (or single-click) a file → openTab in the workspace
 *   - Context menu: open in tab, copy path
 *   - Loading / error / empty states
 */
import { useCallback, useEffect, useState } from 'react'
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  Loader2,
  RefreshCw,
  Eye,
  EyeOff,
  Home,
} from 'lucide-react'

import { useI18n } from '@/providers/i18n'
import { useCwd } from '@/hooks/useCwd'
import { listDir, type FsEntry } from '@/hooks/useFileSystem'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { toast } from 'sonner'
import type { TabManager } from '@/hooks/useTabManager'
import { FileNodeIcon } from './FileNodeIcon'
import { languageOf } from '@/components/file/fileTypes'
import { cn } from '@/lib/utils'

interface FileExplorerProps {
  tabManager: TabManager
}

export function FileExplorer({ tabManager }: FileExplorerProps) {
  const { t } = useI18n()
  const { cwd } = useCwd()
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [showHidden, setShowHidden] = useState(false)
  // path → entries map (in-memory; backed by the 30s cache in useFileSystem)
  const [dirCache, setDirCache] = useState<Map<string, FsEntry[]>>(() => new Map())
  const [loadingDirs, setLoadingDirs] = useState<Set<string>>(() => new Set())
  const [error, setError] = useState<string | null>(null)

  // Reset when CWD changes.
  useEffect(() => {
    setExpanded(new Set())
    setDirCache(new Map())
    setError(null)
  }, [cwd])

  const rootDir = cwd ?? '/'

  const toggleDir = useCallback(
    async (path: string) => {
      setExpanded((prev) => {
        const next = new Set(prev)
        if (next.has(path)) {
          next.delete(path)
        } else {
          next.add(path)
        }
        return next
      })

      // Lazy-load: fetch entries if not yet cached.
      if (!dirCache.has(path) && !loadingDirs.has(path)) {
        setLoadingDirs((prev) => new Set(prev).add(path))
        setError(null)
        try {
          const entries = await listDir(path, showHidden)
          setDirCache((prev) => new Map(prev).set(path, entries))
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Failed to load directory')
        } finally {
          setLoadingDirs((prev) => {
            const next = new Set(prev)
            next.delete(path)
            return next
          })
        }
      }
    },
    [dirCache, loadingDirs, showHidden],
  )

  const refreshDir = useCallback(
    async (path: string) => {
      setLoadingDirs((prev) => new Set(prev).add(path))
      setError(null)
      try {
        // Force re-fetch by bypassing cache — we can't easily evict a single key,
        // so we use a cache-busting timestamp param.
        const params = new URLSearchParams({
          path,
          showHidden: String(showHidden),
          _t: String(Date.now()),
        })
        const res = await fetch(`/api/fs/list?${params}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as { entries: FsEntry[] }
        const entries = (data.entries || []).sort((a, b) => {
          if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
          return a.name.localeCompare(b.name)
        })
        setDirCache((prev) => new Map(prev).set(path, entries))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to refresh')
      } finally {
        setLoadingDirs((prev) => {
          const next = new Set(prev)
          next.delete(path)
          return next
        })
      }
    },
    [showHidden],
  )

  // Clear cache and reload when showHidden toggles.
  useEffect(() => {
    setDirCache(new Map())
    void toggleDir(rootDir)
  }, [showHidden]) // eslint-disable-line react-hooks/exhaustive-deps

  // Ensure root is loaded.
  const rootLoaded = dirCache.has(rootDir)
  useEffect(() => {
    if (!rootLoaded && !loadingDirs.has(rootDir) && cwd) {
      void toggleDir(rootDir)
    }
  }, [rootLoaded, rootDir, cwd, loadingDirs, toggleDir])

  const openFile = useCallback(
    (entry: FsEntry, dirPath: string) => {
      const filePath = entry.isDir
        ? ''
        : joinPath(dirPath, entry.name)
      if (!filePath) return
      tabManager.openTab({
        type: 'file',
        title: entry.name,
        icon: 'file',
        closable: true,
        data: { filePath, language: languageOf(entry.name) },
      })
    },
    [tabManager],
  )

  const rootEntries = dirCache.get(rootDir) || []
  const isRootLoading = loadingDirs.has(rootDir)

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex h-7 shrink-0 items-center gap-1 border-b px-2">
        <button
          type="button"
          onClick={() => void refreshDir(rootDir)}
          className="flex size-5 items-center justify-center rounded text-text-muted transition-colors hover:bg-bg-tertiary hover:text-text-primary"
          aria-label="Refresh"
          title={t('sidebar.refresh')}
        >
          <RefreshCw className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setShowHidden((v) => !v)}
          className={cn(
            'flex size-5 items-center justify-center rounded transition-colors hover:bg-bg-tertiary',
            showHidden ? 'text-app-accent' : 'text-text-muted hover:text-text-primary',
          )}
          aria-label="Toggle hidden files"
          title={t('sidebar.toggleHidden')}
        >
          {showHidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
        </button>
        <div className="flex min-w-0 items-center gap-1 pl-1 text-[11px] text-text-muted">
          <Home className="size-3 shrink-0" />
          <span className="truncate" title={rootDir}>
            {rootDir}
          </span>
        </div>
      </div>

      {/* Tree */}
      <ScrollArea className="min-h-0 flex-1">
        <div className="py-1 text-sm">
          {isRootLoading && rootEntries.length === 0 ? (
            <div className="flex items-center gap-2 px-3 py-4 text-text-muted">
              <Loader2 className="size-3.5 animate-spin" />
              <span className="text-xs">{t('common.loading')}</span>
            </div>
          ) : error ? (
            <div className="px-3 py-4 text-center text-xs text-red-400">{error}</div>
          ) : rootEntries.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-text-muted">{t('sidebar.empty')}</div>
          ) : (
            rootEntries.map((entry) => (
              <FileTreeNode
                key={entry.name}
                entry={entry}
                dirPath={rootDir}
                depth={0}
                expanded={expanded}
                showHidden={showHidden}
                dirCache={dirCache}
                loadingDirs={loadingDirs}
                onToggleDir={toggleDir}
                onOpenFile={openFile}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

interface FileTreeNodeProps {
  entry: FsEntry
  dirPath: string
  depth: number
  expanded: Set<string>
  showHidden: boolean
  dirCache: Map<string, FsEntry[]>
  loadingDirs: Set<string>
  onToggleDir: (path: string) => void
  onOpenFile: (entry: FsEntry, dirPath: string) => void
}

function FileTreeNode({
  entry,
  dirPath,
  depth,
  expanded,
  showHidden,
  dirCache,
  loadingDirs,
  onToggleDir,
  onOpenFile,
}: FileTreeNodeProps) {
  const { t } = useI18n()
  const fullPath = joinPath(dirPath, entry.name)
  const isOpen = expanded.has(fullPath)
  const isDir = entry.isDir
  const children = isDir ? dirCache.get(fullPath) : undefined
  const isLoading = loadingDirs.has(fullPath)

  const handleClick = useCallback(() => {
    if (isDir) {
      void onToggleDir(fullPath)
    } else {
      onOpenFile(entry, dirPath)
    }
  }, [isDir, onToggleDir, fullPath, onOpenFile, entry, dirPath])

  const row = (
    <button
      type="button"
      onClick={handleClick}
      onDoubleClick={() => !isDir && onOpenFile(entry, dirPath)}
      className="flex w-full items-center gap-1 py-[3px] pr-2 text-left transition-colors hover:bg-bg-tertiary"
      style={{ paddingLeft: depth * 12 + 4 }}
    >
      {isDir ? (
        <span className="flex size-4 shrink-0 items-center justify-center text-text-muted">
          {isLoading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : isOpen ? (
            <ChevronDown className="size-3.5" />
          ) : (
            <ChevronRight className="size-3.5" />
          )}
        </span>
      ) : (
        <span className="size-4 shrink-0" />
      )}
      {isDir ? (
        isOpen ? (
          <FolderOpen className="size-4 shrink-0 text-text-secondary" />
        ) : (
          <Folder className="size-4 shrink-0 text-text-secondary" />
        )
      ) : (
        <FileNodeIcon fileName={entry.name} />
      )}
      <span className="truncate text-text-primary">{entry.name}</span>
    </button>
  )

  return (
    <div>
      <ContextMenu>
        <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
        <ContextMenuContent>
          {!isDir && (
            <ContextMenuItem onSelect={() => onOpenFile(entry, dirPath)}>
              {t('sidebar.openInTab')}
            </ContextMenuItem>
          )}
          <ContextMenuItem
            onSelect={() => {
              void navigator.clipboard?.writeText(fullPath).catch(() => {})
              toast.success(t('sidebar.pathCopied'))
            }}
          >
            {t('sidebar.copyPath')}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {isDir && isOpen && children && (
        <div>
          {children.map((child) => (
            <FileTreeNode
              key={child.name}
              entry={child}
              dirPath={fullPath}
              depth={depth + 1}
              expanded={expanded}
              showHidden={showHidden}
              dirCache={dirCache}
              loadingDirs={loadingDirs}
              onToggleDir={onToggleDir}
              onOpenFile={onOpenFile}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/** Join path segments safely (local helper to avoid circular import). */
function joinPath(base: string, name: string): string {
  if (base.endsWith('/')) return `${base}${name}`
  return `${base}/${name}`
}
