/**
 * ProgressPanel — renders the live process surface for an in-flight agent turn
 * (Spec 4 §3.5, §3.6): iteration indicator, active/completed tool blocks, and
 * the reasoning block. Shown above (or inline with) the streaming text.
 *
 * This is the "process" half of a live assistant turn. The "content" half
 * (streamed text) is rendered by AssistantMessage from the same LiveProgress.
 * Splitting them keeps the tool/reasoning chrome from re-parsing the markdown
 * body on every token.
 */
import { memo } from 'react'
import { Repeat } from 'lucide-react'

import { ReasoningBlock } from './ReasoningBlock'
import { ToolCallBlock } from './ToolCallBlock'
import { useI18n } from '@/providers/i18n'
import type { LiveProgress } from '@/types/agent'

interface ProgressPanelProps {
  progress: LiveProgress
  defaultOpenTool?: boolean
  defaultOpenReasoning?: boolean
}

export const ProgressPanel = memo(function ProgressPanel({
  progress,
  defaultOpenTool = false,
  defaultOpenReasoning = false,
}: ProgressPanelProps) {
  const { t } = useI18n()
  const hasActive = progress.activeTools.length > 0
  const hasCompleted = progress.completedTools.length > 0
  const hasReasoning = Boolean(progress.reasoningContent)
  const hasIteration = progress.iteration > 0

  if (!hasActive && !hasCompleted && !hasReasoning && !hasIteration) return null

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
      {hasReasoning && (
        <ReasoningBlock
          content={progress.reasoningContent}
          streaming={progress.streaming}
          defaultOpen={defaultOpenReasoning}
        />
      )}
      {hasActive && (
        <div className="flex flex-col gap-1">
          {progress.activeTools.map((tool, i) => (
            <ToolCallBlock
              key={`active-${i}`}
              tool={tool}
              index={i}
              defaultOpen={defaultOpenTool}
            />
          ))}
        </div>
      )}
      {hasCompleted && (
        <div className="flex flex-col gap-1">
          {progress.completedTools.map((tool, i) => (
            <ToolCallBlock
              key={`completed-${i}`}
              tool={tool}
              index={progress.activeTools.length + i}
              defaultOpen={defaultOpenTool}
            />
          ))}
        </div>
      )}
    </div>
  )
})
