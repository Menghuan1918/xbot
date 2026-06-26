/**
 * SessionItem — a single chatroom row in the session list (Spec 3 §3.6).
 *
 * Layout: star toggle · title + relative time · preview · status dot.
 * Active session gets an accent background; starred sessions render a gold star.
 * The whole row is the context-menu trigger (right-click → menu) and the
 * click target for switching. The menu actions (star/rename/delete) are
 * delegated to the parent so a single dialog pair serves every row.
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
        'group relative flex cursor-pointer flex-col gap-1 rounded-md px-2 py-1.5 text-left transition-colors',
        active ? 'bg-bg-tertiary' : 'hover:bg-bg-tertiary/60',
      )}
      style={active ? { boxShadow: 'inset 2px 0 0 0 var(--accent)' } : undefined}
    >
      <div className="flex items-center gap-1.5">
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
        <span
          className="flex-1 truncate text-xs font-medium"
          style={{ color: 'var(--text-primary)' }}
          title={session.label}
        >
          {session.label || session.chatID}
        </span>
        <span className="shrink-0 text-[10px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
          {relativeTime(session.lastActive, t)}
        </span>
      </div>
      {session.preview && (
        <p
          className="line-clamp-1 pl-6 text-[11px] leading-tight"
          style={{ color: 'var(--text-secondary)' }}
        >
          {session.preview}
        </p>
      )}
      <div className="flex items-center gap-1 pl-6">
        <span
          className="size-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: STATUS_COLOR[session.status] }}
          aria-hidden
        />
        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
          {t(`session.status.${statusKey(session.status)}`)}
        </span>
      </div>
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

function statusKey(s: SessionStatus): 'running' | 'waiting' | 'idle' | 'error' {
  switch (s) {
    case 'waiting_input':
      return 'waiting'
    default:
      return s
  }
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
