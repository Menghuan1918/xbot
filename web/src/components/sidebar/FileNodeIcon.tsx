/**
 * FileNodeIcon — renders the Lucide file-type icon for a file entry.
 *
 * Derives the language from the file extension (via `languageOf`) so it no
 * longer depends on a pre-populated `language` field. Directories are handled
 * by the caller (FolderOpen); this only handles file leaves.
 */
import { File, FileCode, FileJson, FileText, Hash } from 'lucide-react'
import { languageOf } from '@/components/file/fileTypes'

export interface FileNodeIconProps {
  /** File name (or full path) — used to infer the language via extension. */
  fileName: string
  className?: string
}

export function FileNodeIcon({ fileName, className = 'size-4 shrink-0 text-text-secondary' }: FileNodeIconProps) {
  const language = languageOf(fileName)
  switch (language) {
    case 'typescript':
    case 'javascript':
      return <FileCode className={className} />
    case 'json':
      return <FileJson className={className} />
    case 'markdown':
      return <FileText className={className} />
    case 'css':
      return <Hash className={className} />
    default:
      return <File className={className} />
  }
}
