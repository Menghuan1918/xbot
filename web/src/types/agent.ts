/**
 * Agent rendering domain types (Spec 4).
 *
 * Pure data types for the Agent workspace: chat messages, iteration history,
 * tool/reasoning snapshots, ask-user interactions, and the collapse-level
 * preference. These mirror the Go shapes consumed over the HTTP history API
 * and the WS progress stream (see protocol/events.go, agent/engine.go,
 * channel/web/web_api.go). Keeping them in one module avoids circular imports
 * between the hooks and components.
 *
 * Conventions:
 *  - `id` is a string for messages (DB row ids are coerced to string for stable
 *    React keys across reload + live append).
 *  - Optional backend fields are typed optional/nullable and normalized at the
 *    hook boundary so components can assume a clean shape.
 */

/** Collapse preference persisted at localStorage key `xbot-collapse-level`. */
export type CollapseLevel = 'all' | 'minimal' | 'none'

export const COLLAPSE_LEVEL_STORAGE_KEY = 'xbot-collapse-level'
export const DEFAULT_COLLAPSE_LEVEL: CollapseLevel = 'all'
export const COLLAPSE_LEVELS: CollapseLevel[] = ['all', 'minimal', 'none']

/** A single tool snapshot inside an iteration (agent/engine.go IterationToolSnapshot). */
export interface IterationTool {
  name: string
  label?: string
  /** 'done' | 'error' (history is always completed). */
  status: string
  elapsedMs?: number
  summary?: string
}

/** One iteration snapshot from the `detail` JSON of an assistant message. */
export interface IterationSnapshot {
  iteration: number
  thinking?: string
  reasoning?: string
  /** Wall-clock duration of this iteration (ms), from `elapsed_wall` in the JSON. */
  elapsedMs?: number
  tools: IterationTool[]
}

/** A live tool being executed (protocol/events.go ToolProgress). */
export interface ToolProgress {
  name?: string
  label?: string
  /** 'pending' | 'running' | 'done' | 'error'. */
  status?: string
  elapsedMs?: number
  iteration?: number
  summary?: string
  detail?: string
  args?: string
}

/** A user-facing question from the agent (protocol/events.go AskUserQuestion). */
export interface AskUserQuestion {
  question: string
  options?: string[]
}

/** An active ask-user interaction awaiting a response. */
export interface AskUserPrompt {
  requestId: string
  questions: AskUserQuestion[]
}

/** Chat message role. */
export type MessageRole = 'user' | 'assistant'

/**
 * Normalized chat message — the shape all rendering components consume.
 * `assistant` messages may carry `iterations` (parsed from the history `detail`
 * JSON) and a `displayOnly` flag (cron results, [interrupted] markers, ...).
 */
export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  createdAt?: string
  /** True for messages excluded from the LLM context but still displayed. */
  displayOnly?: boolean
  /** Iteration history for assistant messages, parsed from the `detail` field. */
  iterations?: IterationSnapshot[]
}

/** Snapshot of the live progress shown above the input while the agent runs. */
export interface LiveProgress {
  /** Cumulative streamed assistant text (stream_content). */
  streamContent: string
  /** Cumulative streamed reasoning text (reasoning_stream_content). */
  reasoningContent: string
  /** Tools currently executing. */
  activeTools: ToolProgress[]
  /** Tools finished this run. */
  completedTools: ToolProgress[]
  /** Current iteration number. */
  iteration: number
  /** Iteration snapshots accumulated during the live run. */
  iterationHistory: IterationSnapshot[]
  /** True while the agent is actively producing output. */
  streaming: boolean
}

export const EMPTY_LIVE_PROGRESS: LiveProgress = {
  streamContent: '',
  reasoningContent: '',
  activeTools: [],
  completedTools: [],
  iteration: 0,
  iterationHistory: [],
  streaming: false,
}

/** Status badge kind for a tool, derived from its status string. */
export type ToolStatusKind = 'pending' | 'running' | 'done' | 'error'

export function toolStatusKind(status: string | undefined): ToolStatusKind {
  switch (status) {
    case 'done':
      return 'done'
    case 'error':
      return 'error'
    case 'running':
      return 'running'
    case 'pending':
      return 'pending'
    default:
      return 'pending'
  }
}
