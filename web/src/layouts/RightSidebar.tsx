/**
 * RightSidebar — right panel container (Spec 2 §3.2).
 *
 * Shell only; the real file browser / diff / session config land in Spec 6 and
 * the settings panel in Spec 7. Width is controlled by AppShell.
 */
import type { ReactNode } from 'react'
import { useI18n } from '@/providers/i18n'

interface RightSidebarProps {
  title?: string
  children?: ReactNode
}

export function RightSidebar({ title, children }: RightSidebarProps) {
  const { t } = useI18n()
  return (
    <aside className="flex h-full w-full flex-col bg-bg-secondary">
      <header className="flex h-9 shrink-0 items-center px-3 text-xs font-semibold uppercase tracking-wide text-text-secondary">
        <span>{title ?? t('settings.appearance')}</span>
      </header>
      <div className="flex flex-1 items-center justify-center text-sm text-text-muted">
        {children ?? <span>{`${t('settings.appearance')} — Spec 7`}</span>}
      </div>
    </aside>
  )
}
