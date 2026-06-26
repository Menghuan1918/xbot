/**
 * AppShell — three-column workspace shell (Spec 2 §3.2).
 *
 *   ActivityBar (48px) │ LeftSidebar (240px, collapsible) │ Workspace
 *   (Dockview, flex-1) │ RightSidebar (280px, default hidden)
 *
 * This is the minimal Spec 2 layout the panels mount into: view toggling is
 * owned here, the left/right sidebars open on their ActivityBar icon and
 * collapse when the same icon is pressed again (or when the left view has no
 * dedicated sidebar, e.g. settings opens the right column). Resizable drag
 * handles are out of scope for this shell and land with the rich sidebars in
 * Spec 3/6 — widths are fixed here on purpose (KISS).
 *
 * Spec 5 wires an "open example file" entry into the files sidebar so the
 * file panel is exercisable before Spec 6 ships the file browser.
 */
import { useCallback, useState } from 'react'
import { Plus } from 'lucide-react'

import { ActivityBar, type SidebarView } from '@/layouts/ActivityBar'
import { LeftSidebar } from '@/layouts/LeftSidebar'
import { RightSidebar } from '@/layouts/RightSidebar'
import { DockviewContainer } from '@/workspace/DockviewContainer'
import { useTabManager } from '@/hooks/useTabManager'
import { useI18n } from '@/providers/i18n'

const LEFT_WIDTH = 240
const RIGHT_WIDTH = 280

export function AppShell() {
  const tabManager = useTabManager()
  const { t } = useI18n()
  const [activeView, setActiveView] = useState<SidebarView | null>('sessions')

  const onToggleView = useCallback((view: SidebarView) => {
    setActiveView((prev) => (prev === view ? null : view))
  }, [])

  // The left column shows a sidebar for the "content" views; settings opens the
  // right column instead.
  const leftVisible = activeView !== null && activeView !== 'settings'
  const rightVisible = activeView === 'settings'

  const openExample = (filePath: string, title: string) => {
    tabManager.openTab({ type: 'file', title, icon: 'file', closable: true, data: { filePath } })
  }

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-bg-primary text-text-primary">
      <ActivityBar activeView={activeView} onToggleView={onToggleView} />

      {/* Left sidebar */}
      <div
        className="shrink-0 overflow-hidden transition-[width] duration-200"
        style={{ width: leftVisible ? LEFT_WIDTH : 0 }}
      >
        {leftVisible && (
          <LeftSidebar
            view={activeView}
            bodyContent={
              activeView === 'files' ? (
                <ExampleFileList
                  onOpen={openExample}
                  items={[
                    { label: t('file.exampleMd'), path: 'web/example.md', title: 'example.md' },
                    { label: t('file.exampleTs'), path: 'web/example.tsx', title: 'example.tsx' },
                    { label: t('file.exampleGo'), path: 'web/main.go', title: 'main.go' },
                    { label: t('file.exampleImage'), path: 'web/preview.png', title: 'preview.png' },
                  ]}
                />
              ) : undefined
            }
          />
        )}
      </div>

      {/* Workspace */}
      <div className="min-w-0 flex-1">
        <DockviewContainer tabManager={tabManager} />
      </div>

      {/* Right sidebar */}
      <div
        className="shrink-0 overflow-hidden border-l transition-[width] duration-200"
        style={{ width: rightVisible ? RIGHT_WIDTH : 0 }}
      >
        {rightVisible && <RightSidebar />}
      </div>
    </div>
  )
}

function ExampleFileList({
  items,
  onOpen,
}: {
  items: { label: string; path: string; title: string }[]
  onOpen: (path: string, title: string) => void
}) {
  return (
    <div className="flex flex-col gap-1 p-2">
      <p className="px-1 pb-1 text-[11px] uppercase tracking-wide text-text-muted">
        {/* Spec 5 demo entry — Spec 6 replaces this with the real file tree. */}
        Demo
      </p>
      {items.map((it) => (
        <button
          key={it.path}
          type="button"
          onClick={() => onOpen(it.path, it.title)}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
        >
          <Plus className="size-3 shrink-0" />
          <span className="truncate">{it.label}</span>
        </button>
      ))}
    </div>
  )
}
