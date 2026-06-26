/**
 * useSessionStore — session list state + data layer (Spec 3).
 *
 * Responsibilities:
 *   - fetch & refresh the chat list (GET /api/chats?channel=<channel>)
 *   - derive session status from WS events:
 *       session.action 'busy'   → running
 *       session.action 'idle'   → idle
 *       ask_user message        → waiting_input
 *       (any error msg)         → error  (best-effort; not in scope UI)
 *   - star persistence (localStorage, Spec 3 §3.3)
 *   - create / switch / rename / delete via REST, with WS subscribe + set_cwd
 *
 * Backend contracts (channel/web/web_api.go):
 *   GET    /api/chats?channel=<ch>           → { ok, chats: UserChatWithPreview[] }
 *   POST   /api/chats {label}                → { ok, chat_id }
 *   POST   /api/chats/{id}/switch[?channel=]  → { ok, chat_id, channel }
 *   POST   /api/chats/{id}/rename {label}    → { ok }
 *   DELETE /api/chats/{id}                    → { ok }
 *   RPC    set_cwd { channel, chat_id, dir }
 *   WS     subscribe { type:'subscribe', chat_id }
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useWSConnection } from '@/hooks/useWSConnection'
import { groupSessions, sortSessions } from '@/lib/session-grouping'
import type { SessionCategory, SessionInfo, SessionStatus } from '@/types/shared'

const STARRED_KEY = 'xbot-starred'
const DEFAULT_CHANNEL = 'web'

/** WSMessage shape we care about here (avoids importing the full envelope). */
interface AskUserEnvelope {
  type: string
  chat_id?: string
}

export interface SessionGroup {
  key: string
  sessions: SessionInfo[]
}

export interface SessionStore {
  sessions: SessionInfo[]
  groups: SessionGroup[]
  /** Flat list, sorted (starred-first, lastActive-desc) — used by search. */
  sortedSessions: SessionInfo[]
  activeSessionId: string | null
  starredIds: string[]
  category: SessionCategory
  channel: string
  loading: boolean
  error: string | null
  setCategory: (c: SessionCategory) => void
  setChannel: (c: string) => void
  refresh: () => Promise<void>
  toggleStar: (id: string) => void
  createSession: (label?: string, workPath?: string) => Promise<string | null>
  switchSession: (id: string, channel?: string) => Promise<void>
  renameSession: (id: string, label: string) => Promise<boolean>
  deleteSession: (id: string) => Promise<boolean>
}

/* ── localStorage starred ids ── */

function loadStarred(): string[] {
  try {
    const raw = localStorage.getItem(STARRED_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : null
    if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === 'string')
  } catch {
    /* ignore */
  }
  return []
}

function persistStarred(ids: string[]): void {
  try {
    localStorage.setItem(STARRED_KEY, JSON.stringify(ids))
  } catch {
    /* ignore */
  }
}

/* ── API responses ── */

interface ListChatsResponse {
  ok: boolean
  chats?: RawChat[]
}
interface RawChat {
  chat_id: string
  channel?: string
  label: string
  last_active: string
  preview?: string
  is_current?: boolean
}
interface CreateChatResponse {
  ok: boolean
  chat_id?: string
}
interface SwitchChatResponse {
  ok: boolean
  chat_id?: string
  channel?: string
}

/** Normalize a raw backend chat into a SessionInfo (default status 'idle'). */
function toSessionInfo(c: RawChat, channel: string): SessionInfo {
  return {
    chatID: c.chat_id,
    channel: c.channel || channel,
    label: c.label,
    lastActive: c.last_active,
    preview: c.preview || '',
    status: 'idle',
    isCurrent: !!c.is_current,
  }
}

