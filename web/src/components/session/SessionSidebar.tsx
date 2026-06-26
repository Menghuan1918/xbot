/**
 * SessionSidebar — the left session panel (Spec 3 §3.1).
 *
 * Replaces Spec 2's placeholder left-sidebar body for the "sessions" view.
 * Wires useSessionStore to the search box, category switcher, the list, and
 * the new-session dialog. Pure presentational composition on top of the store.
 */
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useI18n } from '@/providers/i18n'
import { useSessionStore } from '@/hooks/useSessionStore'
import type { SessionCategory } from '@/types/shared'
import { SessionSearch } from './SessionSearch'
import { SessionList } from './SessionList'
import { NewSessionDialog } from './NewSessionDialog'

const CATEGORIES: SessionCategory[] = ['all', 'channel', 'time', 'status']

export function SessionSidebar() {
  const { t } = useI18n()
  const store = useSessionStore()
  const [search, setSearch] = useState('')
  const [newOpen, setNewOpen] = useState(false)

  return (
    <div className="flex h-full w-full flex-col bg-bg-secondary">
      {/* Header: title + new-session button */}
      <header
        className="flex h-9 shrink-0 items-center justify-between px-2"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
          {t('sidebar.sessions')}
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={t('session.newSession')}
              onClick={() => setNewOpen(true)}
            >
              <Plus />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t('session.newSession')}</TooltipContent>
        </Tooltip>
      </header>

      {/* Category switcher */}
      <div
        className="flex shrink-0 items-center gap-0.5 px-2 py-1"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        {CATEGORIES.map((c) => {
          const active = store.category === c
          return (
            <button
              key={c}
              type="button"
              onClick={() => store.setCategory(c)}
              className="flex-1 rounded px-2 py-1 text-[11px] font-medium transition-colors"
              style={{
                backgroundColor: active ? 'var(--bg-tertiary)' : 'transparent',
                color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
              }}
            >
              {labelForCategory(c, t)}
            </button>
          )
        })}
      </div>

      {/* Search */}
      <div className="shrink-0">
        <SessionSearch value={search} onChange={setSearch} />
      </div>

      {/* List */}
      <div className="min-h-0 flex-1">
        <SessionList
          sessions={store.sessions}
          groups={store.groups}
          sortedSessions={store.sortedSessions}
          category={store.category}
          starredIds={store.starredIds}
          activeSessionId={store.activeSessionId}
          search={search}
          onSelect={(id, channel) => void store.switchSession(id, channel)}
          onToggleStar={store.toggleStar}
          onRename={store.renameSession}
          onDelete={store.deleteSession}
        />
      </div>

      <NewSessionDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreate={store.createSession}
      />
    </div>
  )
}

function labelForCategory(
  c: SessionCategory,
  t: (k: string) => string,
): string {
  switch (c) {
    case 'all':
      return t('session.all')
    case 'channel':
      return t('session.byChannel')
    case 'time':
      return t('session.byTime')
    case 'status':
      return t('session.byStatus')
  }
}
