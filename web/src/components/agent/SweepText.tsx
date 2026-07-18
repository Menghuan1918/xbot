import type { CSSProperties } from 'react'

import { cn } from '@/lib/utils'

interface SweepTextProps {
  text: string
  color?: string
  className?: string
}

type SweepStyle = CSSProperties & { '--sweep-color': string }

/** One-node, CSS-driven text sweep shared by live Agent status surfaces. */
export function SweepText({ text, color = 'var(--text-primary)', className }: SweepTextProps) {
  return (
    <span
      className={cn('sweep-text', className)}
      style={{ '--sweep-color': color } as SweepStyle}
      aria-label={text}
    >
      {text}
    </span>
  )
}
