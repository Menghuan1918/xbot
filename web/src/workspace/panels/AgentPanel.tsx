/**
 * AgentPanel — Agent session workspace shell (Spec 2 §3.7).
 *
 * Placeholder only; real streaming/collapsed-process UI lands in Spec 4.
 * Receives the dockview panel params so Spec 4 can read `sessionId` without
 * changing the bridge. KISS: a centered hint is enough to verify the layout.
 */
import { Bot } from 'lucide-react'
import type { PanelProps } from './types'

export function AgentPanel({ params }: PanelProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-text-secondary">
      <Bot className="size-8 opacity-50" />
      <p className="text-sm">{`Agent workspace — Spec 4${params.sessionId ? ` (${params.sessionId})` : ''}`}</p>
    </div>
  )
}
