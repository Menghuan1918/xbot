/**
 * SessionConfig — current-session configuration panel (Spec 6 §3.6).
 *
 * Two parts:
 *   1. Session info (id, channel, work path, times, message count) — sourced
 *      from useSessionStore. When no session is active the panel shows a
 *      hint (Spec 3 owns the real list; this stays usable standalone).
 *   2. LLM config — model list via `list_models`, current model via
 *      `get_settings`, switch via `switch_model`; plus max-context,
 *      max-output-tokens, thinking_mode. RPC failures fall back to defaults
 *      so the UI is always usable.
 *
 * Per Spec 6 the data source is the WS rpc surface; the panel does NOT touch
 * user_settings/CLIRuntimeSettingKeys. KISS: edits are local state persisted
 * on change via the matching RPC, with a toast for success/failure.
 */
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { useI18n } from '@/providers/i18n'
import { useWSConnection } from '@/hooks/useWSConnection'
import { useCwd } from '@/providers/CwdProvider'
import { useSessionStore } from '@/hooks/useSessionStore'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { SidebarPanel } from './RightSidebar'

interface SessionConfigProps {
  onPanelChange: (panel: SidebarPanel | null) => void
}

const FALLBACK_MODELS = ['gpt-4o', 'gpt-4o-mini', 'claude-sonnet-4', 'claude-haiku-4']

export function SessionConfig({ onPanelChange }: SessionConfigProps) {
  // onPanelChange is exposed for future header actions (e.g. collapse button).
  void onPanelChange

  const { t } = useI18n()
  const ws = useWSConnection()
  const { cwd } = useCwd()
  const session = useSessionStore()

  const activeId = session.activeSessionId
  const current = activeId ? session.sessions.find((s) => s.chatID === activeId) : undefined

  const [models, setModels] = useState<string[]>(FALLBACK_MODELS)
  const [model, setModel] = useState<string>(FALLBACK_MODELS[0])
  const [maxContext, setMaxContext] = useState('200000')
  const [maxOutput, setMaxOutput] = useState('8192')
  const [thinkingMode, setThinkingMode] = useState(true)
  const [loading, setLoading] = useState(false)

  // Fetch models + current settings once the WS is connected.
  const refresh = useCallback(async () => {
    if (!ws.connected) return
    setLoading(true)
    try {
      const list = (await ws.rpc<string[]>('list_models')) ?? []
      if (Array.isArray(list) && list.length) setModels(list)
    } catch {
      /* keep fallback models */
    }
    try {
      const settings = (await ws.rpc<Record<string, string>>('get_settings')) ?? {}
      if (settings?.model) setModel(settings.model)
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [ws])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const onSwitchModel = useCallback(
    async (next: string) => {
      setModel(next)
      if (!ws.connected) return
      try {
        await ws.rpc('switch_model', { model: next, chat_id: activeId ?? '' })
        toast.success(t('sidebar.modelSwitched', { model: next }))
      } catch {
        toast.error(t('sidebar.modelSwitchFailed'))
      }
    },
    [ws, activeId, t],
  )

  // Persisters use the backend's exact payload shape (serverapp/rpc_table.go +
  // agent/req_types.go): set_user_max_context → { max_context }, set_user_max_
  // output_tokens → { max_tokens }, set_user_thinking_mode → { mode } (string:
  // "enabled" or "" for off). A shared `{ value }` would silently decode to the
  // zero value and drop the edit.
  const persistMaxContext = useCallback(
    async (value: string) => {
      const n = Number(value)
      if (!ws.connected || Number.isNaN(n)) return
      try {
        await ws.rpc('set_user_max_context', { max_context: n })
      } catch {
        toast.error(t('sidebar.configSaveFailed'))
      }
    },
    [ws, t],
  )
  const persistMaxOutput = useCallback(
    async (value: string) => {
      const n = Number(value)
      if (!ws.connected || Number.isNaN(n)) return
      try {
        await ws.rpc('set_user_max_output_tokens', { max_tokens: n })
      } catch {
        toast.error(t('sidebar.configSaveFailed'))
      }
    },
    [ws, t],
  )
  const persistThinkingMode = useCallback(
    async (enabled: boolean) => {
      if (!ws.connected) return
      try {
        await ws.rpc('set_user_thinking_mode', { mode: enabled ? 'enabled' : '' })
      } catch {
        toast.error(t('sidebar.configSaveFailed'))
      }
    },
    [ws, t],
  )

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

        {/* Model selection */}
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
            {t('sidebar.model')}
          </h3>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="model-select" className="text-xs text-text-secondary">
              {t('sidebar.model')}
            </Label>
            <Select value={model} onValueChange={onSwitchModel} disabled={loading}>
              <SelectTrigger id="model-select" className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {models.map((m) => (
                  <SelectItem key={m} value={m} className="text-xs">
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </section>

        <div className="h-px bg-border" />

        {/* Token config */}
        <section className="flex flex-col gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
            {t('sidebar.tokenConfig')}
          </h3>
          <NumberField
            id="max-context"
            label={t('sidebar.maxContext')}
            value={maxContext}
            onChange={setMaxContext}
            onBlur={(v) => void persistMaxContext(v)}
          />
          <NumberField
            id="max-output"
            label={t('sidebar.maxOutput')}
            value={maxOutput}
            onChange={setMaxOutput}
            onBlur={(v) => void persistMaxOutput(v)}
          />
          <div className="flex items-center justify-between">
            <Label htmlFor="thinking-mode" className="text-xs text-text-secondary">
              {t('sidebar.thinkingMode')}
            </Label>
            <Switch
              id="thinking-mode"
              checked={thinkingMode}
              onCheckedChange={(checked) => {
                setThinkingMode(checked)
                void persistThinkingMode(checked)
              }}
            />
          </div>
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

function NumberField({
  id,
  label,
  value,
  onChange,
  onBlur,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  onBlur: (v: string) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs text-text-secondary">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => onBlur(value)}
        className="h-8 text-xs"
      />
    </div>
  )
}
