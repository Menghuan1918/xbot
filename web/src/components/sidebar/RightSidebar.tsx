/**
 * RightSidebar — the right panel container (Spec 6 §3.2), replacing Spec 2's
 * empty shell.
 *
 * VSCode-style right sidebar:
 *   - collapsed by default (activePanel === null ⇒ not rendered; the right
 *     ActivityBar column stays)
 *   - selecting a panel expands to 280px
 *   - a drag handle resizes between 200–500px
 *   - panels cross-fade via Framer Motion AnimatePresence
 *
 * The container is a pure layout/animation shell; each panel is its own
 * component (FileExplorer, FileSearch, DiffViewer, SessionConfig). The shared
 * tabManager is passed down so the file browser/search can open file tabs in
 * the same Dockview instance.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

import { useI18n } from '@/providers/i18n'
import { FileExplorer } from './FileExplorer'
import { FileSearch } from './FileSearch'
import { DiffViewer } from './DiffViewer'
import { SessionConfig } from './SessionConfig'
import { TerminalList } from './TerminalList'
import type { TabManager } from '@/hooks/useTabManager'
import type { TerminalManager } from '@/hooks/useTerminal'

export type SidebarPanel = 'files' | 'search' | 'diff' | 'config' | 'terminal'

export interface RightSidebarProps {
  activePanel: SidebarPanel | null
  onPanelChange: (panel: SidebarPanel | null) => void
  tabManager: TabManager
  terminalManager: TerminalManager
}

const DEFAULT_WIDTH = 280
const MIN_WIDTH = 200
const MAX_WIDTH = 500

export function RightSidebar({ activePanel, onPanelChange, tabManager, terminalManager }: RightSidebarProps) {
  const { t } = useI18n()
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const dragging = useRef(false)

  // Pointer-based resize: hold the handle, move the pointer, clamp to bounds.
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    dragging.current = true
    document.body.style.userSelect = 'none'
  }, [])

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return
      // Sidebar is on the right edge; width grows as the pointer moves left.
      const right = window.innerWidth - e.clientX
      const next = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, right))
      setWidth(Math.round(next))
    }
    const onUp = () => {
      if (!dragging.current) return
      dragging.current = false
      document.body.style.userSelect = ''
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [])

  // The aside is always mounted; it animates width between 0 (collapsed) and
  // `width` (expanded) so collapse/expand is smooth, not instant. Content is
  // rendered only while expanded to avoid offscreen work and stale panels.
  const targetWidth = activePanel === null ? 0 : width
  const panel = activePanel

  return (
    <motion.aside
      initial={false}
      animate={{ width: targetWidth, opacity: activePanel === null ? 0 : 1 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className="relative flex h-full shrink-0 flex-col overflow-hidden bg-bg-secondary"
      style={{ borderLeftWidth: activePanel === null ? 0 : 1, borderLeftStyle: 'solid', borderLeftColor: 'var(--border)' }}
    >
      {panel !== null && (
        <>
          <header className="flex h-9 shrink-0 items-center justify-between pl-3 pr-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
            <span className="truncate">{titleFor(panel, t)}</span>
          </header>

          {/* Panel content cross-fade keyed on the active panel. */}
          <div className="relative min-h-0 flex-1">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={panel}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.15 }}
                className="h-full"
              >
                {renderPanel(panel, tabManager, terminalManager, onPanelChange)}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Drag handle to resize the sidebar (left edge). */}
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label={t('sidebar.resizeLabel')}
            onPointerDown={onPointerDown}
            className="absolute left-0 top-0 h-full w-1 cursor-col-resize bg-transparent transition-colors hover:bg-app-accent/40"
          />
        </>
      )}
    </motion.aside>
  )
}

function renderPanel(
  panel: SidebarPanel,
  tabManager: TabManager,
  terminalManager: TerminalManager,
  onPanelChange: (panel: SidebarPanel | null) => void,
) {
  switch (panel) {
    case 'files':
      return <FileExplorer tabManager={tabManager} />
    case 'search':
      return <FileSearch tabManager={tabManager} />
    case 'diff':
      return <DiffViewer />
    case 'config':
      return <SessionConfig onPanelChange={onPanelChange} />
    case 'terminal':
      return <TerminalList terminalManager={terminalManager} />
  }
}

function titleFor(panel: SidebarPanel, t: (k: string) => string): string {
  switch (panel) {
    case 'files':
      return t('sidebar.files')
    case 'search':
      return t('sidebar.search')
    case 'diff':
      return t('sidebar.diff')
    case 'config':
      return t('sidebar.config')
    case 'terminal':
      return t('sidebar.terminal')
  }
}
