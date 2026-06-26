/**
 * External store for live Agent progress (Spec 4 §3.6).
 *
 * Why an external store instead of useState/useReducer: stream_content events
 * arrive at very high frequency (one per token). Driving a React state update
 * per token re-renders the whole message list on every keystroke of the model.
 * Instead we accumulate into a mutable object and notify subscribers at most
 * once per animation frame (throttled, ~60fps cap) — mirroring opencode's
 * PacedMarkdown pacing. useSyncExternalStore lets components subscribe without
 * forcing the parent to re-render.
 *
 * The store hands out immutable `LiveProgress` snapshots: each notify produces a
 * fresh top-level object (shallow-copied) so React's referential equality check
 * in useSyncExternalStore can detect change. Within a frame, getSnapshot returns
 * the same reference, so multiple reads coalesce into one render.
 */
import {
  EMPTY_LIVE_PROGRESS,
  type IterationSnapshot,
  type LiveProgress,
  type ToolProgress,
} from '@/types/agent'

type Listener = () => void
type Mutator = (draft: LiveProgress) => void

const NOOP_SNAPSHOT: LiveProgress = EMPTY_LIVE_PROGRESS

export class ProgressStore {
  private current: LiveProgress = { ...EMPTY_LIVE_PROGRESS }
  private snapshot: LiveProgress = NOOP_SNAPSHOT
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
  getSnapshot = (): LiveProgress => this.snapshot

  /** Apply a mutation under the hood; schedules a throttled notify. */
  mutate(mutator: Mutator): void {
    if (this.disposed) return
    mutator(this.current)
    this.dirty = true
    this.scheduleNotify()
  }

  /** Replace the whole progress (e.g. from history active_progress). */
  replace(next: LiveProgress): void {
    this.mutate((draft) => {
      Object.assign(draft, next)
    })
  }

  /** Reset to idle (after a run completes or on errors). */
  reset(): void {
    this.mutate((draft) => {
      this.current = { ...EMPTY_LIVE_PROGRESS }
      Object.assign(draft, this.current)
    })
  }

  /** Append streamed assistant text (stream_content). */
  appendStreamContent(delta: string): void {
    if (!delta) return
    this.mutate((draft) => {
      draft.streamContent += delta
      draft.streaming = true
    })
  }

  /** Append streamed reasoning text (reasoning_stream_content). */
  appendReasoningContent(delta: string): void {
    if (!delta) return
    this.mutate((draft) => {
      draft.reasoningContent += delta
      draft.streaming = true
    })
  }

  /** Set active/completed tools and iteration from a progress_structured event. */
  setStructuredTools(opts: {
    activeTools?: ToolProgress[]
    completedTools?: ToolProgress[]
    iteration?: number
    streaming?: boolean
  }): void {
    this.mutate((draft) => {
      if (opts.activeTools) draft.activeTools = opts.activeTools
      if (opts.completedTools) draft.completedTools = opts.completedTools
      if (typeof opts.iteration === 'number') draft.iteration = opts.iteration
      if (typeof opts.streaming === 'boolean') draft.streaming = opts.streaming
    })
  }

  /** Push a finished iteration snapshot. */
  pushIteration(snapshot: IterationSnapshot): void {
    this.mutate((draft) => {
      draft.iterationHistory = [...draft.iterationHistory, snapshot]
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

  /** Build a fresh immutable snapshot and notify listeners. */
  private flush(): void {
    if (this.disposed || !this.dirty) return
    this.dirty = false
    this.snapshot = {
      streamContent: this.current.streamContent,
      reasoningContent: this.current.reasoningContent,
      activeTools: this.current.activeTools,
      completedTools: this.current.completedTools,
      iteration: this.current.iteration,
      iterationHistory: this.current.iterationHistory,
      streaming: this.current.streaming,
    }
    this.listeners.forEach((l) => l())
  }
}

/** Create an isolated progress store. Caller owns its lifetime (dispose). */
export function createProgressStore(): ProgressStore {
  return new ProgressStore()
}
