/**
 * Shared domain types (Spec 1 设计系统基础).
 *
 * Pure data types consumed across specs. Stateful interfaces (WSConnection,
 * TabManager, SessionStore) are defined in Spec 2; keep them out of here.
 */

export type Theme = 'dark' | 'light'
export type Locale = 'zh-CN' | 'en'
export type TabType = 'agent' | 'file' | 'terminal'
export type SessionStatus = 'running' | 'waiting_input' | 'idle' | 'error'
export type SessionCategory = 'all' | 'channel' | 'time' | 'status'

/**
 * How Agent intermediate steps (tool calls / reasoning) are shown.
 * Spec 7 §3.4 — persisted to localStorage under COLLAPSE_LEVEL_STORAGE_KEY.
 */
export type CollapseLevel = 'all' | 'minimal' | 'none'

/** localStorage keys for cross-spec UI preferences. */
export const COLLAPSE_LEVEL_STORAGE_KEY = 'xbot-collapse-level'

export interface Tab {
  id: string
  type: TabType
  title: string
  icon?: string
  closable: boolean
  data?: TabData
}

export interface TabData {
  filePath?: string
  content?: string
  language?: string
  previewMode?: boolean
  /** Frontend terminal id (TerminalSession.id) for terminal tabs. */
  terminalId?: string
}

export interface SessionInfo {
  chatID: string
  channel: string
  label: string
  lastActive: string
  preview: string
  status: SessionStatus
  isCurrent: boolean
}

/* ---------------------------------------------------------------------------
 * WebSocket message envelopes (mirrors Go protocol/ws.go).
 * Added in Spec 2 (布局壳 + Dockview); these are pure data shapes shared by
 * the WS connection layer (useWSConnection) and consumers.
 * ------------------------------------------------------------------------- */

/** Server → Client message types (see protocol/ws.go MsgType*). */
export type WSMessageType =
  | 'text'
  | 'progress_structured'
  | 'stream_content'
  | 'rpc_response'
  | 'ask_user'
  | 'session'
  | 'user_echo'
  | 'card'
  | 'plugin_widgets'
  | 'runner_status'
  | 'sync_progress'
  | '__pong__'

/** Client → Server message types (see protocol/ws.go MsgType*). */
export type WSClientMessageType =
  | 'message'
  | 'cancel'
  | 'rpc'
  | 'subscribe'
  | 'sync'
  | 'ask_user_response'
  | 'tui_control_resp'

/** Generic server → client envelope. Fields are optional because different
 *  message types populate different subsets. */
export interface WSMessage {
  type: WSMessageType | string
  id?: string
  seq?: number
  content?: string
  original_content?: string
  ts?: number
  progress?: ProgressEvent | null
  progress_history?: string
  channel?: string
  chat_id?: string
  sender_id?: string
  sender_name?: string
  chat_type?: string
  session_reset?: boolean
  metadata?: Record<string, string>
  result?: unknown
  error?: string
  session?: SessionEvent | null
}

/** Client → server envelope. */
export interface WSClientMessage {
  type: WSClientMessageType
  content?: string
  file_ids?: string[]
  file_names?: string[]
  file_sizes?: number[]
  upload_keys?: string[]
  file_mimes?: string[]
  channel?: string
  chat_id?: string
  sender_id?: string
  sender_name?: string
  chat_type?: string
  id?: string
  method?: string
  params?: unknown
  /** ask_user_response payload: answers keyed by question index. */
  answers?: Record<string, string>
  /** ask_user_response: true to cancel the prompt. */
  cancelled?: boolean
}

/** Progress event (mirrors Go protocol/events.go ProgressEvent). */
export interface ProgressEvent {
  iteration?: number
  content?: string
  reasoning?: string
  tool_calls?: unknown[]
  elapsed_wall?: number
  chat_id?: string
  seq?: number
  phase?: string
  thinking?: string
  stream_content?: string
  cwd?: string
  // Extended fields present in the backend payload (events.go ActiveTools /
  // CompletedTools / IterationHistory / ReasoningStreamContent / Questions /
  // RequestID). Typed as unknown[] / unknown so consumers normalize them.
  active_tools?: unknown[]
  completed_tools?: unknown[]
  iteration_history?: unknown[]
  reasoning_stream_content?: string
  questions?: unknown[]
  request_id?: string
  [key: string]: unknown
}

/** Session event (mirrors Go protocol/events.go SessionEvent). */
export interface SessionEvent {
  channel?: string
  chat_id?: string
  action?: string
  label?: string
  role?: string
  instance?: string
  parent_id?: string
}
