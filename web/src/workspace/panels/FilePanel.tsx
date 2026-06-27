/**
 * FilePanel — file editor/preview panel (Spec 5).
 *
 * Decides how a file renders from its name:
 *
 *   - Markdown (.md/.markdown) → default preview, toggle to editor.
 *   - Image (.png/.jpg/.gif/.webp/.svg) → image preview, no toggle.
 *   - Binary → "Binary file" notice, no editor.
 *   - Everything else → Monaco editor, no toggle (only markdown is previewable).
 *
 * `useFileContent` fetches real content from GET /api/fs/read. Edits live in
 * component state and are not persisted.
 */
import { useEffect, useMemo, useState } from 'react'
import { Loader2, FileText } from 'lucide-react'

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
import { useI18n } from '@/providers/i18n'
import type { PanelProps } from '@/workspace/panels/types'

/** "basename" of a posix path, defensive against undefined. */
function baseName(filePath?: string): string {
  if (!filePath) return 'untitled'
  const parts = filePath.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? filePath
}

export function FilePanel({ params }: PanelProps) {
  const { t } = useI18n()
  const filePath = params.filePath ?? ''
  const fileName = useMemo(() => baseName(filePath), [filePath])
  const isImage = isImageFile(fileName)
  const canToggle = canTogglePreview(fileName)
  const extLanguage = useMemo(() => languageOf(fileName), [fileName])

  const { content, loading, setContent, imageUrl, isBinary, language: apiLanguage } =
    useFileContent(filePath)
  const [mode, setMode] = useState<FileViewMode>(() => defaultViewMode(fileName))

  // Prefer the backend-reported language (it knows the true type); fall back to
  // extension-based detection for files opened before the API responds.
  const monacoLanguage = apiLanguage || extLanguage

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
        ) : isBinary ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-text-secondary">
            <FileText className="size-10 opacity-40" />
            <span className="text-sm">{t('file.binaryFile')}</span>
            <span className="text-xs text-text-muted">{fileName}</span>
          </div>
        ) : canToggle && mode === 'preview' ? (
          <MarkdownPreview source={content} />
        ) : (
          <MonacoEditor value={content} language={monacoLanguage} onChange={setContent} />
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
