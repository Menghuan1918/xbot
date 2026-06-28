/**
 * ShimmerThinking — a sliding gradient light band that appears at the
 * bottom of the agent output during streaming, with "正在思考..." text.
 *
 * Uses CSS @keyframes shimmer animation (left-to-right gradient sweep).
 */
import { memo } from 'react'

import { useI18n } from '@/providers/i18n'

export const ShimmerThinking = memo(function ShimmerThinking() {
  const { t } = useI18n()
  return (
    <div
      className="relative mt-2 overflow-hidden rounded px-3 py-2"
      style={{
        background: 'var(--bg-tertiary, rgba(128,128,128,0.08))',
      }}
    >
      {/* Shimmer gradient overlay */}
      <div className="shimmer-overlay" />
      <span className="relative text-xs text-text-muted">
        {t('agent.reasoningStreaming')}
      </span>
    </div>
  )
})
