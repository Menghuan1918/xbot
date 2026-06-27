/**
 * AssistantMessage — renders one assistant message (Spec 4 §3.5).
 *
 * Left-aligned. Composed of:
 *   - optional ProgressPanel (live process surface: tools/reasoning/iteration),
 *   - the Markdown body (final or streamed text),
 *   - optional IterationHistory (committed runs, folded by default),
 *   - a small [display-only] tag for messages excluded from the LLM context.
 *
 * The component is `React.memo`'d with a custom comparator so toggling collapse
 * elsewhere never re-parses a sibling message's markdown. The streamed body
 * uses the throttled snapshot from useProgressStream, so it updates at frame
 * rate — not per token.
 */
import { memo } from 'react'
import { Bot } from 'lucide-react'

import { IterationHistory } from './IterationHistory'
import { MarkdownRenderer } from './MarkdownRenderer'
import { ProgressPanel } from './ProgressPanel'
import { useI18n } from '@/providers/i18n'
import { defaultOpenForLevel } from '@/hooks/useCollapseLevel'
import type { ChatMessage, LiveProgress } from '@/types/agent'

interface AssistantMessageProps {
  message: ChatMessage
  /** Live progress for a streaming message; omitted for committed history. */
  progress?: LiveProgress | null
  /** Collapse level controlling default-open for iteration history. */
  collapseLevel: 'all' | 'minimal' | 'none'
}

function AssistantMessageImpl({ message, progress, collapseLevel }: AssistantMessageProps) {
  const { t } = useI18n()
  const showProgress = Boolean(progress && (progress.streaming || progress.activeTools.length || progress.completedTools.length || progress.reasoningContent || progress.iteration))
  const iterations = message.iterations ?? progress?.iterationHistory ?? []
  const iterationDefaultOpen = defaultOpenForLevel(collapseLevel, 'iteration')
  const reasoningDefaultOpen = defaultOpenForLevel(collapseLevel, 'reasoning')
  const toolDefaultOpen = defaultOpenForLevel(collapseLevel, 'tool')

  return (
    <div className="agent-msg-card flex gap-2.5 px-1">
      <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-accent/15">
        <Bot className="size-4 text-accent" />
      </div>
      <div className="min-w-0 flex-1">
        {showProgress && progress && (
          <ProgressPanel
            progress={progress}
            defaultOpenTool={toolDefaultOpen}
            defaultOpenReasoning={reasoningDefaultOpen}
          />
        )}
        {message.content ? (
          <MarkdownRenderer content={message.content} />
        ) : (
          // Pure tool-only turn with no final text: show a subtle hint.
          !showProgress && (
            <span className="text-sm text-text-muted">{t('agent.emptyAssistant')}</span>
          )
        )}
        {!showProgress && iterations.length > 0 && (
          <div className="mt-2">
            <IterationHistory iterations={iterations} defaultOpen={iterationDefaultOpen} />
          </div>
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

export const AssistantMessage = memo(AssistantMessageImpl)
