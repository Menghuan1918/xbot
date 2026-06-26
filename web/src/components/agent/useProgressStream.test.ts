/**
 * Hook-level integration tests for useProgressStream (Spec 4).
 *
 * Covers the WS event dispatch that the pure-component tests do not:
 *   stream_content → append, progress_structured → tools/reasoning/iteration,
 *   text → finalize (onAssistantComplete) + reset, session(idle) → defensive
 *   finalize, session/other-chat filtering, and initialProgress hydration.
 *
 * The WS connection is stubbed by mocking @/hooks/useWSConnection. rAF is
 * mocked so the store's throttled notify can be flushed deterministically
 * inside a single act() tick.
 */
import { act, renderHook } from '@testing-library/react'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

import type { ProgressEvent, WSMessage } from '@/types/shared'

// --- stub WS connection ----------------------------------------------------

type MessageHandler = (msg: WSMessage) => void

interface FakeWS {
  onMessage: (h: MessageHandler) => () => void
  onProgress: (h: (e: ProgressEvent) => void) => () => void
  send: (msg: unknown) => void
  connected: boolean
  chatID: string | null
  emit: (msg: WSMessage) => void
}

function makeFakeWS(): FakeWS & { handlers: Set<MessageHandler> } {
  const handlers = new Set<MessageHandler>()
  return {
    handlers,
    onMessage: (h) => {
      handlers.add(h)
      return () => handlers.delete(h)
    },
    onProgress: () => () => {},
    send: () => {},
    connected: true,
    chatID: null,
    emit: (msg) => handlers.forEach((h) => h(msg)),
  }
}

let currentWS: FakeWS
let rafCbs: Array<() => void>
vi.mock('@/hooks/useWSConnection', () => ({
  useWSConnection: () => currentWS,
}))

beforeEach(() => {
  currentWS = makeFakeWS()
  rafCbs = []
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    rafCbs.push(cb as () => void)
    return rafCbs.length
  })
})
afterEach(() => {
  vi.restoreAllMocks()
})

/** Emit a WS message and flush the store's throttled notify within one act. */
function emitAndFlush(msg: WSMessage) {
  act(() => {
    currentWS.emit(msg)
    const cbs = rafCbs.splice(0, rafCbs.length)
    cbs.forEach((cb) => cb())
  })
}

const { useProgressStream } = await import('@/hooks/useProgressStream')

