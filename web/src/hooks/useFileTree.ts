/**
 * useFileTree — fetches the file tree for the current working directory.
 *
 * Calls the `list_files` WS RPC (serverapp/rpc_table.go) when the WS is
 * connected and the CWD is available. Auto-refreshes when the CWD changes
 * (via the CwdProvider) so the browser/search always reflect the agent's
 * working directory.
 */
import { useCallback, useEffect, useState } from 'react'

import { useCwd } from '@/providers/CwdProvider'
import { useWSConnection } from '@/hooks/useWSConnection'
import { flattenFiles, type FileNode } from '@/types/file'

interface UseFileTreeResult {
  /** Nested file tree from the CWD root. */
  tree: FileNode[]
  /** Flattened file leaves (for search). */
  flatFiles: FileNode[]
  loading: boolean
  error: string | null
  /** Manually reload the tree. */
  reload: () => void
}

interface ListFilesResponse {
  entries?: FileNode[]
}

export function useFileTree(): UseFileTreeResult {
  const ws = useWSConnection()
  const { cwd } = useCwd()
  const [tree, setTree] = useState<FileNode[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!ws.connected || !cwd) return
    setLoading(true)
    setError(null)
    try {
      const res = await ws.rpc<ListFilesResponse>('list_files', { path: '' })
      setTree(res?.entries ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setTree([])
    } finally {
      setLoading(false)
    }
  }, [ws, ws.connected, cwd])

  // Re-fetch when the WS connects or the CWD changes.
  useEffect(() => {
    void reload()
  }, [reload])

  const flatFiles = useCallback(() => flattenFiles(tree), [tree])

  return {
    tree,
    flatFiles: flatFiles(),
    loading,
    error,
    reload,
  }
}
