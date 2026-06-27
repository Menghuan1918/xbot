/**
 * CwdProvider — React context that owns the current working directory (CWD).
 *
 * Two sources keep CWD in sync:
 *   1. WS RPC `get_cwd` — fetched on mount and on session switch (chatID change)
 *   2. Progress events — the backend includes a `cwd` field in ProgressEvent
 *      when the agent changes directory (via the Cd tool). We listen for it
 *      and update the context value in real time.
 *
 * Consumers: FileExplorer (root directory), PathPicker (initial value),
 * FileSearch (search root), NewSessionDialog (default work path).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useWSConnection } from '@/hooks/useWSConnection'
import { invalidateFsCache } from '@/hooks/useFileSystem'

export interface CwdContextValue {
  /** Current working directory (absolute path), or null while loading. */
  cwd: string | null
  /** Manually set CWD (e.g. when user types in PathPicker). */
  setCwd: (dir: string) => void
  /** Re-fetch CWD from the server via WS RPC get_cwd. */
  refreshCwd: () => Promise<void>
  /** True while the initial CWD fetch is in flight. */
  loading: boolean
}

const CwdContext = createContext<CwdContextValue | undefined>(undefined)

export function CwdProvider({ children }: { children: ReactNode }) {
  const ws = useWSConnection()
  const [cwd, setCwdState] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const lastChatID = useRef<string | null>(null)

  const fetchCwd = useCallback(async () => {
    if (!ws.connected) return
    try {
      const res = await ws.rpc<{ dir?: string }>('get_cwd')
      if (res?.dir) {
        setCwdState(res.dir)
      }
    } catch {
      // Non-fatal: keep previous CWD or null.
    } finally {
      setLoading(false)
    }
  }, [ws])

  // Fetch CWD on mount and when the subscribed chatID changes.
  useEffect(() => {
    const currentChatID = ws.chatID
    if (currentChatID !== lastChatID.current) {
      lastChatID.current = currentChatID
      void fetchCwd()
    }
  }, [ws.chatID, fetchCwd])

  // Listen for CWD changes in progress events (agent Cd tool).
  useEffect(() => {
    return ws.onProgress((event) => {
      if (event.cwd && event.cwd !== cwd) {
        setCwdState(event.cwd)
        invalidateFsCache()
      }
    })
  }, [ws, cwd])

  const setCwd = useCallback((dir: string) => {
    setCwdState(dir)
    invalidateFsCache()
  }, [])

  const refreshCwd = useCallback(async () => {
    setLoading(true)
    await fetchCwd()
  }, [fetchCwd])

  return (
    <CwdContext.Provider value={{ cwd, setCwd, refreshCwd, loading }}>
      {children}
    </CwdContext.Provider>
  )
}

export function useCwd(): CwdContextValue {
  const ctx = useContext(CwdContext)
  if (!ctx) {
    throw new Error('useCwd must be used within a <CwdProvider>')
  }
  return ctx
}
