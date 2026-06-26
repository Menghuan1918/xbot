/**
 * SessionGroup — a titled bucket of sessions within a category (Spec 3 §3.2).
 *
 * Renders the translated group header (channel / time / status) and its
 * sorted SessionItem children. Collapsible so long lists stay scannable.
 */
import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/providers/i18n'
import type { SessionCategory, SessionInfo } from '@/types/shared'
import { SessionItem } from './SessionItem'

interface SessionGroupProps {
  groupKey: string
  category: SessionCategory
  sessions: SessionInfo[]
  starredIds: string[]
  activeSessionId: string | null
  onSelect: (id: string, channel: string) => void
  onToggleStar: (id: string) => void
  onRename: (session: SessionInfo) => void
  onDelete: (session: SessionInfo) => void
}

export function SessionGroup({
  groupKey,
  category,
  sessions,
  starredIds,
  activeSessionId,
  onSelect,
  onToggleStar,
  onRename,
  onDelete,
}: SessionGroupProps) {
  const { t } = useI18n()
  const [open, setOpen] = useState(true)
  const title = groupTitle(groupKey, category, t)
  const starred = new Set(starredIds)

  return (
    <section className="flex flex-col">
      {category !== 'all' && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide"
          style={{ color: 'var(--text-secondary)' }}
        >
          <ChevronRight className={cn('size-3 transition-transform', open && 'rotate-90')} />
          <span>{title}</span>
          <span className="font-normal" style={{ color: 'var(--text-muted)' }}>
            {sessions.length}
          </span>
        </button>
      )}
      {open && (
        <div className="flex flex-col gap-0.5">
          {sessions.map((s) => (
            <SessionItem
              key={s.chatID}
              session={s}
              starred={starred.has(s.chatID)}
              active={activeSessionId === s.chatID}
              onSelect={(id) => onSelect(id, s.channel)}
              onToggleStar={onToggleStar}
              onRename={onRename}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function groupTitle(
  key: string,
  category: SessionCategory,
  t: (k: string, p?: Record<string, string | number>) => string,
): string {
  switch (category) {
    case 'channel':
      if (key === 'web') return 'Web'
      if (key === 'cli') return 'CLI'
      if (key === 'feishu') return t('channel.feishu')
      return key || t('channel.unknown')
    case 'time':
      return t(`time.${key}`)
    case 'status':
      return t(`session.status.${statusKey(key)}`)
    case 'all':
    default:
      return t('session.all')
  }
}

function statusKey(s: string): 'running' | 'waiting' | 'idle' | 'error' {
  if (s === 'waiting_input') return 'waiting'
  return s as 'running' | 'idle' | 'error'
}
