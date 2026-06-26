/**
 * useChatMessages — owns the committed chat message list for one Agent panel
 * (Spec 4 §3.8, §3.7).
 *
 * Responsibilities:
 *   - load history via GET /api/history and normalize rows into ChatMessage[]
 *     (parsing the `detail` JSON into iteration snapshots)
 *   - expose send / cancel / upload so the input area can drive the WS channel
 *   - append a committed assistant message when useProgressStream finalizes a
 *     run (onAssistantComplete), and echo user messages on send
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
import { normalizeIteration, normalizeTool, parseIterations } from '@/components/agent/normalize'
import { useWSConnection } from '@/hooks/useWSConnection'
import type { ChatMessage, IterationSnapshot, ToolProgress } from '@/types/agent'
import type { WSMessage } from '@/types/shared'

interface UseChatMessagesOptions {
  /** Chat ID this list tracks. */
  chatID: string | null
  /** If true, history is (re)loaded whenever chatID changes. */
  enabled?: boolean
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
  appendAssistant: (content: string, iterations: IterationSnapshot[]) => void
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
}: UseChatMessagesOptions): UseChatMessagesResult {
  const ws = useWSConnection()
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
      const normalized: ChatMessage[] = rows.map((m) => ({
        id: String(m.id),
        role: m.role,
        content: m.content ?? '',
        createdAt: m.created_at,
        displayOnly: m.display_only,
        iterations: parseIterations(m.detail ?? undefined),
      }))
      setMessages(normalized)
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
  useEffect(() => {
    if (!chatID) return
    const off = ws.onMessage((msg: WSMessage) => {
      if (msg.chat_id && chatIDRef.current && msg.chat_id !== chatIDRef.current) return
      if (msg.type !== 'user_echo') return
      const content = msg.original_content ?? msg.content ?? ''
      if (!content) return
      const id = `echo-${msg.ts ?? Date.now()}-${echoSeq++}`
      setMessages((prev) => [...prev, { id, role: 'user', content }])
    })
    return off
  }, [ws, chatID])

  const sendMessage = useCallback(
    (content: string, attachments?: Attachments) => {
      const text = content.trim()
      if (!text && !attachments?.uploadKeys.length) return
      const id = `user-${Date.now()}-${echoSeq++}`
      // Optimistically show the user's message.
      setMessages((prev) => [...prev, { id, role: 'user', content: text }])
      ws.send({
        type: 'message',
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

  const appendAssistant = useCallback((content: string, iterations: IterationSnapshot[]) => {
    if (!content && !iterations.length) return
    const id = `asst-${Date.now()}-${echoSeq++}`
    setMessages((prev) => [...prev, { id, role: 'assistant', content, iterations }])
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

/** Normalize a history active_progress snapshot into live tool lists + iterations. */
export function historyProgressToLive(p: HistProgress | null): {
  activeTools: ToolProgress[]
  completedTools: ToolProgress[]
  iterations: IterationSnapshot[]
  streamContent: string
} {
  if (!p) return { activeTools: [], completedTools: [], iterations: [], streamContent: '' }
  const active = (p.active_tools ?? [])
    .map(normalizeTool)
    .filter(Boolean) as ToolProgress[]
  const completed = (p.completed_tools ?? [])
    .map(normalizeTool)
    .filter(Boolean) as ToolProgress[]
  const iterations = (p.iteration_history ?? [])
    .map(normalizeIteration)
    .filter(Boolean) as IterationSnapshot[]
  return {
    activeTools: active,
    completedTools: completed,
    iterations,
    streamContent: p.stream_content ?? '',
  }
}
