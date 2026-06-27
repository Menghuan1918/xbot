/**
 * useFileContent — file content loader backed by GET /api/fs/read (Spec §3.8).
 *
 * Replaces the previous mock implementation. Handles:
 *   - Text files: returns content + language for Monaco
 *   - Binary files: sets isBinary=true, content stays empty (UI shows "Binary file")
 *   - Image files: fetches a blob URL for ImagePreview
 *
 * State shape (kept identical to the mock version so FilePanel doesn't change):
 *   - `content`  — current text (editable; FilePanel writes back via setContent)
 *   - `loading`  — true during the async load
 *   - `setContent` — imperative setter for the editor's onChange path
 *   - `imageUrl` — resolved image src (blob URL), or null
 *   - `isBinary` — true when the backend reports a binary file
 *   - `language` — Monaco language id from the backend (or extension fallback)
 */
import { useCallback, useEffect, useState } from 'react'

import { isImageFile, languageOf } from '@/components/file/fileTypes'
import { readFile, fetchImageBlobUrl } from '@/hooks/useFileSystem'

export interface UseFileContentResult {
  content: string
  loading: boolean
  setContent: (next: string) => void
  imageUrl: string | null
  isBinary: boolean
  language: string
}

export function useFileContent(filePath: string): UseFileContentResult {
  const [content, setContent] = useState('')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [isBinary, setIsBinary] = useState(false)
  const [language, setLanguage] = useState('plaintext')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    // For image files, fetch a blob URL instead of JSON content.
    if (isImageFile(filePath)) {
      fetchImageBlobUrl(filePath)
        .then((url) => {
          if (cancelled) {
            URL.revokeObjectURL(url)
            return
          }
          setImageUrl(url)
          setContent('')
          setIsBinary(false)
          setLanguage(languageOf(filePath))
          setLoading(false)
        })
        .catch(() => {
          if (cancelled) return
          setImageUrl(null)
          setLoading(false)
        })
    } else {
      readFile(filePath)
        .then((res) => {
          if (cancelled) return
          if (res.isBinary) {
            setContent('')
            setIsBinary(true)
            setLanguage('plaintext')
          } else {
            setContent(res.content)
            setIsBinary(false)
            setLanguage(res.language || languageOf(filePath))
          }
          setImageUrl(null)
          setLoading(false)
        })
        .catch(() => {
          if (cancelled) return
          setLoading(false)
        })
    }

    return () => {
      cancelled = true
    }
  }, [filePath])

  // Revoke the object URL when the path changes or component unmounts.
  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl)
    }
  }, [imageUrl])

  const setContentFn = useCallback((next: string) => setContent(next), [])

  return {
    content,
    loading,
    setContent: setContentFn,
    imageUrl,
    isBinary,
    language,
  }
}
