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

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchHistory()
      const rows = data.messages ?? []
      // Merge intermediate assistant messages: messages with tool_calls but no
      // detail (and empty content) are intermediate iterations that
      // IncrementalPersist saved. The final assistant message carries the
      // `detail` field with the full iteration history JSON. We skip the
      // intermediate ones to avoid showing duplicate empty bubbles.
      const normalized: ChatMessage[] = []
      for (const m of rows) {
        // Skip display_only messages (cron results, [interrupted] markers).
        if (m.display_only) continue

        // Skip intermediate assistant messages: no content, no detail, has
        // tool_calls — these are intermediate iterations whose info is
        // already captured in the final message's detail field.
        if (
          m.role === 'assistant' &&
          (!m.content || m.content.trim() === '') &&
          !m.detail &&
          m.tool_calls
        ) {
          continue
        }

        normalized.push({
          id: String(m.id),
          role: m.role,
          content: m.content ?? '',
          iterations: parseWebIterations(m.detail ?? undefined),
          timestamp: m.created_at ?? '',
          isPartial: false,
          turnID: 0,
          displayOnly: m.display_only,
        })
      }
      // Apply dedup (harmless for history — turnID=0 means keep all).
      setMessages(dedupMessages(normalized))
      setInitialProgress(data.active_progress ?? null)
      if (data.chat_id) setResolvedChatID(data.chat_id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setMessages([])
      setInitialProgress(null)
    } finally {
      setLoading(false)
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
  useEffect(() => {
    if (!chatID) return
    const off = ws.onMessage((msg: WSMessage) => {
      if (msg.chat_id && chatIDRef.current && msg.chat_id !== chatIDRef.current) return
      if (msg.type !== 'user_echo') return
      const content = msg.content ?? msg.original_content ?? ''
      if (!content) return
      const id = `echo-${msg.ts ?? Date.now()}-${echoSeq++}`
      const ts = msg.ts ? new Date(msg.ts * 1000).toISOString() : new Date().toISOString()
      setMessages((prev) => {
        // Replace the last optimistic user message (id starts with 'user-')
        // instead of appending a duplicate.
        const lastUserIdx = prev.findLastIndex((m) => m.id.startsWith('user-'))
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
