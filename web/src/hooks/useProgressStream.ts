/**
 * useProgressStream — subscribes a ProgressStore to the WS event stream for one
 * chatID and exposes the live progress + streaming-preview message (Spec 4).
 *
 * Event mapping (see protocol/ws.go, channel/web/web.go):
 *   stream_content     → append to streamContent / reasoningContent (throttled)
 *   progress_structured → update activeTools/completedTools/iteration/reasoning
 *   text               → finalize: hand the full text to `onAssistantComplete`,
 *                        then clear the store for the next turn.
 *   session(idle)      → if still streaming with accumulated content, finalize
 *                        using the accumulated text (resilience for servers
 *                        that close without a trailing `text`).
 *
 * The hook returns:
 *   - `progress`: throttled immutable LiveProgress snapshot (useSyncExternalStore)
 *   - `liveMessage`: a transient assistant ChatMessage built from the current
 *     stream, so the list can render it inline without waiting for finalization.
 *
 * `liveMessage` is derived from the same store snapshot (memoized), so it only
 * changes when the snapshot changes — i.e. at most once per frame.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSyncExternalStore } from 'react'

import { ProgressStore } from '@/components/agent/progressStore'
import {
  historyProgressToLive,
  normalizeIteration,
  normalizeTool,
  parseIterations,
} from '@/components/agent/normalize'
import { useWSConnection } from '@/hooks/useWSConnection'
import {
  EMPTY_LIVE_PROGRESS,
  type ChatMessage,
  type IterationSnapshot,
  type LiveProgress,
  type ToolProgress,
} from '@/types/agent'
import type { HistProgress } from '@/components/agent/api'
import type { WSMessage } from '@/types/shared'

interface UseProgressStreamOptions {
  /** Chat ID this stream tracks (events for other chats are ignored). */
  chatID: string | null
  /** Called with the finalized assistant text when a `text` event arrives. */
  onAssistantComplete?: (finalText: string, iterations: IterationSnapshot[]) => void
  /**
   * Optional live-progress snapshot from history (active_progress). When the
   * tracked chat is busy (phase != done) this hydrates the store so a page
   * refresh resumes the progress panel instead of showing an empty stream.
   * Spec 4 §3.8.
   */
  initialProgress?: HistProgress | null
}

export interface UseProgressStreamResult {
  progress: LiveProgress
  /** Transient streaming assistant message, or null when idle. */
  liveMessage: ChatMessage | null
  /** True while there is accumulated streaming content. */
  isStreaming: boolean
}

export function useProgressStream({
  chatID,
  onAssistantComplete,
  initialProgress,
}: UseProgressStreamOptions): UseProgressStreamResult {
  const ws = useWSConnection()
  const storeRef = useRef<ProgressStore | null>(null)
  if (storeRef.current === null) {
    storeRef.current = new ProgressStore()
  }
  const store = storeRef.current

  // Keep the latest completion callback in a ref so the effect's handlers don't
  // re-subscribe whenever the parent re-renders.
  const completeRef = useRef(onAssistantComplete)
  completeRef.current = onAssistantComplete

  // Track chatID inside the handlers via ref so we don't tear down the store on
  // every chat switch (we just reset it).
  const chatIDRef = useRef(chatID)
  chatIDRef.current = chatID

  const progress = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const [liveId] = useState(() => `live-${Math.random().toString(36).slice(2, 9)}`)

  useEffect(() => {
    // Reset progress whenever the tracked chat changes, then hydrate from the
    // history active_progress snapshot if the session is still busy (phase !=
    // done). This resumes the progress panel after a page refresh (Spec §3.8).
    store.reset()
    const snap = initialProgress
    if (snap && snap.phase && snap.phase !== 'done') {
      const live = historyProgressToLive(snap)
      store.replace({
        streamContent: live.streamContent,
        reasoningContent: '',
        activeTools: live.activeTools,
        completedTools: live.completedTools,
        iteration: live.iteration,
        iterationHistory: live.iterations,
        streaming: true,
      })
    }
  }, [store, chatID, initialProgress])

  useEffect(() => {
    // Reset on (un)mount.
    return () => {
      store.dispose()
      storeRef.current = null
    }
  }, [store])

  useEffect(() => {
    const offMessage = ws.onMessage((msg: WSMessage) => {
      // Unified chatID filtering: some messages carry chat_id at the top
      // level (text), some in msg.session.chat_id (session events), and
      // some in msg.progress.chat_id with a "web:" prefix (stream_content,
      // progress_structured). Check all three and strip the "web:" prefix.
      const eventChatID = msg.chat_id
        ?? msg.session?.chat_id
        ?? (msg.progress?.chat_id ? String(msg.progress.chat_id).replace(/^web:/, '') : undefined)
      if (chatIDRef.current && eventChatID && eventChatID !== chatIDRef.current) {
        return
      }
      handleProgressMessage(msg, store, completeRef)
    })
    return offMessage
  }, [ws, store])

  // Derive a transient streaming message from the snapshot. Only the snapshot's
  // streamContent drives this, so it updates at frame rate (not per token).
  const liveMessage = useMemo<ChatMessage | null>(() => {
    if (!progress.streamContent && !progress.streaming) return null
    return {
      id: liveId,
      role: 'assistant',
      content: progress.streamContent,
      iterations: progress.iterationHistory,
    }
  }, [progress, liveId])

  return {
    progress: progress ?? EMPTY_LIVE_PROGRESS,
    liveMessage,
    isStreaming: progress.streaming || Boolean(progress.streamContent),
  }
}

