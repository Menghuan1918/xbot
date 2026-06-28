/**
 * AssistantMessage — renders one assistant message (Spec 4 §3.5).
 *
 * 3-level collapse model:
 *   'all'     — only a summary fold line + final O. Click the summary to
 *               expand into a TurnBody rendered at 'minimal' level.
 *   'minimal' — full TurnBody: T folded, C merged, O shown.
 *   'none'    — full TurnBody: T folded, C individual, O shown.
 *
 * Streaming state: when `message.isPartial`, the liveProgress snapshot is
 * passed to TurnBody → LiveIteration for real-time rendering.
 */
import { memo, useState } from 'react'
import { Bot } from 'lucide-react'

import { FoldedLine } from './FoldedLine'
import { MarkdownRenderer } from './MarkdownRenderer'
import { TurnBody } from './TurnBody'
import { useI18n } from '@/providers/i18n'
import type { ChatMessage, CollapseLevel, LiveProgress } from '@/types/agent'

interface AssistantMessageProps {
  message: ChatMessage
  /** Live progress for a streaming message; omitted for committed history. */
  progress?: LiveProgress | null
  /** Collapse level controlling default-open for iteration history. */
  collapseLevel: CollapseLevel
}

function AssistantMessageImpl({ message, progress, collapseLevel }: AssistantMessageProps) {
  const { t } = useI18n()
  const [summaryExpanded, setSummaryExpanded] = useState(false)

  // Source iterations: prefer committed message.iterations, fall back to live progress.
  const iterations = message.iterations?.length > 0
    ? message.iterations
    : progress?.iterationHistory ?? []

  const isStreaming = message.isPartial
  const liveProgress = isStreaming ? progress : null

  // 'all' level + committed: show summary + final O only.
  if (collapseLevel === 'all' && !isStreaming) {
    const totalTools = iterations.reduce((sum, iter) => sum + iter.toolCount, 0)
    const showSummary = iterations.length > 0

    return (
      <div className="agent-msg-card flex gap-2.5 px-1">
        <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-accent/15">
          <Bot className="size-4 text-accent" />
        </div>
        <div className="min-w-0 flex-1">
          {showSummary && (
            <FoldedLine
              title={t('agent.processed', { iterations: iterations.length, tools: totalTools })}
              defaultOpen={false}
              onToggle={(open) => setSummaryExpanded(open)}
            >
              {summaryExpanded && (
                <TurnBody iterations={iterations} level="minimal" />
              )}
            </FoldedLine>
          )}
          {message.content ? (
            <MarkdownRenderer content={message.content} />
          ) : (
            !showSummary && (
              <span className="text-sm text-text-muted">{t('agent.emptyAssistant')}</span>
            )
          )}
          {message.displayOnly && (
            <span className="mt-1 inline-block rounded bg-bg-tertiary px-1.5 py-0.5 text-[11px] text-text-muted">
              {t('agent.displayOnly')}
            </span>
          )}
        </div>
      </div>
    )
  }

  // 'minimal'/'none' level or streaming: render full TurnBody.
  return (
    <div className="agent-msg-card flex gap-2.5 px-1">
      <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-accent/15">
        <Bot className="size-4 text-accent" />
      </div>
      <div className="min-w-0 flex-1">
        <TurnBody
          iterations={iterations}
          liveProgress={liveProgress}
          level={collapseLevel}
        />
        {/* Final O: for committed messages, render message.content after iterations.
            For streaming, the streamContent is already in LiveIteration. */}
        {!isStreaming && message.content && (
          <MarkdownRenderer content={message.content} />
        )}
        {!isStreaming && !message.content && iterations.length === 0 && !showProgress(progress) && (
          <span className="text-sm text-text-muted">{t('agent.emptyAssistant')}</span>
        )}
        {message.displayOnly && (
          <span className="mt-1 inline-block rounded bg-bg-tertiary px-1.5 py-0.5 text-[11px] text-text-muted">
            {t('agent.displayOnly')}
          </span>
        )}
      </div>
    </div>
  )
}

/** Check if a progress snapshot has any visible content. */
function showProgress(progress?: LiveProgress | null): boolean {
  if (!progress) return false
  return Boolean(
    progress.streaming ||
      progress.activeTools.length ||
      progress.completedTools.length ||
      progress.reasoningStreamContent ||
      progress.iteration
  )
}

export const AssistantMessage = memo(AssistantMessageImpl)
