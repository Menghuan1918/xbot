/**
 * Normalizers turning raw backend shapes (history rows, WS progress payloads,
 * iteration-history JSON) into the clean Agent domain types (Spec 4).
 *
 * Shared by useChatMessages (history hydration) and useProgressStream (live
 * events) so the two paths never diverge on how a tool/iteration is parsed.
 */
import type { HistProgress } from '@/components/agent/api'
import type { IterationSnapshot, IterationTool, ToolProgress } from '@/types/agent'

/** Coerce a raw iteration-history entry (from `detail` JSON) into IterationSnapshot. */
export function normalizeIteration(raw: unknown): IterationSnapshot | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const tools = Array.isArray(r.tools) ? r.tools : []
  return {
    iteration: typeof r.iteration === 'number' ? r.iteration : 0,
    thinking: typeof r.thinking === 'string' ? r.thinking : undefined,
    reasoning: typeof r.reasoning === 'string' ? r.reasoning : undefined,
    tools: tools.map(normalizeIterationTool).filter(Boolean) as IterationTool[],
  }
}

export function normalizeIterationTool(raw: unknown): IterationTool | null {
  if (!raw || typeof raw !== 'object') return null
  const t = raw as Record<string, unknown>
  return {
    name: typeof t.name === 'string' ? t.name : '',
    label: typeof t.label === 'string' ? t.label : undefined,
    status: typeof t.status === 'string' ? t.status : 'done',
    elapsedMs: typeof t.elapsed_ms === 'number' ? t.elapsed_ms : undefined,
    summary: typeof t.summary === 'string' ? t.summary : undefined,
  }
}

/** Coerce a raw tool_calls/active_tools entry (from a progress event) into ToolProgress. */
export function normalizeTool(raw: unknown): ToolProgress | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  return {
    name: typeof r.name === 'string' ? r.name : undefined,
    label: typeof r.label === 'string' ? r.label : undefined,
    status: typeof r.status === 'string' ? r.status : undefined,
    elapsedMs: typeof r.elapsed_ms === 'number' ? r.elapsed_ms : undefined,
    iteration: typeof r.iteration === 'number' ? r.iteration : undefined,
    summary: typeof r.summary === 'string' ? r.summary : undefined,
    detail: typeof r.detail === 'string' ? r.detail : undefined,
    args: typeof r.args === 'string' ? r.args : undefined,
  }
}

/** Parse a `detail`/`progress_history` JSON string into iteration snapshots. */
export function parseIterations(json: string | undefined | null): IterationSnapshot[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json)
    if (!Array.isArray(parsed)) return []
    return parsed.map(normalizeIteration).filter(Boolean) as IterationSnapshot[]
  } catch {
    return []
  }
}

/**
 * Normalize a history `active_progress` snapshot into live tool lists +
 * iterations + stream content, so a busy session resumed after a page refresh
 * can hydrate the ProgressStore (Spec 4 §3.8: "if processing=true → show the
 * progress panel").
 */
export function historyProgressToLive(p: HistProgress | null): {
  activeTools: ToolProgress[]
  completedTools: ToolProgress[]
  iterations: IterationSnapshot[]
  streamContent: string
} {
  if (!p) return { activeTools: [], completedTools: [], iterations: [], streamContent: '' }
  const active = (p.active_tools ?? []).map(normalizeTool).filter(Boolean) as ToolProgress[]
  const completed = (p.completed_tools ?? []).map(normalizeTool).filter(Boolean) as ToolProgress[]
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
