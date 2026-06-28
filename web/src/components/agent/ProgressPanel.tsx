/**
 * ProgressPanel — renders the live process surface for an in-flight agent turn
 * (Spec 4 §3.5, §3.6).
 *
 * Following opencode's three-level collapse model: iterations are grouped, and
 * within each iteration, consecutive tools are merged into a ToolGroupCard.
 * Thinking (T) renders as inline Markdown; reasoning (T) stays collapsed.
 *
 * The "process" half of a live assistant turn. The "content" half (streamed
 * text) is rendered by AssistantMessage from the same LiveProgress.
 */
import { memo } from 'react'
import { Repeat } from 'lucide-react'

import { CollapsibleCard } from './CollapsibleCard'
import { MarkdownRenderer } from './MarkdownRenderer'
import { ReasoningBlock } from './ReasoningBlock'
import { ToolGroupCard, formatDuration } from './ToolGroupCard'
import { useI18n } from '@/providers/i18n'
import type { IterationSnapshot, IterationTool, LiveProgress, ToolProgress } from '@/types/agent'

interface ProgressPanelProps {
  progress: LiveProgress
  defaultOpenTool?: boolean
  defaultOpenReasoning?: boolean
  defaultOpenIteration?: boolean
}

export const ProgressPanel = memo(function ProgressPanel({
  progress,
  defaultOpenTool = false,
  defaultOpenReasoning = false,
  defaultOpenIteration = false,
}: ProgressPanelProps) {
  const { t } = useI18n()
  const hasIteration = progress.iteration > 0
  const hasReasoning = Boolean(progress.reasoningContent)
  const hasActive = progress.activeTools.length > 0
  const hasCompleted = progress.completedTools.length > 0
  const hasHistory = progress.iterationHistory.length > 0

  if (!hasIteration && !hasActive && !hasCompleted && !hasReasoning && !hasHistory) return null

  // Current iteration's tools: merge active + completed into one group.
  const currentTools: (ToolProgress | IterationTool)[] = [
    ...progress.completedTools,
    ...progress.activeTools,
  ]

  return (
    <div className="flex flex-col gap-1.5">
      {hasIteration && (
        <div className="flex items-center gap-1.5 px-1 text-[11px] text-text-muted">
          <Repeat className="size-3" />
          <span>
            {t('agent.iteration')} {progress.iteration}
          </span>
          {progress.streaming && (
            <span className="inline-flex items-center gap-1" aria-label={t('agent.statusRunning')}>
              <span className="size-1.5 rounded-full" style={{ backgroundColor: 'var(--status-running)' }} />
            </span>
          )}
        </div>
      )}

      {/* Completed iterations from history — grouped by iteration */}
      {progress.iterationHistory.map((iter) => (
        <CollapsibleIteration
          key={iter.iteration}
          iteration={iter}
          defaultOpen={defaultOpenIteration}
          defaultOpenTool={defaultOpenTool}
          defaultOpenReasoning={defaultOpenReasoning}
        />
      ))}

      {/* Current iteration: reasoning + tools being executed */}
      {hasReasoning && (
        <ReasoningBlock
          content={progress.reasoningContent}
          streaming={progress.streaming}
          defaultOpen={defaultOpenReasoning}
        />
      )}
      {currentTools.length > 0 && (
        <ToolGroupCard tools={currentTools} defaultOpen={defaultOpenTool} />
      )}
    </div>
  )
})

/** Render a single completed iteration group (thinking + reasoning + tools). */
const CollapsibleIteration = memo(function CollapsibleIteration({
  iteration,
  defaultOpen,
  defaultOpenTool,
  defaultOpenReasoning,
}: {
  iteration: IterationSnapshot
  defaultOpen: boolean
  defaultOpenTool: boolean
  defaultOpenReasoning: boolean
}) {
  const { t } = useI18n()
  const toolCount = iteration.tools.length
  const doneCount = iteration.tools.filter((tool) => tool.status === 'done').length

  return (
    <CollapsibleCard
      defaultOpen={defaultOpen}
      icon={<span className="text-[11px] font-mono text-text-muted">#{iteration.iteration}</span>}
      aria-label={`${t('agent.iteration')} ${iteration.iteration}`}
      title={
        <span className="text-text-secondary">
          {t('agent.iteration')} {iteration.iteration}
        </span>
      }
      meta={
        <span className="text-[11px] text-text-muted">
          {doneCount}/{toolCount} {t('agent.tools')}
          {iteration.elapsedMs != null && iteration.elapsedMs > 0 && (
            <span> · {formatDuration(iteration.elapsedMs)}</span>
          )}
        </span>
      }
      bodyClassName="p-2"
    >
      <div className="flex flex-col gap-1.5">
        {iteration.thinking && (
          <div className="rounded-md bg-bg-tertiary/30 px-2.5 py-2">
            <MarkdownRenderer content={iteration.thinking} className="text-xs text-text-secondary" />
          </div>
        )}
        {iteration.reasoning && (
          <ReasoningBlock content={iteration.reasoning} defaultOpen={defaultOpenReasoning} />
        )}
        {iteration.tools.length > 0 && (
          <ToolGroupCard tools={iteration.tools} defaultOpen={defaultOpenTool} />
        )}
      </div>
    </CollapsibleCard>
  )
})
