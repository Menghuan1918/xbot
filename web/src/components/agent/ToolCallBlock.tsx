/**
 * ToolCallBlock — renders one tool call, collapsed by default with name +
 * status, expanding to args + output summary (Spec 4 §3.3, §3.5).
 *
 * Works for both a historical tool (IterationTool, always completed) and a live
 * tool (ToolProgress, may be running). The status chip color follows the
 * design-system status tokens.
 */
import { memo } from 'react'
import { Wrench } from 'lucide-react'

import { CollapsibleCard } from './CollapsibleCard'
import { toolStatusVisual } from './statusVisual'
import { useI18n } from '@/providers/i18n'
import type { IterationTool, ToolProgress } from '@/types/agent'

interface ToolCallBlockProps {
  tool: IterationTool | ToolProgress
  index?: number
  defaultOpen?: boolean
}

function isLive(t: IterationTool | ToolProgress): t is ToolProgress {
  return 'args' in t || 'detail' in t || 'iteration' in t
}

function nameOf(t: IterationTool | ToolProgress): string {
  return t.label || t.name || 'tool'
}

function summaryOf(t: IterationTool | ToolProgress): string | undefined {
  if ('summary' in t && t.summary) return t.summary
  return undefined
}

function argsOf(t: IterationTool | ToolProgress): string | undefined {
  if ('args' in t && t.args) return t.args
  return undefined
}

function detailOf(t: IterationTool | ToolProgress): string | undefined {
  if ('detail' in t && t.detail) return t.detail
  return undefined
}

function statusOf(t: IterationTool | ToolProgress): string | undefined {
  return t.status
}

export const ToolCallBlock = memo(function ToolCallBlock({
  tool,
  index,
  defaultOpen = false,
}: ToolCallBlockProps) {
  const { t } = useI18n()
  const status = statusOf(tool)
  const visual = toolStatusVisual(status)
  const StatusIcon = visual.icon
  const name = nameOf(tool)
  const summary = summaryOf(tool)
  const args = argsOf(tool)
  const detail = detailOf(tool)

  return (
    <CollapsibleCard
      defaultOpen={defaultOpen}
      icon={<Wrench className="size-3.5" />}
      aria-label={name}
      title={
        <span className="flex items-center gap-1.5">
          {typeof index === 'number' && (
            <span className="text-text-muted">{index + 1}.</span>
          )}
          <span className="font-mono text-text-primary">{name}</span>
        </span>
      }
      meta={
        <span
          className="flex shrink-0 items-center gap-1 text-[11px]"
          style={{ color: visual.color }}
        >
          <StatusIcon className="size-3" />
          {summary ? (
            <span className="max-w-[40ch] truncate text-text-secondary">{summary}</span>
          ) : (
            <span className="uppercase">{t(`agent.${visual.labelKey}`)}</span>
          )}
        </span>
      }
      bodyClassName="px-2.5 py-2"
    >
      <div className="flex flex-col gap-2 text-xs">
        {args && (
          <div>
            <div className="mb-1 text-text-muted">{t('agent.args')}</div>
            <pre className="overflow-x-auto rounded bg-bg-tertiary/60 p-2 font-mono text-[12px] text-text-primary">
              {args}
            </pre>
          </div>
        )}
        {detail && (
          <div>
            <div className="mb-1 text-text-muted">{t('agent.output')}</div>
            <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded bg-bg-tertiary/60 p-2 font-mono text-[12px] text-text-secondary">
              {detail}
            </pre>
          </div>
        )}
        {!args && !detail && summary && (
          <pre className="whitespace-pre-wrap rounded bg-bg-tertiary/60 p-2 text-text-secondary">
            {summary}
          </pre>
        )}
        {!args && !detail && !summary && <div className="text-text-muted">{t('agent.none')}</div>}
      </div>
    </CollapsibleCard>
  )
})

void isLive // referenced for type narrowing clarity; no runtime use.
