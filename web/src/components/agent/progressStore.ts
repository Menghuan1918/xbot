/**
 * External store for live Agent progress (Spec 3 — 流式数据模型与 Store 重写).
 *
 * Core design (mirrors TUI's progress state machine):
 *
 * 1. **stream-only patch** — stream_content events (phase==='' && iteration===0)
 *    only patch StreamContent/ReasoningStreamContent/StreamingTools to `current`,
 *    never replace the entire snapshot. This prevents the "text disappears on
 *    structured event arrival" bug.
 *
 * 2. **carry-forward** — when a structured event (progress_structured) arrives,
 *    stream-only fields (streamContent, reasoningStreamContent, streamingTools)
 *    are preserved from the current state; structured fields (phase, iteration,
 *    activeTools, completedTools) are replaced.
 *
 * 3. **iteration snapshot** — when iteration changes (N→N+1), the previous
 *    iteration's reasoning/thinking/tools are snapshotted into iterationHistory.
 *
 * 4. **tool dedup** — generating-status tools are never deduped (each call shows
 *    independently). running/done/error tools are deduped by name+label.
 *
 * Performance: requestAnimationFrame throttling coalesces many mutations into
 * at most one notify per frame. flush() produces a shallow-copied top-level
 * object so useSyncExternalStore's referential equality check detects changes.
 */
import {
  EMPTY_PROGRESS_SNAPSHOT,
  type ProgressSnapshot,
  type WebToolProgress,
  type WebIteration,
} from '@/types/shared'
import type { ProgressEvent } from '@/types/shared'

type Listener = () => void
type Mutator = (draft: ProgressSnapshot) => void

// ── exported helpers (used by useProgressStream) ──────────────────────────

/** Detect a stream-only event: no phase/iteration, has stream fields. */
export function isStreamOnly(payload: ProgressEvent): boolean {
  const hasStreamFields =
    payload.stream_content !== undefined ||
    payload.reasoning_stream_content !== undefined ||
    payload.streaming_tools !== undefined
  if (!hasStreamFields) return false
  const noPhase = !payload.phase || payload.phase === ''
  const noIteration = !payload.iteration || payload.iteration === 0
  return noPhase && noIteration
}

/** Normalize a raw tool object (from WS event or history) into WebToolProgress. */
export function normalizeWebTool(raw: unknown): WebToolProgress | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  return {
    name: typeof r.name === 'string' ? r.name : '',
    label: typeof r.label === 'string' ? r.label : '',
    status: (typeof r.status === 'string' ? r.status : 'running') as WebToolProgress['status'],
    elapsedMs: typeof r.elapsed_ms === 'number' ? r.elapsed_ms : 0,
    summary: typeof r.summary === 'string' ? r.summary : '',
    detail: typeof r.detail === 'string' ? r.detail : '',
    args: typeof r.args === 'string' ? r.args : '',
    toolHints: typeof r.tool_hints === 'string' ? r.tool_hints : '',
  }
}

/** Normalize an array of raw tool objects, filtering nulls. */
export function normalizeWebTools(raw: unknown[] | undefined): WebToolProgress[] {
  if (!raw || !Array.isArray(raw)) return []
  return raw.map(normalizeWebTool).filter(Boolean) as WebToolProgress[]
}

/**
 * Dedup tools by name+label.
 * generating-status tools are kept as-is (each call shows independently).
 * running/done/error tools with the same name+label are deduped (first wins).
 */
export function dedupTools(tools: WebToolProgress[]): WebToolProgress[] {
  const seen = new Set<string>()
  const result: WebToolProgress[] = []
  for (const tool of tools) {
    if (tool.status === 'generating') {
      result.push(tool)
      continue
    }
    const key = `${tool.name}\x00${tool.label}`
    if (!seen.has(key)) {
      seen.add(key)
      result.push(tool)
    }
  }
  return result
}

/**
 * Dedup messages by (turnID, role): only the last occurrence is kept.
 * This prevents PhaseDone + handleAgentMessage from creating duplicate
 * messages for the same turn.
 */
export function dedupMessages<T extends { turnID: number; role: string }>(
  messages: T[],
): T[] {
  const seen = new Map<string, number>()
  const result: T[] = []
  for (let i = 0; i < messages.length; i++) {
    // Only dedup messages with a positive turnID (live messages from
    // PhaseDone + handleAgentMessage). turnID=0 means no turn tracking
    // (history messages, optimistic echoes) — keep all.
    if (messages[i].turnID <= 0) {
      result.push(messages[i])
      continue
    }
    const key = `${messages[i].turnID}:${messages[i].role}`
    const existing = seen.get(key)
    if (existing !== undefined) {
      result[existing] = messages[i]
    } else {
      seen.set(key, result.length)
      result.push(messages[i])
    }
  }
  return result
}

// ── ProgressStore ──────────────────────────────────────────────────────────

export class ProgressStore {
  private current: ProgressSnapshot = { ...EMPTY_PROGRESS_SNAPSHOT }
  private snapshot: ProgressSnapshot = EMPTY_PROGRESS_SNAPSHOT
  private listeners = new Set<Listener>()
  private rafHandle: number | null = null
  private dirty = false
  private disposed = false

  /** Subscribe to snapshot changes; returns an unsubscribe function. */
  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** Current snapshot. Stable between notifies (same reference). */
  getSnapshot = (): ProgressSnapshot => this.snapshot

