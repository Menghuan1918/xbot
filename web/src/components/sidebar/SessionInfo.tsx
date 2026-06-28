/**
 * SessionInfo — session information panel with editable CWD.
 *
 * Displays session metadata (id, channel, work path, last active, message count)
 * and current LLM model. The work path is editable — changes are applied via
 * the PUT /api/sessions/{chatID}/cwd REST endpoint and propagated to the CwdProvider so file browser/search/
 * terminal all follow the new working directory.
 */
import { useCallback, useEffect, useState } from 'react'
import { FolderOpen, Loader2 } from 'lucide-react'

import { useI18n } from '@/providers/i18n'
import { useWSConnection } from '@/hooks/useWSConnection'
import { useCwd } from '@/providers/CwdProvider'
import { useSessionStore } from '@/hooks/useSessionStore'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'

export function SessionInfo() {
  const { t } = useI18n()
  const ws = useWSConnection()
  const { cwd } = useCwd()
  const session = useSessionStore()

  const activeId = session.activeSessionId
  const current = activeId ? session.sessions.find((s) => s.chatID === activeId) : undefined

  const [model, setModel] = useState<string>('—')
  const [editingCwd, setEditingCwd] = useState(false)
  const [cwdInput, setCwdInput] = useState('')
  const [cwdBusy, setCwdBusy] = useState(false)

  const refresh = useCallback(async () => {
    if (!ws.connected) return
    try {
      const settings = (await ws.rpc<Record<string, string>>('get_settings')) ?? {}
      if (settings?.model) setModel(settings.model)
    } catch {
      /* ignore */
    }
  }, [ws])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const applyCwd = useCallback(async () => {
    const path = cwdInput.trim()
    if (!activeId || !path || path === cwd) {
      setEditingCwd(false)
      return
    }
    setCwdBusy(true)
    try {
      await fetch(`/api/sessions/${encodeURIComponent(activeId)}/cwd`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dir: path }),
        credentials: 'include',
      })
      // Update CwdContext via custom event for immediate feedback.
      window.dispatchEvent(new CustomEvent('xbot:cwd-changed', { detail: path }))
      toast.success(t('sidebar.cwdUpdated'))
    } catch {
      toast.error(t('sidebar.cwdUpdateFailed'))
    } finally {
      setCwdBusy(false)
      setEditingCwd(false)
    }
  }, [activeId, cwdInput, cwd, t])

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-5 px-3 py-3 text-sm">
        {/* Session info */}
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
            {t('sidebar.sessionInfo')}
          </h3>
          {activeId ? (
            <dl className="flex flex-col gap-1.5">
              <InfoRow label={t('sidebar.sessionId')} value={activeId} mono />
              <InfoRow
                label={t('sidebar.channel')}
                value={current?.channel ?? 'web'}
              />
              {/* Editable work path */}
              <div className="flex items-baseline gap-2">
                <dt className="shrink-0 text-xs text-text-secondary">{t('sidebar.workPath')}</dt>
                {editingCwd ? (
                  <div className="flex min-w-0 flex-1 items-center gap-1">
                    <Input
                      value={cwdInput}
                      onChange={(e) => setCwdInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void applyCwd()
                        if (e.key === 'Escape') setEditingCwd(false)
                      }}
                      className="h-6 flex-1 font-mono text-xs"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => void applyCwd()}
                      disabled={cwdBusy}
                      className="flex size-5 shrink-0 items-center justify-center rounded-sm text-text-secondary hover:bg-bg-tertiary"
                    >
                      {cwdBusy ? <Loader2 className="size-3 animate-spin" /> : <FolderOpen className="size-3" />}
                    </button>
                  </div>
                ) : (
                  <dd
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-1 truncate font-mono text-xs text-text-primary hover:text-accent"
                    title={cwd ?? ''}
                    onClick={() => {
                      setCwdInput(cwd ?? '')
                      setEditingCwd(true)
                    }}
                  >
                    <span className="truncate">{cwd ?? '—'}</span>
                  </dd>
                )}
              </div>
              {current?.lastActive && (
                <InfoRow label={t('sidebar.lastActive')} value={current.lastActive} />
              )}
              <InfoRow
                label={t('sidebar.messageCount')}
                value={String(current ? session.sessions.length : 0)}
              />
            </dl>
          ) : (
            <p className="text-xs text-text-muted">{t('sidebar.noActiveSession')}</p>
          )}
        </section>

        <div className="h-px bg-border" />

        {/* Model info (read-only) */}
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
            {t('sidebar.model')}
          </h3>
          <InfoRow label={t('sidebar.model')} value={model} mono />
        </section>

        {!ws.connected && (
          <p className="text-xs text-text-muted">{t('sidebar.disconnectedHint')}</p>
        )}
      </div>
    </ScrollArea>
  )
}

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="shrink-0 text-xs text-text-secondary">{label}</dt>
      <dd
        className={`truncate text-xs text-text-primary ${mono ? 'font-mono' : ''}`}
        title={value}
      >
        {value}
      </dd>
    </div>
  )
}
