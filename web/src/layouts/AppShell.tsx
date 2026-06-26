/**
 * AppShell — three-column layout (Spec 2 §3.2, filled in by Spec 6).
 *
 *   ┌─────────────────────────────────────────────────────────┐
 *   │ ActivityBar │ LeftSidebar │ Workspace │ RightActivityBar │ RightSidebar │
 *   └─────────────────────────────────────────────────────────┘
 *
 * Left side (ActivityBar + LeftSidebar + theme/settings) is the Spec 2/3
 * surface and stays a placeholder here. The right side is the Spec 6 surface:
 * a thin icon column (RightActivityBar) toggles the four right-sidebar panels
 * (files / search / diff / config); the RightSidebar container owns collapse,
 * width, and the Framer Motion panel transition.
 *
 * The workspace (Dockview) is always mounted so file-click → openTab works
 * even before Spec 5 ships the Monaco editor (FilePanel is still a placeholder).
 */
import { useCallback, useState } from 'react'

import { ActivityBar } from '@/layouts/ActivityBar'
import { LeftSidebar } from '@/layouts/LeftSidebar'
import { RightSidebar, type SidebarPanel } from '@/components/sidebar/RightSidebar'
import { RightActivityBar } from '@/components/sidebar/RightActivityBar'
import { DockviewContainer } from '@/workspace/DockviewContainer'
import { useTabManager } from '@/hooks/useTabManager'
import type { SidebarView } from '@/layouts/ActivityBar'

export function AppShell() {
  // Left sidebar (Spec 3 owns the real view); keep a minimal toggle so the
  // ActivityBar is functional. Null = collapsed.
  const [leftView, setLeftView] = useState<SidebarView | null>(null)

  // Right sidebar panel (Spec 6). Null = collapsed.
  const [rightPanel, setRightPanel] = useState<SidebarPanel | null>(null)

  // The tab manager is owned here so both the workspace and the sidebar file
  // browser share one Dockview instance (file-click → openTab → same tabs).
  const tabManager = useTabManager()

  const onToggleLeftView = useCallback((view: SidebarView) => {
    setLeftView((prev) => (prev === view ? null : view))
  }, [])

  const onToggleRightPanel = useCallback((panel: SidebarPanel) => {
    setRightPanel((prev) => (prev === panel ? null : panel))
  }, [])

  return (
    <div className="flex h-full w-full overflow-hidden bg-background">
      <ActivityBar activeView={leftView} onToggleView={onToggleLeftView} />
      {leftView && (
        <aside className="h-full w-60 shrink-0 border-r bg-bg-secondary">
          <LeftSidebar view={leftView} />
        </aside>
      )}
      <main className="flex min-w-0 flex-1">
        <DockviewContainer tabManager={tabManager} />
      </main>
      <RightActivityBar activePanel={rightPanel} onTogglePanel={onToggleRightPanel} />
      <RightSidebar
        activePanel={rightPanel}
        onPanelChange={setRightPanel}
        tabManager={tabManager}
      />
    </div>
  )
}
