import type {
  ChatMessage,
  ProgressEvent,
  SessionInfo,
} from '@/types/shared'

export const SESSION_TREE_CACHE_KEY = 'xbot_session_tree'

/** Per-conversation rendered messages. Keys may include channel/subagent identity. */
export const messagesCache = new Map<string, ChatMessage[]>()
/** Last SSE sequence processed for each business chat ID. */
export const lastSeqCache = new Map<string, number>()
/** Latest structured progress event for each business chat ID. */
export const progressSnapshotCache = new Map<string, ProgressEvent>()

interface StoredSessionTree {
  version: 1
  sessions: SessionInfo[]
  subAgents: SessionInfo[]
}

export function loadSessionTreeCache(): StoredSessionTree | null {
  try {
    const raw = localStorage.getItem(SESSION_TREE_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredSessionTree>
    if (parsed.version !== 1 || !Array.isArray(parsed.sessions) || !Array.isArray(parsed.subAgents)) {
      return null
    }
    return parsed as StoredSessionTree
  } catch {
    return null
  }
}

export function saveSessionTreeCache(sessions: SessionInfo[], subAgents: SessionInfo[]): void {
  const value: StoredSessionTree = { version: 1, sessions, subAgents }
  try {
    localStorage.setItem(SESSION_TREE_CACHE_KEY, JSON.stringify(value))
  } catch {
    // Storage may be unavailable or full; the in-memory state remains authoritative.
  }
}

export function getLastSeq(chatID: string): number {
  return lastSeqCache.get(chatID) ?? 0
}

export function setLastSeq(chatID: string, seq: number): void {
  if (seq > getLastSeq(chatID)) lastSeqCache.set(chatID, seq)
}

export function resetLastSeq(chatID: string): void {
  lastSeqCache.delete(chatID)
}

export function clearWebCaches(): void {
  localStorage.removeItem(SESSION_TREE_CACHE_KEY)
  messagesCache.clear()
  lastSeqCache.clear()
  progressSnapshotCache.clear()
}