describe('useProgressStream event dispatch', () => {
  it('appends stream_content tokens to the live message', () => {
    const { result } = renderHook(() => useProgressStream({ chatID: 'c1' }))
    emitAndFlush({ type: 'stream_content', progress: { stream_content: 'Hello' } })
    expect(result.current.liveMessage?.content).toBe('Hello')
    expect(result.current.isStreaming).toBe(true)
    emitAndFlush({ type: 'stream_content', progress: { stream_content: ' world' } })
    expect(result.current.liveMessage?.content).toBe('Hello world')
  })

  it('finalizes on text: calls onAssistantComplete and clears the stream', () => {
    const complete = vi.fn()
    const { result } = renderHook(() =>
      useProgressStream({ chatID: 'c1', onAssistantComplete: complete }),
    )
    emitAndFlush({ type: 'stream_content', progress: { stream_content: 'partial' } })
    expect(result.current.liveMessage?.content).toBe('partial')

    emitAndFlush({
      type: 'text',
      content: 'final answer',
      progress_history: '[{"iteration":1,"tools":[{"name":"Read","status":"done"}]}]',
    })
    expect(complete).toHaveBeenCalledTimes(1)
    expect(result.current.liveMessage).toBeNull()
    expect(result.current.isStreaming).toBe(false)
  })

  it('parses progress_history iteration JSON into onAssistantComplete iterations', () => {
    const complete = vi.fn()
    renderHook(() =>
      useProgressStream({ chatID: 'c1', onAssistantComplete: complete }),
    )
    emitAndFlush({
      type: 'text',
      content: 'done',
      progress_history:
        '[{"iteration":1,"thinking":"t","tools":[{"name":"Read","status":"done","summary":"ok"}]}]',
    })
    expect(complete).toHaveBeenCalled()
    const [, iterations] = complete.mock.calls[0]
    expect(iterations).toHaveLength(1)
    expect(iterations[0].iteration).toBe(1)
    expect(iterations[0].tools[0].name).toBe('Read')
  })

  it('defensively finalizes accumulated stream on session(idle)', () => {
    const complete = vi.fn()
    const { result } = renderHook(() =>
      useProgressStream({ chatID: 'c1', onAssistantComplete: complete }),
    )
    emitAndFlush({ type: 'stream_content', progress: { stream_content: 'streamed' } })
    emitAndFlush({ type: 'session', session: { action: 'idle', chat_id: 'c1' } })
    expect(complete).toHaveBeenCalledWith('streamed', expect.any(Array))
    expect(result.current.liveMessage).toBeNull()
  })

  it('ignores session(idle) from a different chat', () => {
    const complete = vi.fn()
    const { result } = renderHook(() =>
      useProgressStream({ chatID: 'c1', onAssistantComplete: complete }),
    )
    emitAndFlush({ type: 'stream_content', progress: { stream_content: 'ours' } })
    // a *different* chat goes idle — must not finalize ours
    emitAndFlush({ type: 'session', session: { action: 'idle', chat_id: 'other' } })
    expect(complete).not.toHaveBeenCalled()
    expect(result.current.liveMessage?.content).toBe('ours')
  })

  it('ignores stream_content from a different chat (top-level chat_id filter)', () => {
    const { result } = renderHook(() => useProgressStream({ chatID: 'c1' }))
    emitAndFlush({
      type: 'stream_content',
      chat_id: 'other',
      progress: { stream_content: 'not ours' },
    })
    expect(result.current.liveMessage).toBeNull()
  })

  it('hydrates from initialProgress when the session is busy', () => {
    const { result } = renderHook(() =>
      useProgressStream({
        chatID: 'c1',
        initialProgress: {
          phase: 'thinking',
          iteration: 3,
          stream_content: 'resumed stream',
          active_tools: [{ name: 'Shell', status: 'running' }],
          completed_tools: [{ name: 'Read', status: 'done', summary: 'ok' }],
          iteration_history: [{ iteration: 1, tools: [{ name: 'Read', status: 'done' }] }],
        },
      }),
    )
    // The hydrate runs in an effect and is throttled via rAF; flush it.
    act(() => {
      rafCbs.splice(0, rafCbs.length).forEach((cb) => cb())
    })
    expect(result.current.isStreaming).toBe(true)
    expect(result.current.liveMessage?.content).toBe('resumed stream')
    expect(result.current.progress.activeTools).toHaveLength(1)
    expect(result.current.progress.completedTools).toHaveLength(1)
    expect(result.current.progress.iterationHistory).toHaveLength(1)
  })

  it('does not hydrate when initialProgress phase is done', () => {
    const { result } = renderHook(() =>
      useProgressStream({
        chatID: 'c1',
        initialProgress: { phase: 'done', stream_content: 'done text' },
      }),
    )
    expect(result.current.isStreaming).toBe(false)
    expect(result.current.liveMessage).toBeNull()
  })

  it('updates tools/reasoning/iteration from progress_structured', () => {
    const { result } = renderHook(() => useProgressStream({ chatID: 'c1' }))
    emitAndFlush({
      type: 'progress_structured',
      progress: {
        iteration: 2,
        phase: 'tool_exec',
        reasoning: 'because',
        active_tools: [{ name: 'Grep', status: 'running' }],
      } as ProgressEvent,
    })
    expect(result.current.progress.iteration).toBe(2)
    expect(result.current.progress.activeTools[0].name).toBe('Grep')
    expect(result.current.progress.reasoningContent).toBe('because')
  })
})
