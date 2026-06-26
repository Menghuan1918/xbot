/**
 * TerminalPanel — terminal shell (Spec 2 §3.7).
 *
 * Pure placeholder; the backend has no PTY endpoint (terminal is out of scope
 * per the main design §2.2), so this stays an empty shell indefinitely.
 */
import { SquareTerminal } from 'lucide-react'
import type { PanelProps } from './types'

export function TerminalPanel(_: PanelProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-text-secondary">
      <SquareTerminal className="size-8 opacity-50" />
      <p className="text-sm">Terminal — placeholder</p>
    </div>
  )
}
