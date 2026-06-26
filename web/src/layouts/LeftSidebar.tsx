/**
 * LeftSidebar — left session sidebar container (Spec 2 §3.2).
 *
 * Shell only; the real session list, search and file tree land in Spec 3/6.
 * Width is controlled by AppShell (resizable + collapsible); this component
 * just fills its allotted space with a header + placeholder body so the
 * layout is exercisable now.
 */
import type { ReactNode } from 'react'
import { useI18n } from '@/providers/i18n'
import type { SidebarView } from '@/layouts/ActivityBar'

interface LeftSidebarProps {
  view: SidebarView
  /** Optional header actions rendered on the right of the title bar. */
  children?: ReactNode
}

export function LeftSidebar({ view, children }: LeftSidebarProps) {
  const { t } = useI18n()
  const title = titleFor(view, t)
  return (
    <aside className="flex h-full w-full flex-col bg-bg-secondary">
      <header className="flex h-9 shrink-0 items-center justify-between px-3 text-xs font-semibold uppercase tracking-wide text-text-secondary">
        <span>{title}</span>
        {children}
      </header>
      <div className="flex flex-1 items-center justify-center text-sm text-text-muted">
        <Placeholder view={view} />
      </div>
    </aside>
  )
}

function Placeholder({ view }: { view: SidebarView }) {
  const { t } = useI18n()
  switch (view) {
    case 'sessions':
      return <span>{`${t('sidebar.sessions')} — Spec 3`}</span>
    case 'search':
      return <span>{`${t('common.search')} — Spec 6`}</span>
    case 'files':
      return <span>{`${t('sidebar.files')} — Spec 6`}</span>
    case 'settings':
      return null
  }
}

function titleFor(view: SidebarView, t: (k: string) => string): string {
  switch (view) {
    case 'sessions':
      return t('sidebar.sessions')
    case 'search':
      return t('common.search')
    case 'files':
      return t('sidebar.files')
    case 'settings':
      return t('settings.appearance')
  }
}
