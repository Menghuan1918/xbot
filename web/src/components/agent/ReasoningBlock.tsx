/**
 * ReasoningBlock — renders the agent's reasoning/thinking text, collapsed by
 * default (Spec 4 §3.3, §3.5).
 *
 * Collapsed: title + a "reasoning…" shimmer indicator while streaming, or the
 * first line otherwise. Expanded: full reasoning text rendered as Markdown
 * (non-streaming, so it re-parses only when the text reference changes).
 */
import { memo } from 'react'
import { BrainCircuit } from 'lucide-react'

import { CollapsibleCard } from './CollapsibleCard'
import { MarkdownRenderer } from './MarkdownRenderer'
import { useI18n } from '@/providers/i18n'

interface ReasoningBlockProps {
  content: string
  /** True while the reasoning is still being streamed (shows shimmer). */
  streaming?: boolean
  defaultOpen?: boolean
}

export const ReasoningBlock = memo(function ReasoningBlock({
  content,
  streaming = false,
  defaultOpen = false,
}: ReasoningBlockProps) {
  const { t } = useI18n()
  if (!content) return null
  const firstLine = content.split('\n')[0]?.slice(0, 80) ?? ''

  return (
    <CollapsibleCard
      defaultOpen={defaultOpen}
      icon={<BrainCircuit className="size-3.5" />}
      aria-label={t('agent.reasoning')}
      title={
        <span className="flex items-center gap-1.5">
          <span>{t('agent.reasoning')}</span>
          {streaming && (
            <span
              className="inline-flex items-center gap-1 text-[11px] text-text-muted"
              aria-label={t('agent.reasoningHint')}
            >
              <span
                className="size-1.5 rounded-full"
                style={{ backgroundColor: 'var(--status-running)' }}
              />
              <span>{t('agent.reasoningHint')}</span>
            </span>
          )}
        </span>
      }
      meta={streaming ? undefined : <span className="text-[11px] text-text-muted">{t('agent.thinking')}</span>}
      bodyClassName="px-2.5 py-2"
    >
      <MarkdownRenderer content={content} className="text-xs text-text-secondary" />
      {!defaultOpen && !streaming && firstLine && (
        <span className="sr-only">{firstLine}</span>
      )}
    </CollapsibleCard>
  )
})
