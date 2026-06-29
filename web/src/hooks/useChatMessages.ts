/**
 * useChatMessages — owns the committed chat message list for one Agent panel
 * (Spec 3/4 §3.8, §3.7).
 *
 * Responsibilities:
 *   - load history via GET /api/history and normalize rows into ChatMessage[]
 *     (parsing the `detail` JSON into WebIteration snapshots)
 *   - expose send / cancel / upload so the input area can drive the WS channel
 *   - append a committed assistant message when useProgressStream finalizes a
 *     run (onAssistantComplete), and echo user messages on send
 *   - dedup messages by (turnID, role) when turnID > 0 — prevents duplicate
 *     messages from PhaseDone + handleAgentMessage racing
 *
 * The hook does NOT own live streaming — that lives in useProgressStream. The
 * split keeps the high-frequency token stream out of the committed-list state
 * so the virtualized list only re-renders on real list changes (load / send /
 * finalize), never per token.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import {
  fetchHistory,
  uploadFile,
  type HistMsg,
  type HistProgress,
  type UploadResponse,
} from '@/components/agent/api'
import { parseWebIterations } from '@/components/agent/normalize'
import { dedupMessages } from '@/components/agent/progressStore'
import type { WSConnection } from '@/types/ws'
import type { ChatMessage, WebIteration } from '@/types/shared'
import type { WSMessage } from '@/types/shared'

interface UseChatMessagesOptions {
  /** Chat ID this list tracks. */
  chatID: string | null
  /** If true, history is (re)loaded whenever chatID changes. */
  enabled?: boolean
  /** The WS connection (injected from DockviewContext for isolated roots). */
  ws: WSConnection
}

export interface UseChatMessagesResult {
  messages: ChatMessage[]
  loading: boolean
  error: string | null
  /** Active progress snapshot from history (for resuming a busy session). */
  initialProgress: HistProgress | null
  /** The chat_id reported by the most recent history load (server's active chat). */
  resolvedChatID: string | null
  /** Reload history for the current chatID. */
  reload: () => Promise<void>
  /** Send a user message (+ optional uploaded file references). */
  sendMessage: (content: string, attachments?: Attachments) => void
  /** Cancel the running agent (sends a `cancel` WS message). */
  cancel: () => void
  /** Upload a file; returns the server upload metadata for sending with a message. */
  upload: (file: File) => Promise<UploadResponse>
  /** Append a finalized assistant message (called by useProgressStream). */
  appendAssistant: (content: string, iterations: WebIteration[]) => void
  /** Remove the trailing assistant message by id (for cancellation cleanup). */
  removeMessage: (id: string) => void
}

/** File references resolved from an upload, ready to attach to a message. */
export interface Attachments {
  uploadKeys: string[]
  fileNames: string[]
  fileSizes: number[]
  fileMimes: string[]
}

/**
 * Parse raw history rows into ChatMessage[], porting master's defensive logic:
 *
 * 1. Skip display_only messages (cron results, [interrupted] markers).
 * 2. Parse `detail` JSON into WebIteration[] for each message.
 * 3. Tool_calls fallback: if NO message in the entire history has a non-empty
 *    detail, synthesize iteration history from tool_calls — preserves tool
 *    visibility for cancelled/unsaved runs (master ChatPage.tsx:607-623).
 * 4. Compression tool summary stripping: clear content of assistant messages
 *    that are >500 chars, start with `- **ToolName**:`, and have no
 *    tool_calls/detail — these are LLM-context compression artifacts (master
 *    ChatPage.tsx:638-646).
 * 5. Broader empty filter: skip assistant messages with no content AND no
 *    iterations (master ChatPage.tsx:654).
 * 6. Merge consecutive tool_calls-only fallback messages into one message
 *    with sequential iteration numbers (master ChatPage.tsx:656-663).
 */
