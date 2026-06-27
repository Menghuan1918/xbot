/**
 * SessionInfo — read-only session information panel.
 *
 * Displays session metadata (id, channel, work path, last active, message count)
 * and current LLM model. All editing is handled in the Settings page, not here.
 */
import { useCallback, useEffect, useState } from 'react'

import { useI18n } from '@/providers/i18n'
import { useWSConnection } from '@/hooks/useWSConnection'
import { useCwd } from '@/providers/CwdProvider'
import { useSessionStore } from '@/hooks/useSessionStore'
import { ScrollArea } from '@/components/ui/scroll-area'

export function SessionInfo() {
  const { t } = useI18n()
  const ws = useWSConnection()
  const { cwd } = useCwd()
  const session = useSessionStore()

  const activeId = session.activeSessionId
  const current = activeId ? session.sessions.find((s) => s.chatID === activeId) : undefined

  const [model, setModel] = useState<string>('—')

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
              <InfoRow label={t('sidebar.workPath')} value={cwd ?? '—'} mono />
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
