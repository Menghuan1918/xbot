/**
 * TerminalPanel — terminal shell panel.
 *
 * The backend has no PTY endpoint (terminal is out of scope per the main
 * design §2.2), so this stays an informational shell.
 */
import { SquareTerminal } from 'lucide-react'
import { useI18n } from '@/providers/i18n'
import type { PanelProps } from './types'

export function TerminalPanel(_: PanelProps) {
  const { t } = useI18n()
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-text-secondary">
      <SquareTerminal className="size-8 opacity-50" />
      <p className="text-sm">{t('workspace.terminalNotAvailable')}</p>
    </div>
  )
}