function parseHistoryMessages(rows: HistMsg[]): ChatMessage[] {
  // First pass: check if any message has a non-empty detail.
  const hasDetailInHistory = rows.some(
    (m) => m.detail && m.detail.trim() !== '' && m.detail.trim() !== '[]',
  )

  // Second pass: normalize each row, with tool_calls fallback if needed.
  const normalized: ChatMessage[] = []
  for (const m of rows) {
    // Skip display_only messages.
    if (m.display_only) continue

    // Parse iterations from detail (primary path).
    let iterations: WebIteration[] = parseWebIterations(m.detail ?? undefined)

    // Tool_calls fallback: if no message in history has detail, synthesize
    // iterations from tool_calls (preserves tool visibility for cancelled runs).
    if (
      !hasDetailInHistory &&
      m.role === 'assistant' &&
      m.tool_calls &&
      (!m.content || m.content.trim() === '')
    ) {
      iterations = synthesizeIterationsFromToolCalls(m.tool_calls)
    }

    // Compression tool summary stripping: clear content if it's a compression
    // artifact (starts with `- **ToolName**:`, >500 chars, no tool_calls/detail).
    let content = m.content ?? ''
    if (
      m.role === 'assistant' &&
      content.length > 500 &&
      !m.tool_calls &&
      (!m.detail || m.detail.trim() === '') &&
      /^\s*-\s+\*\*/.test(content)
    ) {
      content = ''
    }

    // Broader empty filter: skip assistant messages with no content AND no
    // iterations (not just ones with tool_calls — catches all empty shells).
    if (
      m.role === 'assistant' &&
      (!content || content.trim() === '') &&
      iterations.length === 0
    ) {
      continue
    }

    normalized.push({
      id: String(m.id),
      role: m.role,
      content,
      iterations,
      timestamp: m.created_at ?? '',
      isPartial: false,
      turnID: 0,
      displayOnly: m.display_only,
    })
  }

  // History messages have unique DB IDs — no dedup needed.
  // dedupMessages is only used in the live append path (appendAssistant)
  // to catch duplicate onAssistantComplete calls from reconnect replay.
  return normalized
}

/**
 * Synthesize WebIteration[] from tool_calls JSON (fallback when no detail).
 * Parses the tool_calls array and maps each call to a tool progress entry.
 */
function synthesizeIterationsFromToolCalls(toolCalls: unknown): WebIteration[] {
  try {
    const calls = typeof toolCalls === 'string' ? JSON.parse(toolCalls) : toolCalls
    if (!Array.isArray(calls) || calls.length === 0) return []
    return [{
      iteration: 0,
      thinking: '',
      reasoning: '',
      tools: calls.map((call: Record<string, unknown>) => {
        const fn = (call.function ?? {}) as Record<string, unknown>
        const name = String(fn.name ?? call.name ?? 'tool')
        return {
          name,
          label: name,
          status: 'done' as const,
          elapsedMs: 0,
          summary: '',
          detail: '',
          args: typeof fn.arguments === 'string' ? fn.arguments : '',
          toolHints: '',
        }
      }),
      toolCount: calls.length,
    }]
  } catch {
    return []
  }
}

let echoSeq = 0

