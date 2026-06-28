/**
 * FoldedLine — borderless collapsible row using ▸/▾ arrows (Spec 4 §3.3).
 *
 * Replaces CollapsibleCard for the three-level folding model. No borders, no
 * background — just a clickable toggle line with an arrow indicator. Content
 * indents 16px when expanded. All sibling folds are at the same visual level.
 */
import { memo, useState, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface FoldedLineProps {
  /** Clickable label text shown after the arrow. */
  title: ReactNode
  /** Content rendered when open (indented 16px). */
  children?: ReactNode
  /** Start open (uncontrolled). */
  defaultOpen?: boolean
  /** Optional callback on toggle. */
  onToggle?: (open: boolean) => void
  /** Extra classes on the toggle button line. */
  className?: string
  /** Extra classes on the content container. */
  contentClassName?: string
}

export const FoldedLine = memo(function FoldedLine({
  title,
  children,
  defaultOpen = false,
  onToggle,
  className,
  contentClassName,
}: FoldedLineProps) {
  const [open, setOpen] = useState(defaultOpen)

  const handleToggle = () => {
    const next = !open
    setOpen(next)
    onToggle?.(next)
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={open}
        className={cn(
          'flex items-center gap-1 border-none bg-transparent px-0 py-1 text-left text-xs',
          'cursor-pointer text-text-secondary hover:text-text-primary transition-colors',
        )}
      >
        <span className="shrink-0 text-text-muted select-none">{open ? '▾' : '▸'}</span>
        <span className="min-w-0 flex-1 truncate">{title}</span>
      </button>
      {open && children && (
        <div className={cn('ml-4 fold-content', contentClassName)}>{children}</div>
      )}
    </div>
  )
})