export function useSessionStore(): SessionStore {
  const ws = useWSConnection()
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [starredIds, setStarredIds] = useState<string[]>(loadStarred)
  const [category, setCategory] = useState<SessionCategory>('all')
  const [channel, setChannel] = useState<string>(DEFAULT_CHANNEL)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Keep the latest session list available to WS handlers without re-binding.
  const sessionsRef = useRef(sessions)
  sessionsRef.current = sessions
  const channelRef = useRef(channel)
  channelRef.current = channel

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/chats?channel=${encodeURIComponent(channelRef.current)}`)
      const data = (await res.json()) as ListChatsResponse
      if (!res.ok || !data.ok) {
        setError('failed to load chats')
        return
      }
      const ch = channelRef.current
      const next = (data.chats || []).map((c) => toSessionInfo(c, ch))
      setSessions((prev) => mergeStatus(prev, next))
      const current = next.find((s) => s.isCurrent)
      if (current) setActiveSessionId(current.chatID)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'network error')
    } finally {
      setLoading(false)
    }
  }, [])

  /* Preserve live status/activeSessionId across refresh: a fresh fetch resets
   * every row to 'idle', so carry over the inferred status keyed by chatID. */
  function mergeStatus(prev: SessionInfo[], next: SessionInfo[]): SessionInfo[] {
    if (prev.length === 0) return next
    const statusBy = new Map(prev.map((s) => [s.chatID, s.status]))
    return next.map((s) => (statusBy.has(s.chatID) ? { ...s, status: statusBy.get(s.chatID)! } : s))
  }

  const toggleStar = useCallback((id: string) => {
    setStarredIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      persistStarred(next)
      return next
    })
  }, [])

  const setStatus = useCallback((chatID: string, status: SessionStatus) => {
    setSessions((prev) => prev.map((s) => (s.chatID === chatID ? { ...s, status } : s)))
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
      if (workPath) {
        try {
          await ws.rpc('set_cwd', { channel: DEFAULT_CHANNEL, chat_id: chatID, dir: workPath })
        } catch {
          /* non-fatal: session still created */
        }
      }
      ws.subscribe(chatID)
      setActiveSessionId(chatID)
      // Optimistic insert so the new session appears immediately; refresh reconciles.
      setSessions((prev) => [
        {
          chatID,
          channel: DEFAULT_CHANNEL,
          label: label || chatID,
          lastActive: new Date().toISOString(),
          preview: '',
          status: 'idle',
          isCurrent: true,
        },
        ...prev.map((s) => ({ ...s, isCurrent: false })),
      ])
      void refresh()
      return chatID
    },
    [ws, refresh],
  )

  const switchSession = useCallback(
    async (id: string, ch?: string): Promise<void> => {
      const useChannel = ch ?? channelRef.current
      try {
        const res = await fetch(
          `/api/chats/${encodeURIComponent(id)}/switch?channel=${encodeURIComponent(useChannel)}`,
          { method: 'POST' },
        )
        const data = (await res.json()) as SwitchChatResponse
        if (!res.ok || !data.ok) return
      } catch {
        return
      }
      ws.subscribe(id)
      setActiveSessionId(id)
      setSessions((prev) => prev.map((s) => ({ ...s, isCurrent: s.chatID === id })))
    },
    [ws],
  )

  const renameSession = useCallback(async (id: string, label: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/chats/${encodeURIComponent(id)}/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
      })
      const data = (await res.json()) as { ok: boolean }
      if (!res.ok || !data.ok) return false
    } catch {
      return false
    }
    setSessions((prev) => prev.map((s) => (s.chatID === id ? { ...s, label } : s)))
    return true
  }, [])

  const deleteSession = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        const res = await fetch(`/api/chats/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        })
        const data = (await res.json()) as { ok: boolean }
        if (!res.ok || !data.ok) return false
      } catch {
        return false
      }
      setSessions((prev) => prev.filter((s) => s.chatID !== id))
      setStarredIds((prev) => {
        if (!prev.includes(id)) return prev
        const next = prev.filter((x) => x !== id)
        persistStarred(next)
        return next
      })
      if (activeSessionId === id) setActiveSessionId(null)
      return true
    },
    [activeSessionId],
  )

  /* ── WS-driven status inference ── */

  // session events: busy → running, idle → idle, deleted → remove, renamed → label
  useEffect(() => {
    return ws.onSession((ev) => {
      const chatID = ev.chat_id
      if (!chatID) return
      switch (ev.action) {
        case 'busy':
          setStatus(chatID, 'running')
          break
        case 'idle':
          setStatus(chatID, 'idle')
          break
        case 'deleted':
          setSessions((prev) => prev.filter((s) => s.chatID !== chatID))
          break
        case 'renamed':
          if (ev.label)
            setSessions((prev) =>
              prev.map((s) => (s.chatID === chatID ? { ...s, label: ev.label! } : s)),
            )
          break
        case 'created':
          void refresh()
          break
        default:
          break
      }
    })
  }, [ws, setStatus, refresh])

  // ask_user → waiting_input (carries chat_id on the message envelope)
  useEffect(() => {
    return ws.onMessage((msg) => {
      if (msg.type !== 'ask_user') return
      const chatID = (msg as AskUserEnvelope).chat_id
      if (chatID) setStatus(chatID, 'waiting_input')
    })
  }, [ws, setStatus])

  // Initial load. Re-fetch when channel changes (e.g. admin switching channel view).
  useEffect(() => {
    void refresh()
  }, [refresh, channel])

  const sortedSessions = sortSessions(sessions, starredIds)
  const groups = groupSessions(sessions, category, starredIds)

  return {
    sessions,
    groups,
    sortedSessions,
    activeSessionId,
    starredIds,
    category,
    channel,
    loading,
    error,
    setCategory,
    setChannel,
    refresh,
    toggleStar,
    createSession,
    switchSession,
    renameSession,
    deleteSession,
  }
}
