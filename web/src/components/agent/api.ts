/**
 * HTTP API client for the Agent workspace (Spec 4).
 *
 * Thin wrappers over the REST endpoints the web channel exposes:
 *   GET  /api/history       → chat message history + active progress + last_seq
 *   POST /api/files/upload   → multipart file upload, returns an upload_key
 *
 * Types mirror channel/web/web_api.go (historyResponse / histMsg / histProgress)
 * and web_file.go. The hook layer normalizes these into the Agent domain types.
 */

/** Raw history message row (channel/web/web_api.go histMsg). */
export interface HistMsg {
  id: number | string
  role: 'user' | 'assistant'
  content: string
  created_at?: string
  tool_calls?: string | null
  detail?: string | null
  display_only?: boolean
}

/** Raw active-progress snapshot (channel/web/web_api.go histProgress). */
export interface HistProgress {
  phase?: string
  iteration?: number
  thinking?: string
  active_tools?: unknown[]
  completed_tools?: unknown[]
  stream_content?: string
  /** Total wall-clock of the active turn (ms). */
  elapsed_wall?: number
  iteration_history?: unknown[]
}

/** Raw history response (channel/web/web_api.go historyResponse). */
export interface HistoryResponse {
  ok?: boolean
  messages?: HistMsg[]
  processing?: boolean
  active_progress?: HistProgress | null
  last_seq?: number
  chat_id?: string
  channel?: string
  error?: string
}

/** Upload response (channel/web/web_file.go handleCloudUpload). */
export interface UploadResponse {
  ok?: boolean
  upload_key?: string
  name?: string
  size?: number
  mime?: string
  error?: string
}

/** GET /api/history for the active session. */
export async function fetchHistory(): Promise<HistoryResponse> {
  const res = await fetch('/api/history', { headers: { Accept: 'application/json' } })
  if (!res.ok) {
    throw new Error(`history ${res.status}`)
  }
  return (await res.json()) as HistoryResponse
}

/** Upload a single file; returns the server-issued upload key + metadata. */
export async function uploadFile(file: File): Promise<UploadResponse> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch('/api/files/upload', { method: 'POST', body: form })
  const data = (await res.json().catch(() => ({}))) as UploadResponse
  if (!res.ok || !data.ok || !data.upload_key) {
    throw new Error(data?.error || `upload ${res.status}`)
  }
  return data
}
