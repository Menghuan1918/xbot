/**
 * AppShell — the top-level three-pane layout (Spec 2 §3.1, wired in Spec 3).
 *
 * ActivityBar (48px) · LeftSidebar (resizable, hosts the session panel) ·
 * workspace Dockview · RightSidebar (settings). This is the minimal shell
 * that makes the session list reachable; richer resize/collapse polish lands
 * in later specs. KISS: a fixed left width with a toggle is enough to verify
 * Spec 3 acceptance criteria.
 */
import { useState } from 'react'
import { ActivityBar, type SidebarView } from '@/layouts/ActivityBar'
import { SessionSidebar } from '@/components/session/SessionSidebar'
import { RightSidebar } from '@/layouts/RightSidebar'
import { DockviewContainer } from '@/workspace/DockviewContainer'
import { useTabManager } from '@/hooks/useTabManager'
import { useI18n } from '@/providers/i18n'

const LEFT_WIDTH = 260

export function AppShell() {
  const tabManager = useTabManager()
  const { t } = useI18n()
  const [activeView, setActiveView] = useState<SidebarView | null>('sessions')

  const toggleView = (view: SidebarView) => {
    setActiveView((cur) => (cur === view ? null : view))
  }

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-bg-primary text-text-primary">
      <ActivityBar activeView={activeView} onToggleView={toggleView} />

      {activeView === 'sessions' && (
        <div
          className="h-full shrink-0"
          style={{ width: LEFT_WIDTH, borderRight: '1px solid var(--border)' }}
        >
          <SessionSidebar />
        </div>
      )}

      {/* Workspace — always present (Agent tab lives here). */}
      <main className="h-full min-w-0 flex-1">
        <DockviewContainer tabManager={tabManager} />
      </main>

      {activeView === 'settings' && (
        <div
          className="h-full shrink-0"
          style={{ width: LEFT_WIDTH, borderLeft: '1px solid var(--border)' }}
        >
          <RightSidebar />
        </div>
      )}

      {/* 'search' / 'files' views are Spec 6 — keep the workspace visible. */}
      {activeView === 'search' && (
        <div className="sr-only">{t('common.search')}</div>
      )}
      {activeView === 'files' && (
        <div className="sr-only">{t('sidebar.files')}</div>
      )}
    </div>
  )
}
