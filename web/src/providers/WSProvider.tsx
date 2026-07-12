/**
 * WSProvider — compatibility-named provider for the REST + SSE connection.
 *
 * Wrap the app once (inside ThemeProvider/I18nProvider). The active session
 * opens the EventSource; native reconnects update `connected` while the
 * underlying connection instance remains stable across renders.
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { SSEConnectionImpl } from '@/providers/sseConnection'
import type { WSConnection } from '@/types/ws'

export const WSContext = createContext<WSConnection | undefined>(undefined)

export function WSProvider({ children }: { children: ReactNode }) {
  // One connection for the provider's lifetime; never recreated on re-render.
  const connRef = useRef<SSEConnectionImpl | null>(null)
  if (connRef.current === null) {
    connRef.current = new SSEConnectionImpl()
  }
  const conn = connRef.current

  // Re-render on connection-state flips so consumers can read live status.
  const [connected, setConnected] = useState(conn.connected)
  const [chatID, setChatID] = useState<string | null>(conn.chatID)

  useEffect(() => {
    const offConn = conn.onConnectionChange(setConnected)
    // The connection is created eagerly; track its initial state too.
    setConnected(conn.connected)
    return () => {
      offConn()
      conn.dispose()
      connRef.current = null
    }
  }, [conn])

  // Keep chatID reactive for the `chatID` field on the context value.
  useEffect(() => {
    const off = conn.onMessage((m) => {
      if (m.type === 'session' && m.session?.chat_id) setChatID(m.session.chat_id)
    })
    return off
  }, [conn])

  const value = useMemo<WSConnection>(
    () => ({
      connected,
      send: (msg) => conn.send(msg),
      subscribe: (id, channel) => {
        conn.subscribe(id, channel)
        setChatID(id)
      },
      disconnect: () => {
        conn.disconnect()
        setChatID(null)
      },
      rpc: (method, params) => conn.rpc(method, params),
      chatID,
      setLastSeq: (seq: number) => conn.setLastSeq(seq),
      onMessage: conn.onMessage,
      onSession: conn.onSession,
      onProgress: conn.onProgress,
      onConnectionChange: conn.onConnectionChange,
    }),
    [chatID, conn, connected],
  )

  return <WSContext.Provider value={value}>{children}</WSContext.Provider>
}

export function useWSConnection(): WSConnection {
  const ctx = useContext(WSContext)
  if (!ctx) {
    throw new Error('useWSConnection must be used within a <WSProvider>')
  }
  return ctx
}
