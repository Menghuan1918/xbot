/**
 * useFileTree — fetches the file tree for the current working directory.
 *
 * Uses the REST API (GET /api/fs/list) via useFileSystem's listDir() to
 * fetch directory entries. Builds a nested FileNode[] tree from the flat
 * results. Auto-refreshes when the CWD changes.
 */
import { useCallback, useEffect, useState } from 'react'

import { useCwd } from '@/providers/CwdProvider'
import { flattenFiles, type FileNode } from '@/types/file'
import { invalidateFsCache, listDir, joinPath } from '@/hooks/useFileSystem'

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

/** Build a nested FileNode[] by recursively listing directories (lazy: 2 levels). */
async function buildTree(cwd: string): Promise<FileNode[]> {
  const entries = await listDir(cwd)
  const nodes: FileNode[] = []
  for (const entry of entries) {
    const path = joinPath(cwd, entry.name)
    const node: FileNode = {
      name: entry.name,
      path,
      type: entry.isDir ? 'directory' : 'file',
    }
    if (entry.isDir) {
      // Lazy: don't recurse automatically — children will be loaded on expand.
      // But pre-load first level for a better UX.
      try {
        const children = await listDir(path)
        node.children = children.map((child) => {
          const childPath = joinPath(path, child.name)
          const childNode: FileNode = {
            name: child.name,
            path: childPath,
            type: child.isDir ? 'directory' : 'file',
          }
          return childNode
        })
      } catch {
        node.children = []
      }
    }
    nodes.push(node)
  }
  return nodes
}

export function useFileTree(): UseFileTreeResult {
  const { cwd } = useCwd()
  const [tree, setTree] = useState<FileNode[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!cwd) return
    setLoading(true)
    setError(null)
    try {
      invalidateFsCache()
      const result = await buildTree(cwd)
      setTree(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setTree([])
    } finally {
      setLoading(false)
    }
  }, [cwd])

  // Re-fetch when the CWD changes.
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
