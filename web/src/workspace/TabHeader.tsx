/**
 * TabHeader — custom VSCode-style tab header (Spec 2 §3.3).
 *
 * Rendered by the dockview `ReactTabRenderer`. Layout: [icon] [title] [close].
 * The close button only appears when `params.closable` is true (agent tabs are
 * not closable) and on hover/focus; the active tab gets a top accent bar.
 *
 * Clicking the tab activates the panel; clicking the close button calls
 * `api.close()`. The dockview bridge also intercepts middle-click close and
 * keyboard shortcuts upstream, so this only handles the visible button.
 */
import { X } from 'lucide-react'
import type { ComponentType, SVGProps } from 'react'
import { Bot, FileText, SquareTerminal } from 'lucide-react'
import type { DockviewPanelApi } from 'dockview'
import type { PanelParams } from '@/types/tab'

/** Lucide icons accept standard SVG props plus an optional `size`. */
type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>

const ICONS: Record<string, IconComponent> = {
  bot: Bot,
  file: FileText,
  terminal: SquareTerminal,
}

export interface TabHeaderProps {
  params: PanelParams
  api: DockviewPanelApi
  /** Whether this tab is the active tab (for the accent bar). */
  isActive: boolean
  /** Click anywhere on the tab body activates it. */
  onActivate: () => void
}

export function TabHeader({ params, api, isActive, onActivate }: TabHeaderProps) {
  const Icon = (params.icon ? ICONS[params.icon] : null) ?? defaultIcon(params.type)

  return (
    <div
      className="group/tab flex h-full min-w-0 items-center gap-1.5 px-3 text-[13px]"
      onMouseDown={(e) => {
        // Left-click activates; middle-click closes (when closable).
        if (e.button === 1 && params.closable) {
          e.preventDefault()
          api.close()
        }
      }}
      onClick={(e) => {
        e.stopPropagation()
        onActivate()
      }}
      role="tab"
      aria-selected={isActive}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onActivate()
        }
      }}
    >
      {/* Active accent bar */}
      <span
        className="pointer-events-none absolute inset-x-0 top-0 h-0.5"
        style={{
          backgroundColor: isActive ? 'var(--accent)' : 'transparent',
        }}
      />
      <Icon className="size-3.5 shrink-0 text-text-secondary" />
      <span
        className="truncate"
        style={{ color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)' }}
      >
        {params.title}
      </span>
      {params.closable && (
        <button
          type="button"
          aria-label="Close tab"
          className="ml-1 flex size-4 shrink-0 items-center justify-center rounded-sm opacity-0 transition-opacity hover:bg-bg-tertiary group-hover/tab:opacity-100 focus-visible:opacity-100 focus-visible:outline-none"
          onClick={(e) => {
            e.stopPropagation()
            api.close()
          }}
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  )
}

function defaultIcon(type: PanelParams['type']): IconComponent {
  switch (type) {
    case 'agent':
      return Bot
    case 'file':
      return FileText
    case 'terminal':
      return SquareTerminal
  }
}
