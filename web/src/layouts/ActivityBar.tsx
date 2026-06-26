/**
 * ActivityBar — the leftmost 48px icon column (Spec 2 §3.2, VSCode-style).
 *
 * Icons: sessions, search, files, settings, theme toggle. Clicking a view
 * icon toggles its sidebar (collapses if already open). This is the only
 * navigation surface; the left/right sidebars are the views themselves.
 *
 * Pure presentational — AppShell owns which view is active and passes setters.
 */
import {
  MessageSquare,
  Search,
  FileText,
  Settings,
  Moon,
  Sun,
} from 'lucide-react'
import type { ComponentType, SVGProps } from 'react'
import { useI18n } from '@/providers/i18n'
import { useTheme } from '@/hooks/useTheme'
import type { Theme } from '@/types/shared'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>

export type SidebarView = 'sessions' | 'search' | 'files' | 'settings'

interface ActivityBarProps {
  /** Currently active view (null = no sidebar open). */
  activeView: SidebarView | null
  /** Toggle a view's sidebar; same view again collapses it. */
  onToggleView: (view: SidebarView) => void
}

const VIEWS: { view: SidebarView; icon: IconComponent }[] = [
  { view: 'sessions', icon: MessageSquare },
  { view: 'search', icon: Search },
  { view: 'files', icon: FileText },
]

export function ActivityBar({ activeView, onToggleView }: ActivityBarProps) {
  const { t } = useI18n()
  const { theme, setTheme } = useTheme()

  return (
    <div className="flex h-full w-12 shrink-0 flex-col items-center justify-between border-r bg-bg-secondary py-2">
      <nav className="flex flex-col items-center gap-1">
        {VIEWS.map(({ view, icon: Icon }) => {
          const active = activeView === view
          return (
            <Tooltip key={view}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={labelFor(view, t)}
                  aria-pressed={active}
                  onClick={() => onToggleView(view)}
                  className="group relative flex size-9 items-center justify-center rounded-md transition-colors hover:bg-bg-tertiary"
                  style={{ color: active ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                >
                  {/* active accent bar (left edge) */}
                  <span
                    className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r"
                    style={{ backgroundColor: active ? 'var(--accent)' : 'transparent' }}
                  />
                  <Icon className="size-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">{labelFor(view, t)}</TooltipContent>
            </Tooltip>
          )
        })}
      </nav>

      <div className="flex flex-col items-center gap-1">
        {/* Theme toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={t(`settings.${theme}`)}
              onClick={() => setTheme(theme === 'dark' ? 'light' : ('dark' as Theme))}
              className="flex size-9 items-center justify-center rounded-md transition-colors hover:bg-bg-tertiary"
              style={{ color: 'var(--text-secondary)' }}
            >
              {theme === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">{t(`settings.${theme}`)}</TooltipContent>
        </Tooltip>

        {/* Settings (opens the right sidebar settings view) */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={t('settings.appearance')}
              aria-pressed={activeView === 'settings'}
              onClick={() => onToggleView('settings')}
              className="flex size-9 items-center justify-center rounded-md transition-colors hover:bg-bg-tertiary"
              style={{ color: activeView === 'settings' ? 'var(--text-primary)' : 'var(--text-secondary)' }}
            >
              <Settings className="size-5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">{t('settings.appearance')}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}

function labelFor(view: SidebarView, t: (k: string) => string): string {
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
