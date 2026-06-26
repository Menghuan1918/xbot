/**
 * AppShell — VSCode-style three-column layout (Spec 2 §3.2, wired in Spec 4).
 *
 * ActivityBar (48px) + collapsible LeftSidebar (sessions/search/files) + the
 * Dockview workspace + a collapsible RightSidebar (settings). The shell owns
 * which sidebar view is active; the panels themselves are presentational.
 *
 * The settings view hosts a collapse-level control so Spec 4's collapse
 * preference (§3.10) is adjustable now; the full settings panel lands in Spec 7.
 */
import { useCallback, useState } from 'react'

import { ActivityBar, type SidebarView } from '@/layouts/ActivityBar'
import { LeftSidebar } from '@/layouts/LeftSidebar'
import { RightSidebar } from '@/layouts/RightSidebar'
import { DockviewContainer } from '@/workspace/DockviewContainer'
import { useTabManager } from '@/hooks/useTabManager'
import { useCollapseLevel } from '@/hooks/useCollapseLevel'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useI18n } from '@/providers/i18n'
import { COLLAPSE_LEVELS, type CollapseLevel } from '@/types/agent'

/** Collapse-level control rendered inside the settings right sidebar. */
function CollapseLevelControl() {
  const { t } = useI18n()
  const { level, setLevel } = useCollapseLevel()
  return (
    <div className="flex flex-col gap-2 p-3">
      <label className="text-xs text-text-secondary">{t('settings.collapseProcess')}</label>
      <Select value={level} onValueChange={(v) => setLevel(v as CollapseLevel)}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {COLLAPSE_LEVELS.map((lvl) => (
            <SelectItem key={lvl} value={lvl}>
              {collapseLabel(lvl, t)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function collapseLabel(lvl: CollapseLevel, t: (k: string) => string): string {
  switch (lvl) {
    case 'all':
      return t('settings.collapseAll')
    case 'minimal':
      return t('settings.collapseMinimal')
    case 'none':
      return t('settings.collapseNone')
  }
}

export function AppShell() {
  const tabManager = useTabManager()
  const [activeView, setActiveView] = useState<SidebarView | null>('sessions')

  // The settings icon opens a right sidebar instead of a left view.
  const settingsOpen = activeView === 'settings'

  const onToggleView = useCallback((view: SidebarView) => {
    setActiveView((cur) => (cur === view ? null : view))
  }, [])

  return (
    <div className="flex h-dvh w-dvw overflow-hidden bg-bg-primary text-text-primary">
      <ActivityBar activeView={activeView} onToggleView={onToggleView} />

      {activeView !== null && !settingsOpen && (
        <div className="w-64 shrink-0 border-r border-border">
          <LeftSidebar view={activeView} />
        </div>
      )}

      <main className="min-w-0 flex-1">
        <DockviewContainer tabManager={tabManager} />
      </main>

      {settingsOpen && (
        <div className="w-72 shrink-0 border-l border-border">
          <RightSidebar>
            <CollapseLevelControl />
          </RightSidebar>
        </div>
      )}
    </div>
  )
}
