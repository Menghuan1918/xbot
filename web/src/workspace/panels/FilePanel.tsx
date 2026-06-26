/**
 * FilePanel — file editor/preview panel (Spec 5).
 *
 * Replaces the Spec 2 placeholder. Decides how a file renders from its name:
 *
 *   - Markdown (.md/.markdown) → default preview, toggle to editor.
 *   - Image (.png/.jpg/.gif/.webp/.svg) → image preview, no toggle.
 *   - Everything else → Monaco editor, no toggle (only markdown is previewable).
 *
 * Content is front-end only (Spec 5 §2): edits live in component state and are
 * not persisted. `useFileContent` supplies mock content per extension; swapping
 * in a real file API later only touches that hook.
 */
import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'

import { MonacoEditor } from '@/components/file/MonacoEditor'
import { MarkdownPreview } from '@/components/file/MarkdownPreview'
import { ImagePreview } from '@/components/file/ImagePreview'
import { FileToolbar } from '@/components/file/FileToolbar'
import {
  canTogglePreview,
  defaultViewMode,
  isImageFile,
  languageOf,
  type FileViewMode,
} from '@/components/file/fileTypes'
import { useFileContent } from '@/hooks/useFileContent'
import type { PanelProps } from '@/workspace/panels/types'

/** "basename" of a posix path, defensive against undefined. */
function baseName(filePath?: string): string {
  if (!filePath) return 'untitled'
  const parts = filePath.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? filePath
}

export function FilePanel({ params }: PanelProps) {
  const filePath = params.filePath ?? ''
  const fileName = useMemo(() => baseName(filePath), [filePath])
  const isImage = isImageFile(fileName)
  const canToggle = canTogglePreview(fileName)
  const language = useMemo(() => languageOf(fileName), [fileName])

  const { content, loading, setContent, imageUrl } = useFileContent(filePath)
  const [mode, setMode] = useState<FileViewMode>(() => defaultViewMode(fileName))

  // Re-seed the view mode if the file ever changes (dockview reuses a panel
  // instance when its params update). Image files ignore `mode` entirely.
  useEffect(() => {
    setMode(defaultViewMode(fileName))
  }, [fileName])

  // Image files are preview-only and have no text content.
  if (isImage) {
    return (
      <div className="flex h-full flex-col bg-bg-primary">
        <FileToolbar fileName={fileName} mode="preview" canToggle={false} />
        {loading || !imageUrl ? (
          <PanelLoading />
        ) : (
          <ImagePreview src={imageUrl} fileName={fileName} className="flex-1" />
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-bg-primary">
      <FileToolbar
        fileName={fileName}
        mode={mode}
        onModeChange={canToggle ? setMode : undefined}
        canToggle={canToggle}
      />
      <div className="min-h-0 flex-1">
        {loading ? (
          <PanelLoading />
        ) : canToggle && mode === 'preview' ? (
          <MarkdownPreview source={content} />
        ) : (
          <MonacoEditor value={content} language={language} onChange={setContent} />
        )}
      </div>
    </div>
  )
}

function PanelLoading() {
  return (
    <div className="flex h-full items-center justify-center gap-2 text-text-secondary">
      <Loader2 className="size-4 animate-spin" />
      <span className="text-sm">Loading…</span>
    </div>
  )
}
