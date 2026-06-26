/**
 * FileExplorer — mock file browser (Spec 6 §3.3).
 *
 * Renders the in-memory mock tree with expand/collapse directories, file-type
 * icons (Lucide), and a click → openTab in the shared workspace. A context menu
 * offers "copy path" and "open in tab". The tree is small (mock), so it renders
 * directly — virtualization (Spec §3.3) only matters at scale and would only
 * add complexity here (KISS).
 *
 * Expand state is keyed by directory path so it survives re-renders.
 */
import { useCallback, useState } from 'react'
import { ChevronRight, ChevronDown, FolderOpen } from 'lucide-react'

import { useI18n } from '@/providers/i18n'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { toast } from 'sonner'
import type { TabManager } from '@/hooks/useTabManager'
import { mockFileTree, type FileNode } from './mockFileTree'
import { FileNodeIcon } from './FileNodeIcon'

interface FileExplorerProps {
  tabManager: TabManager
}

export function FileExplorer({ tabManager }: FileExplorerProps) {
  const { t } = useI18n()
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['/src']))

  const toggle = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  const openFile = useCallback(
    (node: FileNode) => {
      tabManager.openTab({
        type: 'file',
        title: node.name,
        icon: 'file',
        closable: true,
        data: { filePath: node.path, language: node.language },
      })
    },
    [tabManager],
  )

  return (
    <ScrollArea className="h-full">
      <div className="py-1 text-sm">
        {mockFileTree.map((node) => (
          <FileTreeNode
            key={node.path}
            node={node}
            depth={0}
            expanded={expanded}
            onToggleDir={toggle}
            onOpenFile={openFile}
          />
        ))}
        {mockFileTree.length === 0 && (
          <div className="px-3 py-6 text-center text-xs text-text-muted">{t('sidebar.empty')}</div>
        )}
      </div>
    </ScrollArea>
  )
}

interface FileTreeNodeProps {
  node: FileNode
  depth: number
  expanded: Set<string>
  onToggleDir: (path: string) => void
  onOpenFile: (node: FileNode) => void
}

function FileTreeNode({ node, depth, expanded, onToggleDir, onOpenFile }: FileTreeNodeProps) {
  const { t } = useI18n()
  const isOpen = expanded.has(node.path)
  const isDir = node.type === 'directory'

  const row = (
    <button
      type="button"
      onClick={() => (isDir ? onToggleDir(node.path) : onOpenFile(node))}
      className="flex w-full items-center gap-1 py-[3px] pr-2 text-left transition-colors hover:bg-bg-tertiary"
      style={{ paddingLeft: depth * 12 + 4 }}
    >
      {isDir ? (
        <span className="flex size-4 shrink-0 items-center justify-center text-text-muted">
          {isOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </span>
      ) : (
        <span className="size-4 shrink-0" />
      )}
      {isDir ? (
        <FolderOpen className="size-4 shrink-0 text-text-secondary" />
      ) : (
        <FileNodeIcon node={node} />
      )}
      <span className="truncate text-text-primary">{node.name}</span>
    </button>
  )

  return (
    <div>
      <ContextMenu>
        <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={() => onOpenFile(node)}>
            {t('sidebar.openInTab')}
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() => {
              void navigator.clipboard?.writeText(node.path).catch(() => {})
              toast.success(t('sidebar.pathCopied'))
            }}
          >
            {t('sidebar.copyPath')}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {isDir && isOpen && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              onToggleDir={onToggleDir}
              onOpenFile={onOpenFile}
            />
          ))}
        </div>
      )}
    </div>
  )
}
