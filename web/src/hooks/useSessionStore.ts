/**
 * useSessionStore — session state skeleton (Spec 2 §3.6, fleshed out in Spec 3).
 *
 * This is the basic version: holds session list, active id, starred ids
 * (persisted to localStorage), and the current category. createSession /
 * switchSession wire the REST endpoints + WS subscribe/set_cwd so the skeleton
 * is end-to-end functional; the rich list UI and data refresh land in Spec 3.
 *
 * Backend contracts:
 *   POST /api/chats {label}        → { ok, chat_id }
 *   POST /api/chats/{chatID}/switch → { ok, chat_id, channel }
 *   RPC set_cwd { channel, chat_id, dir }
 *   WS  subscribe { type:'subscribe', chat_id }
 */
import { useCallback, useState } from 'react'
import { useWSConnection } from '@/hooks/useWSConnection'
import type { SessionCategory, SessionInfo } from '@/types/shared'

const STARRED_KEY = 'xbot-starred'
const CHANNEL = 'web'

interface CreateChatResponse {
  ok: boolean
  chat_id?: string
}
interface SwitchChatResponse {
  ok: boolean
  chat_id?: string
  channel?: string
}

function loadStarred(): string[] {
  try {
    const raw = localStorage.getItem(STARRED_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : null
    if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === 'string')
  } catch { /* ignore */ }
  return []
}

function persistStarred(ids: string[]): void {
  try {
    localStorage.setItem(STARRED_KEY, JSON.stringify(ids))
  } catch { /* ignore */ }
}

export interface SessionStore {
  sessions: SessionInfo[]
  activeSessionId: string | null
  starredIds: string[]
  category: SessionCategory
  setCategory: (c: SessionCategory) => void
  toggleStar: (id: string) => void
  /** Create a chatroom, optionally set its working dir, switch to it. */
  createSession: (label?: string, workPath?: string) => Promise<string | null>
  /** Switch to an existing chatroom + resubscribe the WS connection. */
  switchSession: (id: string) => Promise<void>
  /** Replace the session list (Spec 3 will fetch from /api/chats). */
  setSessions: (sessions: SessionInfo[]) => void
}

export function useSessionStore(): SessionStore {
  const ws = useWSConnection()
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [starredIds, setStarredIds] = useState<string[]>(loadStarred)
  const [category, setCategory] = useState<SessionCategory>('all')

  const toggleStar = useCallback((id: string) => {
    setStarredIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      persistStarred(next)
      return next
    })
  }, [])

  const createSession = useCallback(
    async (label?: string, workPath?: string): Promise<string | null> => {
      let chatID: string
      try {
        const res = await fetch('/api/chats', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ label: label ?? '' }),
        })
        const data = (await res.json()) as CreateChatResponse
        if (!res.ok || !data.chat_id) return null
        chatID = data.chat_id
      } catch {
        return null
      }
      // Optionally set the working directory for the new session.
      if (workPath) {
        try {
          await ws.rpc('set_cwd', { channel: CHANNEL, chat_id: chatID, dir: workPath })
        } catch {
          /* non-fatal: session still created */
        }
      }
      ws.subscribe(chatID)
      setActiveSessionId(chatID)
      return chatID
    },
    [ws],
  )

  const switchSession = useCallback(
    async (id: string): Promise<void> => {
      try {
        const res = await fetch(`/api/chats/${encodeURIComponent(id)}/switch`, {
          method: 'POST',
        })
        const data = (await res.json()) as SwitchChatResponse
        if (!res.ok || !data.ok) return
      } catch {
        return
      }
      ws.subscribe(id)
      setActiveSessionId(id)
    },
    [ws],
  )

  return {
    sessions,
    activeSessionId,
    starredIds,
    category,
    setCategory,
    toggleStar,
    createSession,
    switchSession,
    setSessions,
  }
}
