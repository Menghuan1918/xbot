/**
 * ToolGroupCard — merges consecutive tool calls into a single collapsible card
 * (opencode three-level collapse model, 'minimal' level).
 *
 * Header: compact tool summary (count + names). Body: individual ToolCallBlock
 * list, lazily mounted on first expand (defer).
 *
 * Works for both historical tools (IterationTool) and live tools (ToolProgress).
 */
import { memo, useState } from 'react'
import { Layers } from 'lucide-react'

import { CollapsibleCard } from './CollapsibleCard'
import { ToolCallBlock } from './ToolCallBlock'
import { toolStatusVisual } from './statusVisual'
import { useI18n } from '@/providers/i18n'
import type { IterationTool, ToolProgress } from '@/types/agent'

interface ToolGroupCardProps {
  tools: (IterationTool | ToolProgress)[]
  /** Default-open state for the group card itself. */
  defaultOpen?: boolean
}

/** Extract display name from a tool snapshot (prefers label over name). */
function toolName(t: IterationTool | ToolProgress): string {
  return t.label || t.name || 'tool'
}

/** Build a compact name summary: "Read, Grep, …" (max 3 names, then +N). */
function nameSummary(tools: (IterationTool | ToolProgress)[]): string {
  const names = tools.map(toolName)
  if (names.length <= 3) return names.join(', ')
  return `${names.slice(0, 3).join(', ')} +${names.length - 3}`
}

/** Aggregate elapsed ms from a tool list (sum of individual elapsedMs). */
function totalElapsedMs(tools: (IterationTool | ToolProgress)[]): number {
  return tools.reduce((sum, t) => sum + (t.elapsedMs ?? 0), 0)
}

/** Overall status: 'error' if any, 'running' if any running, else 'done'. */
function groupStatus(tools: (IterationTool | ToolProgress)[]): string {
  const statuses = tools.map((t) => t.status)
  if (statuses.some((s) => s === 'error')) return 'error'
  if (statuses.some((s) => s === 'running')) return 'running'
  return 'done'
}

/** Format milliseconds into a human-readable duration string. */
export function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return '0s'
  if (ms < 1000) return `${ms}ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)}s`
  const m = Math.floor(s / 60)
  const rem = Math.round(s % 60)
  return `${m}m ${rem}s`
}

export const ToolGroupCard = memo(function ToolGroupCard({
  tools,
  defaultOpen = false,
}: ToolGroupCardProps) {
  const { t } = useI18n()
  const [mounted, setMounted] = useState(defaultOpen)

  if (!tools.length) return null

  // Single tool: delegate to ToolCallBlock directly (no group wrapper needed).
  if (tools.length === 1) {
    return <ToolCallBlock tool={tools[0]} defaultOpen={defaultOpen} />
  }

  const status = groupStatus(tools)
  const visual = toolStatusVisual(status)
  const StatusIcon = visual.icon
  const summary = nameSummary(tools)
  const elapsed = totalElapsedMs(tools)

  const handleOpenChange = (open: boolean) => {
    if (open) setMounted(true)
  }

  return (
    <CollapsibleCard
      defaultOpen={defaultOpen}
      onOpenChange={handleOpenChange}
      icon={<Layers className="size-3.5" />}
      aria-label={t('agent.toolGroup', { count: tools.length })}
      title={
        <span className="flex items-center gap-1.5">
          <span className="font-mono text-text-primary">{summary}</span>
        </span>
      }
      meta={
        <span
          className="flex shrink-0 items-center gap-1.5 text-[11px]"
          style={{ color: visual.color }}
        >
          <StatusIcon className="size-3" />
          <span className="text-text-muted">
            {t('agent.toolGroup', { count: tools.length })}
          </span>
          {elapsed > 0 && (
            <span className="text-text-muted">· {formatDuration(elapsed)}</span>
          )}
        </span>
      }
      bodyClassName="p-2"
    >
      {mounted && (
        <div className="flex flex-col gap-1">
          {tools.map((tool, i) => (
            <ToolCallBlock key={i} tool={tool} index={i} defaultOpen={false} />
          ))}
        </div>
      )}
    </CollapsibleCard>
  )
})
