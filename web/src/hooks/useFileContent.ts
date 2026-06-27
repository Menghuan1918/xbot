/**
 * useFileContent — file content loader via the `read_file` WS RPC.
 *
 * Calls the backend `read_file` RPC (serverapp/rpc_table.go) to load file
 * content for the editor/preview components. The RPC reads from the session's
 * CWD, so the file path must be relative to the agent's working directory.
 *
 * State shape:
 *   - `content`  — current text (editable; FilePanel writes back via setContent)
 *   - `loading`  — true during the async RPC load
 *   - `setContent` — imperative setter for the editor's onChange path
 *   - `imageUrl` — reserved for future image support (null for now)
 */
import { useCallback, useEffect, useState } from 'react'

import { isImageFile } from '@/components/file/fileTypes'
import { useCwd } from '@/providers/CwdProvider'
import { useWSConnection } from '@/hooks/useWSConnection'

export interface UseFileContentResult {
  content: string
  loading: boolean
  error: string | null
  setContent: (next: string) => void
  imageUrl: string | null
}

interface ReadFileResponse {
  content?: string
  language?: string
}

export function useFileContent(filePath: string): UseFileContentResult {
  const ws = useWSConnection()
  const { cwd } = useCwd()
  const [content, setContent] = useState('')
  const [imageUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    // Image files are not text-loadable via the RPC; skip loading.
    if (isImageFile(filePath)) {
      setLoading(false)
      setContent('')
      return
    }

    if (!ws.connected || !cwd) {
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)
    ws
      .rpc<ReadFileResponse>('read_file', { path: filePath })
      .then((res) => {
        if (cancelled) return
        setContent(res?.content ?? '')
      })
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : String(e))
        setContent('')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [filePath, ws, ws.connected, cwd])

  const setContentFn = useCallback((next: string) => setContent(next), [])

  return { content, loading, error, setContent: setContentFn, imageUrl }
}