/** Dispatch one WSMessage into the progress store. Shared with history hydration. */
function handleProgressMessage(
  msg: WSMessage,
  store: ProgressStore,
  completeRef: React.MutableRefObject<UseProgressStreamOptions['onAssistantComplete']>,
): void {
  switch (msg.type) {
    case 'stream_content': {
      // stream_content carries content in progress.stream_content /
      // progress.reasoning_stream_content (channel/web/web.go SendStreamContent).
      const p = msg.progress
      if (p?.stream_content) store.appendStreamContent(String(p.stream_content))
      if (p?.reasoning_stream_content) {
        store.appendReasoningContent(p.reasoning_stream_content)
      }
      return
    }
    case 'progress_structured': {
      const p = msg.progress
      if (!p) return
      const active = p.active_tools
        ? (p.active_tools.map(normalizeTool).filter(Boolean) as ToolProgress[])
        : undefined
      const completed = p.completed_tools
        ? (p.completed_tools.map(normalizeTool).filter(Boolean) as ToolProgress[])
        : undefined
      const iteration = typeof p.iteration === 'number' ? p.iteration : undefined
      store.setStructuredTools({
        activeTools: active,
        completedTools: completed,
        iteration,
        streaming: p.phase && p.phase !== 'done' ? true : undefined,
      })
      // Reasoning block text may arrive via progress.reasoning.
      if (typeof p.reasoning === 'string' && p.reasoning) {
        // Reasoning is a snapshot, not a delta; replace rather than append.
        store.mutate((d) => {
          d.reasoningContent = p.reasoning as string
        })
      }
      // Iteration history snapshot (live).
      const hist = p.iteration_history
      if (Array.isArray(hist)) {
        const snaps = hist.map(normalizeIteration).filter(Boolean) as IterationSnapshot[]
        store.mutate((d) => {
          d.iterationHistory = snaps
        })
      }
      return
    }
    case 'text': {
      // Final assistant message: commit then clear the live stream.
      const finalText = msg.content ?? ''
      const iterations = parseIterations(msg.progress_history)
      store.reset()
      completeRef.current?.(finalText, iterations)
      return
    }
    case 'session': {
      // On idle, if we had accumulated stream content without a closing text,
      // finalize defensively.
      const snap = store.getSnapshot()
      const action = msg.session?.action
      if (action === 'idle' && snap.streamContent) {
        const text = snap.streamContent
        const iters = snap.iterationHistory
        store.reset()
        completeRef.current?.(text, iters)
      }
      return
    }
    default:
      return
  }
}
