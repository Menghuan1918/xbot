/**
 * TabHeader — custom VSCode-style tab header.
 *
 * Rendered by the dockview `ReactTabRenderer`. Layout: [icon] [title] [close].
 *
 * Styling:
 *   - Active tab: top accent bar (h-0.5) + brighter text color + bg-bg-primary
 *   - Inactive tab: no accent bar, dimmer text, transparent background
 *   - Close button only appears when `params.closable` is true (agent tabs
 *     are not closable) and on hover/focus
 *   - No color inversion on inactive tabs
 */
import { X } from 'lucide-react'
import type { ComponentType, SVGProps } from 'react'
import { Bot, FileText, SquareTerminal } from 'lucide-react'
import type { DockviewPanelApi } from 'dockview'
import type { PanelParams } from '@/types/tab'

type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>

const ICONS: Record<string, IconComponent> = {
  bot: Bot,
  file: FileText,
  terminal: SquareTerminal,
}

const TYPE_ICONS: Record<PanelParams['type'], IconComponent> = {
  agent: Bot,
  file: FileText,
  terminal: SquareTerminal,
}

export interface TabHeaderProps {
  params: PanelParams
  api: DockviewPanelApi
  isActive: boolean
  onActivate: () => void
}

export function TabHeader({ params, api, isActive, onActivate }: TabHeaderProps) {
  const Icon = (params.icon ? ICONS[params.icon] : null) ?? TYPE_ICONS[params.type]

  return (
    <div
      className="group/tab relative flex h-full min-w-0 items-center gap-1.5 px-3 text-[13px]"
      style={{
        backgroundColor: isActive ? 'var(--bg-primary)' : 'transparent',
      }}
      onMouseDown={(e) => {
        if (e.button === 1) {
          if (params.closable) {
            e.preventDefault()
            api.close()
          } else {
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
      {/* Active accent bar at the very top edge */}
      <span
        className="pointer-events-none absolute inset-x-0 top-0 h-0.5"
        style={{
          backgroundColor: isActive ? 'var(--accent)' : 'transparent',
        }}
      />
      <Icon
        className="size-3.5 shrink-0"
        style={{ color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)' }}
      />
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
