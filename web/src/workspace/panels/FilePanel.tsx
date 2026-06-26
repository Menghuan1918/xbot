/**
 * FilePanel — file editor shell (Spec 2 §3.7).
 *
 * Placeholder; the Monaco editor + Markdown/image preview lands in Spec 5.
 * `params.filePath` is surfaced so Spec 5 can open the real file.
 */
import { FileText } from 'lucide-react'
import type { PanelProps } from './types'

export function FilePanel({ params }: PanelProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-text-secondary">
      <FileText className="size-8 opacity-50" />
      <p className="text-sm">{`File editor — Spec 5${params.filePath ? ` · ${params.filePath}` : ''}`}</p>
    </div>
  )
}