export function useChatMessages({
  chatID,
  enabled = true,
  ws,
}: UseChatMessagesOptions): UseChatMessagesResult {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [initialProgress, setInitialProgress] = useState<HistProgress | null>(null)
  const [resolvedChatID, setResolvedChatID] = useState<string | null>(null)

  const chatIDRef = useRef(chatID)
  chatIDRef.current = chatID

  // Generation counter to discard stale async fetches when the user rapidly
  // switches sessions (prevents session A's history from overwriting session
  // B's after a quick switch — Spec 5 §2.1).
  const reloadGenRef = useRef(0)

  const reload = useCallback(async () => {
    const gen = ++reloadGenRef.current
    setLoading(true)
    setError(null)
    // Clear immediately before async fetch — prevents stale messages from the
    // previous session or pre-compression state from showing during the
    // network round-trip (Spec 5 §2.1, §2.3).
    setMessages([])
    setInitialProgress(null)
    try {
      const data = await fetchHistory()
      // Discard stale fetch — a newer reload() was triggered while we were
      // waiting for this response (rapid session switch or HistoryCompacted
      // during an in-flight reload).
      if (gen !== reloadGenRef.current) return
      const rows = data.messages ?? []
      setMessages(parseHistoryMessages(rows))
      setInitialProgress(data.active_progress ?? null)
      if (data.chat_id) setResolvedChatID(data.chat_id)
    } catch (e) {
      if (gen !== reloadGenRef.current) return
      setError(e instanceof Error ? e.message : String(e))
      setMessages([])
      setInitialProgress(null)
    } finally {
      if (gen === reloadGenRef.current) setLoading(false)
    }
  }, [])

  // Load history when the chatID changes (or on first enable).
  useEffect(() => {
    if (!enabled) return
    void reload()
  }, [enabled, chatID, reload])

  // Echo back user messages the server re-serializes (e.g. with file info).
  // The server sends both `content` (with file markdown) and `original_content`
  // (raw text). We use `content` to preserve file rendering, and replace the
  // optimistic message we inserted in `sendMessage` rather than appending a
  // duplicate.
  //
  // Spec 5 §2.4 — match by chatID first, then find the optimistic message
  // using a 5-second freshness window to avoid replacing an older user message
  // when echoes arrive out of order.
  useEffect(() => {
    if (!chatID) return
    const off = ws.onMessage((msg: WSMessage) => {
      if (msg.chat_id && chatIDRef.current && msg.chat_id !== chatIDRef.current) return
      if (msg.type !== 'user_echo') return
      const content = msg.content ?? msg.original_content ?? ''
      if (!content) return
      const id = `echo-${msg.ts ?? Date.now()}-${echoSeq++}`
      const ts = msg.ts ? new Date(msg.ts * 1000).toISOString() : new Date().toISOString()
      const now = Date.now()
      setMessages((prev) => {
        // Replace the most recent optimistic user message (id starts with
        // 'user-') that was created within 5 seconds — prevents replacing an
        // older user message when echoes arrive out of order.
        const lastUserIdx = prev.findLastIndex((m) => {
          if (!m.id.startsWith('user-')) return false
          const match = m.id.match(/^user-(\d+)-/)
          if (!match) return false
          return now - parseInt(match[1], 10) < 5000
        })
        const newMsg: ChatMessage = {
          id,
          role: 'user',
          content,
          iterations: [],
          timestamp: ts,
          isPartial: false,
          turnID: 0,
        }
        if (lastUserIdx >= 0) {
          const copy = [...prev]
          copy[lastUserIdx] = newMsg
          return copy
        }
        return [...prev, newMsg]
      })
    })
    return off
  }, [ws, chatID])

  const sendMessage = useCallback(
    (content: string, attachments?: Attachments) => {
      const text = content.trim()
      if (!text && !attachments?.uploadKeys.length) return
      const id = `user-${Date.now()}-${echoSeq++}`
      // Optimistically show the user's message.
      const newMsg: ChatMessage = {
        id,
        role: 'user',
        content: text,
        iterations: [],
        timestamp: new Date().toISOString(),
        isPartial: false,
        turnID: 0,
      }
      setMessages((prev) => [...prev, newMsg])
      ws.send({
        type: 'message',
        chat_id: chatIDRef.current ?? undefined,
        content: text,
        upload_keys: attachments?.uploadKeys,
        file_names: attachments?.fileNames,
        file_sizes: attachments?.fileSizes,
        file_mimes: attachments?.fileMimes,
      })
    },
    [ws],
  )

  const cancel = useCallback(() => {
    ws.send({ type: 'cancel' })
  }, [ws])

  const upload = useCallback(async (file: File) => uploadFile(file), [])

  const appendAssistant = useCallback((content: string, iterations: WebIteration[]) => {
    if (!content && !iterations.length) return
    const id = `asst-${Date.now()}-${echoSeq++}`
    const newMsg: ChatMessage = {
      id,
      role: 'assistant',
      content,
      iterations,
      timestamp: new Date().toISOString(),
      isPartial: false,
      turnID: 0,
    }
    setMessages((prev) => dedupMessages([...prev, newMsg]))
  }, [])

  const removeMessage = useCallback((id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id))
  }, [])

  return {
    messages,
    loading,
    error,
    initialProgress,
    resolvedChatID,
    reload,
    sendMessage,
    cancel,
    upload,
    appendAssistant,
    removeMessage,
  }
}

// historyProgressToLive has moved to @/components/agent/normalize so useChatMessages
// does not duplicate the normalization logic. Re-export for any existing callers.
export { historyProgressToLive } from '@/components/agent/normalize'
