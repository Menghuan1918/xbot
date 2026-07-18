/**
 * ShimmerThinking — bold borderless "正在思考" text with a character-by-character
 * shimmer sweep effect (each character lights up in sequence, loop).
 */
import { memo } from 'react'

import { useI18n } from '@/providers/i18n'
import { SweepText } from './SweepText'

export const ShimmerThinking = memo(function ShimmerThinking() {
  const { t } = useI18n()
  const text = t('agent.reasoningStreaming') // "思考中…" / "thinking…"

  return (
    <div className="mt-2">
      <SweepText text={text} className="text-sm font-bold" />
    </div>
  )
})
