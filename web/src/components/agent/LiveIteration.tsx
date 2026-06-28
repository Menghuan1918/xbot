/**
 * LiveIteration — renders the in-flight iteration from a ProgressSnapshot
 * (Spec 4 §3.3, §3.5).
 *
 * Streaming T (reasoning): FoldedLine wrapping ReasoningBlock with streaming
 *   indicator.
 * Streaming C (tools): FoldedToolGroup with merged streaming/active/completed
 *   tools from the snapshot.
 * Streaming O (text): MarkdownRenderer with a streaming cursor indicator.
 */
import { memo } from 'react'

import { FoldedLine } from './FoldedLine'
import { FoldedToolGroup } from './FoldedToolGroup'
import { MarkdownRenderer } from './MarkdownRenderer'
import { ReasoningBlock } from './ReasoningBlock'
import { useI18n } from '@/providers/i18n'
import type { CollapseLevel } from '@/types/agent'
import type { ProgressSnapshot, WebToolProgress } from '@/types/shared'

interface LiveIterationProps {
  progress: ProgressSnapshot
  level: CollapseLevel
}

/** Deduplicate tools by name+label, preserving first occurrence order. */
function dedupTools(tools: WebToolProgress[]): WebToolProgress[] {
  const seen = new Set<string>()
  const result: WebToolProgress[] = []
  for (const tool of tools) {
    const key = `${tool.name}-${tool.label}`
    if (!seen.has(key)) {
      seen.add(key)
      result.push(tool)
    }
  }
  return result
}

export const LiveIteration = memo(function LiveIteration({
  progress,
  level,
}: LiveIterationProps) {
  const { t } = useI18n()

  const hasReasoning = Boolean(progress.reasoningStreamContent)
  const hasTools =
    progress.streamingTools.length > 0 ||
    progress.activeTools.length > 0 ||
    progress.completedTools.length > 0
  const hasStreamContent = Boolean(progress.streamContent)

  if (!hasReasoning && !hasTools && !hasStreamContent) return null

  // Merge all tool groups for the current iteration.
  const allTools = dedupTools([
    ...progress.streamingTools,
    ...progress.activeTools,
    ...progress.completedTools,
  ])

  return (
    <div className="flex flex-col gap-1">
      {/* Streaming T — show character count instead of T0/T1 */}
      {hasReasoning && (
        <FoldedLine
          title={t('agent.thinkingChars', { count: progress.reasoningStreamContent.length })}
          defaultOpen={false}
        >
          <ReasoningBlock
            content={progress.reasoningStreamContent}
            streaming
          />
        </FoldedLine>
      )}

      {/* Streaming C */}
      {hasTools && <FoldedToolGroup tools={allTools} level={level} />}

      {/* Streaming O */}
      {hasStreamContent && (
        <div>
          <MarkdownRenderer
            content={progress.streamContent}
            className="text-sm text-text-primary"
          />
          {progress.streaming && (
            <span
              className="inline-block ml-0.5 h-4 w-1.5 animate-pulse bg-text-primary align-middle"
              aria-hidden
            />
          )}
        </div>
      )}
    </div>
  )
})
