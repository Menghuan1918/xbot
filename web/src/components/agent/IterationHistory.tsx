/**
 * IterationHistory — collapsed-by-default list of iteration snapshots, each
 * showing its reasoning + the tools it ran (Spec 4 §3.3, §3.5).
 *
 * The whole history is itself a collapsible card (the top-level fold in §3.3).
 * Inside, every iteration is a nested collapsible showing its reasoning block
 * and tool-call blocks. Default-fold respects the global collapse level.
 */
import { memo } from 'react'
import { History } from 'lucide-react'

import { CollapsibleCard } from './CollapsibleCard'
import { ReasoningBlock } from './ReasoningBlock'
import { ToolCallBlock } from './ToolCallBlock'
import { useI18n } from '@/providers/i18n'
import type { IterationSnapshot } from '@/types/agent'

interface IterationHistoryProps {
  iterations: IterationSnapshot[]
  defaultOpen?: boolean
  /** Per-iteration default-open (defaults to the same as the container's opposite). */
  iterationDefaultOpen?: boolean
}

export const IterationHistory = memo(function IterationHistory({
  iterations,
  defaultOpen = false,
  iterationDefaultOpen = false,
}: IterationHistoryProps) {
  const { t } = useI18n()
  if (!iterations.length) return null

  return (
    <CollapsibleCard
      defaultOpen={defaultOpen}
      icon={<History className="size-3.5" />}
      aria-label={t('agent.iterations')}
      title={
        <span className="flex items-center gap-1.5">
          <span>{t('agent.iterations')}</span>
          <span className="rounded-full bg-bg-tertiary px-1.5 text-[11px] text-text-muted">
            {iterations.length}
          </span>
        </span>
      }
      bodyClassName="p-2"
    >
      <div className="flex flex-col gap-1.5">
        {iterations.map((iter) => (
          <IterationItem
            key={iter.iteration}
            iteration={iter}
            defaultOpen={iterationDefaultOpen}
          />
        ))}
      </div>
    </CollapsibleCard>
  )
})

interface IterationItemProps {
  iteration: IterationSnapshot
  defaultOpen?: boolean
}

const IterationItem = memo(function IterationItem({
  iteration,
  defaultOpen = false,
}: IterationItemProps) {
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
        </span>
      }
      bodyClassName="p-2"
    >
      <div className="flex flex-col gap-1.5">
        {iteration.thinking && <ReasoningBlock content={iteration.thinking} defaultOpen={false} />}
        {iteration.reasoning && <ReasoningBlock content={iteration.reasoning} defaultOpen={false} />}
        {toolCount > 0 && (
          <div className="flex flex-col gap-1">
            {iteration.tools.map((tool, i) => (
              <ToolCallBlock key={`${iteration.iteration}-${i}`} tool={tool} index={i} />
            ))}
          </div>
        )}
      </div>
    </CollapsibleCard>
  )
})
