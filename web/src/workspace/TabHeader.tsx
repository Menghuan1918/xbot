/**
 * TabHeader — custom VSCode-style tab header.
 *
 * Rendered by the dockview `ReactTabRenderer`. Layout: [icon] [title] [close].
 * The close button only appears when `params.closable` is true (agent tabs are
 * not closable) and on hover/focus; the active tab gets a top accent bar.
 *
 * Agent tabs are never closable — middle-click and the close button are both
 * suppressed for `closable=false` tabs.
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

/** Per-tab-type fallback icon (avoids calling a function during render). */
const TYPE_ICONS: Record<PanelParams['type'], IconComponent> = {
  agent: Bot,
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
  const Icon = (params.icon ? ICONS[params.icon] : null) ?? TYPE_ICONS[params.type]

  return (
    <div
      className="group/tab flex h-full min-w-0 items-center gap-1.5 px-3 text-[13px]"
      onMouseDown={(e) => {
        // Left-click activates; middle-click closes (only when closable).
        if (e.button === 1) {
          if (params.closable) {
            e.preventDefault()
            api.close()
          } else {
            // Prevent middle-click from doing anything on non-closable tabs.
            e.preventDefault()
          }
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
