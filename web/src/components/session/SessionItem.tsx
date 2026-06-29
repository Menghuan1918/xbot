/**
 * SessionItem — a single chatroom row in the session list.
 *
 * Single-line layout: [status dot] + title + relative time.
 * No left decoration bar; active session uses background highlight.
 */
import { Star, Pencil, Trash2 } from 'lucide-react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { cn } from '@/lib/utils'
import { useI18n } from '@/providers/i18n'
import type { SessionInfo, SessionStatus } from '@/types/shared'

interface SessionItemProps {
  session: SessionInfo
  starred: boolean
  active: boolean
  onSelect: (id: string) => void
  onToggleStar: (id: string) => void
  onRename: (session: SessionInfo) => void
  onDelete: (session: SessionInfo) => void
}

const STATUS_COLOR: Record<SessionStatus, string> = {
  running: 'var(--status-running)',
  waiting_input: 'var(--status-waiting)',
  idle: 'var(--status-idle)',
  error: 'var(--status-error)',
}

export function SessionItem({
  session,
  starred,
  active,
  onSelect,
  onToggleStar,
  onRename,
  onDelete,
}: SessionItemProps) {
  const { t } = useI18n()

  const row = (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(session.chatID)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(session.chatID)
        }
      }}
      className={cn(
        'group flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
        active ? 'bg-bg-tertiary' : 'hover:bg-bg-tertiary/60',
      )}
    >
      {/* Status dot */}
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: STATUS_COLOR[session.status] }}
        aria-hidden
      />

      {/* Star toggle (hover/starred) */}
      <button
        type="button"
        aria-label={starred ? t('session.unstar') : t('session.star')}
        onClick={(e) => {
          e.stopPropagation()
          onToggleStar(session.chatID)
        }}
        className={cn(
          'shrink-0 rounded p-0.5 transition-opacity',
          starred ? 'opacity-100' : 'opacity-0 group-hover:opacity-60',
        )}
        style={starred ? { color: '#e6a700' } : { color: 'var(--text-muted)' }}
      >
        <Star className="size-3.5" fill={starred ? 'currentColor' : 'none'} />
      </button>

      {/* Title */}
      <span
        className="flex-1 truncate text-xs font-medium"
        style={{ color: 'var(--text-primary)' }}
        title={session.label}
      >
        {session.label || session.chatID}
      </span>

      {/* Relative time */}
      <span className="shrink-0 text-[10px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
        {relativeTime(session.lastActive, t)}
      </span>
    </div>
  )

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => onToggleStar(session.chatID)}>
          <Star
            className="size-4"
            fill={starred ? 'currentColor' : 'none'}
            style={starred ? { color: '#e6a700' } : undefined}
          />
          {starred ? t('session.unstar') : t('session.star')}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onRename(session)}>
          <Pencil className="size-4" />
          {t('common.rename')}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onDelete(session)} variant="destructive">
          <Trash2 className="size-4" />
          {t('common.delete')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

function relativeTime(
  lastActive: string,
  t: (k: string, params?: Record<string, string | number>) => string,
): string {
  const ts = Date.parse(lastActive)
  if (Number.isNaN(ts)) return ''
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60_000)
  if (min < 1) return t('session.justNow')
  if (min < 60) return t('session.minutesAgo', { n: min })
  const hr = Math.floor(min / 60)
  if (hr < 24) return t('session.hoursAgo', { n: hr })
  const day = Math.floor(hr / 24)
  if (day < 30) return t('session.daysAgo', { n: day })
  return new Date(ts).toLocaleDateString()
}