  /** Apply a mutation under the hood; schedules a throttled notify. */
  mutate(mutator: Mutator): void {
    if (this.disposed) return
    mutator(this.current)
    this.dirty = true
    this.scheduleNotify()
  }

  /** Reset to idle (after a run completes or on errors). */
  reset(): void {
    this.mutate((draft) => {
      this.current = { ...EMPTY_PROGRESS_SNAPSHOT }
      Object.assign(draft, this.current)
    })
  }

  /** Append streamed assistant text delta (stream_content events). */
  appendStreamContent(delta: string): void {
    if (!delta) return
    this.mutate((draft) => {
      draft.streamContent += delta
      draft.streaming = true
    })
  }

  /** Append streamed reasoning text delta (reasoning_stream_content events). */
  appendReasoningContent(delta: string): void {
    if (!delta) return
    this.mutate((draft) => {
      draft.reasoningStreamContent += delta
      draft.streaming = true
    })
  }

  /**
   * Apply stream-only fields (streaming_tools) without replacing the snapshot.
   * Called for stream_content events that carry tool-name detection (generating).
   */
  setStreamOnlyFields(opts: { streamingTools?: WebToolProgress[] }): void {
    this.mutate((draft) => {
      if (opts.streamingTools) {
        draft.streamingTools = opts.streamingTools
      }
    })
  }

  /**
   * Apply a structured progress event with carry-forward + iteration snapshot.
   *
   * Stream-only fields (streamContent, reasoningStreamContent, streamingTools)
   * are preserved from current state — NOT overwritten by this method.
   * Structured fields (phase, iteration, activeTools, completedTools) are replaced.
   */
  setStructuredTools(opts: {
    phase?: string
    iteration?: number
    activeTools?: WebToolProgress[]
    completedTools?: WebToolProgress[]
    reasoning?: string
    iterationHistory?: WebIteration[]
    streamingTools?: WebToolProgress[]
  }): void {
    this.mutate((draft) => {
      // ── iteration snapshot ──
      // When iteration advances (N→N+1), snapshot the previous iteration.
      // lastIter starts at -1; first advance sets it without snapshotting.
      if (opts.iteration !== undefined && opts.iteration > draft.lastIter) {
        if (draft.lastIter >= 0) {
          const snap: WebIteration = {
            iteration: draft.lastIter,
            thinking: draft.streamContent,
            reasoning: draft.lastReasoning || draft.reasoningStreamContent,
            tools: dedupTools(draft.completedTools),
            toolCount: draft.completedTools.length,
          }
          draft.iterationHistory = [...draft.iterationHistory, snap]
        }
        draft.lastIter = opts.iteration
      }

      // ── carry-forward: preserve stream-only fields ──
      // streamContent, reasoningStreamContent, streamingTools are NOT touched
      // here — they are only modified by stream_content events (appendStreamContent
      // / appendReasoningContent / setStreamOnlyFields). This is the core fix.

      // ── replace structured fields ──
      if (opts.activeTools) draft.activeTools = dedupTools(opts.activeTools)
      if (opts.completedTools) draft.completedTools = dedupTools(opts.completedTools)
      if (opts.iteration !== undefined) draft.iteration = opts.iteration

      // ── phase + streaming ──
      if (opts.phase !== undefined) {
        draft.phase = opts.phase
        draft.streaming = opts.phase !== 'done'
      }

      // ── reasoning is a snapshot (non-incremental), replace lastReasoning ──
      if (opts.reasoning) {
        draft.lastReasoning = opts.reasoning
      }

      // ── streamingTools: update if provided ──
      if (opts.streamingTools) {
        draft.streamingTools = opts.streamingTools
      }

      // ── iterationHistory: update if provided (from history hydration) ──
      if (opts.iterationHistory) {
        draft.iterationHistory = opts.iterationHistory
      }
    })
  }

  /** Set iteration history directly (from history hydration). */
  setIterationHistory(history: WebIteration[]): void {
    this.mutate((draft) => {
      draft.iterationHistory = history
    })
  }

  /** Replace the whole progress (e.g. from history active_progress). */
  replace(next: Partial<ProgressSnapshot>): void {
    this.mutate((draft) => {
      Object.assign(draft, next)
    })
  }

  dispose(): void {
    this.disposed = true
    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle)
      this.rafHandle = null
    }
    this.listeners.clear()
  }

  /* ── internals ── */

  private scheduleNotify(): void {
    if (this.rafHandle !== null) return // already scheduled this frame
    this.rafHandle = requestAnimationFrame(() => {
      this.rafHandle = null
      this.flush()
    })
  }

  /** Build a fresh immutable snapshot (shallow-copied top-level) and notify. */
  private flush(): void {
    if (this.disposed || !this.dirty) return
    this.dirty = false
    this.snapshot = {
      phase: this.current.phase,
      iteration: this.current.iteration,
      streamContent: this.current.streamContent,
      reasoningStreamContent: this.current.reasoningStreamContent,
      streaming: this.current.streaming,
      activeTools: this.current.activeTools,
      completedTools: this.current.completedTools,
      iterationHistory: this.current.iterationHistory,
      streamingTools: this.current.streamingTools,
      lastIter: this.current.lastIter,
      lastReasoning: this.current.lastReasoning,
    }
    this.listeners.forEach((l) => l())
  }
}

/** Create an isolated progress store. Caller owns its lifetime (dispose). */
export function createProgressStore(): ProgressStore {
  return new ProgressStore()
}
