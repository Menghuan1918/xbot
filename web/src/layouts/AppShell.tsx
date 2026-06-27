/**
 * AppShell — unified three-column layout (Spec 2 + Spec 4 + Spec 6 + Spec 7).
 *
 *   ActivityBar (48px) · SessionSidebar (260px, collapsible) ·
 *   Dockview workspace (flex-1) · RightSidebar (0–280px, animated, collapsible) ·
 *   RightActivityBar (48px)
 *
 * The left ActivityBar owns session-list toggle + theme + settings. Settings opens
 * a SettingsDialog Sheet (Spec 7) — NOT a sidebar view. The right sidebar hosts
 * file browser / search / diff / session config panels, each switchable via its
 * own RightActivityBar (Spec 6).
 */
import { useCallback, useState } from 'react'

import { ActivityBar, type SidebarView } from '@/layouts/ActivityBar'
import { SessionSidebar } from '@/components/session/SessionSidebar'
import { RightSidebar, type SidebarPanel } from '@/components/sidebar/RightSidebar'
import { RightActivityBar } from '@/components/sidebar/RightActivityBar'
import { SettingsDialog } from '@/components/settings/SettingsDialog'
import { DockviewContainer } from '@/workspace/DockviewContainer'
import { useTabManager } from '@/hooks/useTabManager'
import { useTerminal } from '@/hooks/useTerminal'

const LEFT_WIDTH = 260

export function AppShell() {
  const tabManager = useTabManager()
  const terminal = useTerminal(tabManager)
  const [activeView, setActiveView] = useState<SidebarView | null>('sessions')
  const [activePanel, setActivePanel] = useState<SidebarPanel | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const toggleView = useCallback((view: SidebarView) => {
    setActiveView((cur) => (cur === view ? null : view))
  }, [])

  const togglePanel = useCallback((panel: SidebarPanel) => {
    setActivePanel((cur) => (cur === panel ? null : panel))
  }, [])

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-bg-primary text-text-primary">
      {/* Left ActivityBar */}
      <ActivityBar
        activeView={activeView}
        onToggleView={toggleView}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {/* Left sidebar — session list */}
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

      {/* Right sidebar — animated expand/collapse (Spec 6). */}
      <RightSidebar
        activePanel={activePanel}
        onPanelChange={setActivePanel}
        tabManager={tabManager}
        terminalManager={terminal}
      />

      {/* Right ActivityBar — always visible, toggles right panels. */}
      <RightActivityBar activePanel={activePanel} onTogglePanel={togglePanel} />

      {/* Settings dialog — slides in from the right (Spec 7 Sheet). */}
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  )
}
