/**
 * Tests for ProgressStore throttling + snapshot semantics (Spec 4).
 *
 * The store must coalesce many high-frequency mutations (one per streamed
 * token) into at most one notify per animation frame, and hand out a stable
 * snapshot reference between notifies (so useSyncExternalStore does not loop).
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

import { ProgressStore, dedupMessages } from '@/components/agent/progressStore'

describe('ProgressStore', () => {
  let rafSpy: ReturnType<typeof vi.spyOn>
  let rafCallbacks: Array<() => void>

  beforeEach(() => {
    rafCallbacks = []
    // Capture rAF callbacks so we can flush them deterministically.
    rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafCallbacks.push(cb as () => void)
      return rafCallbacks.length
    })
  })

  afterEach(() => {
    rafSpy.mockRestore()
  })

  function flushRaf() {
    const cbs = rafCallbacks.splice(0, rafCallbacks.length)
    cbs.forEach((cb) => cb())
  }

  it('coalesces many mutations into one notify per frame', () => {
    const store = new ProgressStore()
    const calls = vi.fn()
    const unsub = store.subscribe(calls)

    // 1000 token appends in the same frame → exactly one notify after flush.
    for (let i = 0; i < 1000; i++) store.appendStreamContent('a')
    expect(calls).not.toHaveBeenCalled() // not yet flushed
    flushRaf()
    expect(calls).toHaveBeenCalledTimes(1)
    expect(store.getSnapshot().streamContent).toHaveLength(1000)

    unsub()
    store.dispose()
  })

  it('returns a stable snapshot reference between notifies', () => {
    const store = new ProgressStore()
    const unsub = store.subscribe(() => {})

    store.appendStreamContent('hi')
    flushRaf()
    const a = store.getSnapshot()
    const b = store.getSnapshot()
    expect(a).toBe(b) // same reference, no new notify in between

    store.appendStreamContent('!')
    flushRaf()
    const c = store.getSnapshot()
    expect(c).not.toBe(a) // new snapshot after a notify
    expect(c.streamContent).toBe('hi!')

    unsub()
    store.dispose()
  })

  it('replace resets and assigns fields', () => {
    const store = new ProgressStore()
    store.replace({
      streamContent: 'x',
      reasoningStreamContent: '',
      activeTools: [],
      completedTools: [],
      iteration: 2,
      iterationHistory: [],
      streaming: true,
    })
    flushRaf()
    expect(store.getSnapshot().streamContent).toBe('x')
    expect(store.getSnapshot().iteration).toBe(2)
    expect(store.getSnapshot().streaming).toBe(true)
    store.dispose()
  })

  it('reset clears accumulated content', () => {
    const store = new ProgressStore()
    store.appendStreamContent('abc')
    flushRaf()
    store.reset()
    flushRaf()
    expect(store.getSnapshot().streamContent).toBe('')
    expect(store.getSnapshot().streaming).toBe(false)
    store.dispose()
  })

  it('appendReasoningContent accumulates reasoning deltas', () => {
    const store = new ProgressStore()
    store.appendReasoningContent('foo ')
    store.appendReasoningContent('bar')
    flushRaf()
    expect(store.getSnapshot().reasoningStreamContent).toBe('foo bar')
    store.dispose()
  })

  it('setIterationHistory appends snapshots', () => {
    const store = new ProgressStore()
    store.setIterationHistory([{ iteration: 1, thinking: '', reasoning: '', tools: [], toolCount: 0 }])
    store.setIterationHistory([{ iteration: 2, thinking: '', reasoning: '', tools: [{ name: 'Read', label: '', status: 'done', elapsedMs: 0, summary: '', detail: '', args: '', toolHints: '' }], toolCount: 1 }])
    flushRaf()
    expect(store.getSnapshot().iterationHistory).toHaveLength(1) // second call replaces
    store.dispose()
  })

  it('does not notify after dispose', () => {
    const store = new ProgressStore()
    store.dispose()
    const calls = vi.fn()
    store.subscribe(calls)
    store.appendStreamContent('z')
    flushRaf()
    expect(calls).not.toHaveBeenCalled()
  })
})

// ── Spec 3: stream-only patch, carry-forward, iteration snapshot, dedup ──

describe('ProgressStore stream-only patch + carry-forward (Spec 3)', () => {
  let rafSpy: ReturnType<typeof vi.spyOn>
  let rafCallbacks: Array<() => void>

  beforeEach(() => {
    rafCallbacks = []
    rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafCallbacks.push(cb as () => void)
      return rafCallbacks.length
    })
  })
  afterEach(() => rafSpy.mockRestore())

  function flushRaf() {
    rafCallbacks.splice(0, rafCallbacks.length).forEach((cb) => cb())
  }

  it('carry-forward: structured event preserves accumulated streamContent', () => {
    const store = new ProgressStore()
    // Step 1: accumulate stream content
    store.appendStreamContent('Hello ')
    store.appendStreamContent('world')
    flushRaf()
    expect(store.getSnapshot().streamContent).toBe('Hello world')

    // Step 2: structured event arrives — streamContent must NOT be overwritten
    store.setStructuredTools({
      phase: 'tool_exec',
      iteration: 1,
      activeTools: [{ name: 'Read', label: '', status: 'running', elapsedMs: 0, summary: '', detail: '', args: '', toolHints: '' }],
    })
    flushRaf()

    const snap = store.getSnapshot()
    expect(snap.streamContent).toBe('Hello world') // preserved!
    expect(snap.phase).toBe('tool_exec')
    expect(snap.iteration).toBe(1)
    expect(snap.activeTools[0].name).toBe('Read')
    store.dispose()
  })

  it('carry-forward: structured event preserves reasoningStreamContent', () => {
    const store = new ProgressStore()
    store.appendReasoningContent('thinking ')
    store.appendReasoningContent('deeply')
    flushRaf()

    store.setStructuredTools({ phase: 'thinking', iteration: 1 })
    flushRaf()

    expect(store.getSnapshot().reasoningStreamContent).toBe('thinking deeply')
    store.dispose()
  })

  it('iteration snapshot: iteration change snapshots previous iteration', () => {
    const store = new ProgressStore()
    // First iteration — set up state
    store.setStructuredTools({ phase: 'thinking', iteration: 1 })
    store.appendStreamContent('iter1 text')
    store.setStructuredTools({
      phase: 'tool_exec',
      iteration: 1,
      reasoning: 'iter1 reasoning',
      completedTools: [{ name: 'Read', label: '', status: 'done', elapsedMs: 10, summary: 'ok', detail: '', args: '', toolHints: '' }],
    })
    flushRaf()

    // Second iteration — should snapshot iteration 1
    store.setStructuredTools({ phase: 'thinking', iteration: 2 })
    flushRaf()

    const snap = store.getSnapshot()
    expect(snap.iterationHistory).toHaveLength(1)
    expect(snap.iterationHistory[0].iteration).toBe(1)
    expect(snap.iterationHistory[0].reasoning).toBe('iter1 reasoning')
    expect(snap.iterationHistory[0].tools).toHaveLength(1)
    expect(snap.iterationHistory[0].tools[0].name).toBe('Read')
    store.dispose()
  })

  it('iteration snapshot: no snapshot on first iteration (lastIter=-1)', () => {
    const store = new ProgressStore()
    // First structured event — lastIter starts at -1, no snapshot
    store.setStructuredTools({ phase: 'thinking', iteration: 1 })
    flushRaf()
    expect(store.getSnapshot().iterationHistory).toHaveLength(0)
    expect(store.getSnapshot().lastIter).toBe(1)
    store.dispose()
  })
})

describe('ProgressStore tool dedup (Spec 3)', () => {
  let rafSpy: ReturnType<typeof vi.spyOn>
  let rafCallbacks: Array<() => void>

  beforeEach(() => {
    rafCallbacks = []
    rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafCallbacks.push(cb as () => void)
      return rafCallbacks.length
    })
  })
  afterEach(() => rafSpy.mockRestore())

  function flushRaf() {
    rafCallbacks.splice(0, rafCallbacks.length).forEach((cb) => cb())
  }

  it('dedupTools: generating tools are never deduped', () => {
    const store = new ProgressStore()
    const genTool = (name: string) => ({ name, label: '', status: 'generating' as const, elapsedMs: 0, summary: '', detail: '', args: '', toolHints: '' })
    store.setStructuredTools({
      phase: 'tool_exec',
      iteration: 1,
      activeTools: [genTool('Read'), genTool('Read'), genTool('Read')],
    })
    flushRaf()
    expect(store.getSnapshot().activeTools).toHaveLength(3) // all 3 kept
    store.dispose()
  })

  it('dedupTools: running/done/error tools dedup by name+label', () => {
    const store = new ProgressStore()
    const doneTool = (name: string, label = '') => ({ name, label, status: 'done' as const, elapsedMs: 0, summary: '', detail: '', args: '', toolHints: '' })
    store.setStructuredTools({
      phase: 'tool_exec',
      iteration: 1,
      completedTools: [
        doneTool('Read', 'file1.go'),
        doneTool('Read', 'file1.go'), // dup — should be removed
        doneTool('Read', 'file2.go'), // different label — kept
        doneTool('Grep', ''),                          // different name — kept
      ],
    })
    flushRaf()
    expect(store.getSnapshot().completedTools).toHaveLength(3)
    store.dispose()
  })
})

describe('dedupMessages (Spec 3)', () => {
  it('keeps only the last message with the same turnID+role', () => {
    const msgs = [
      { turnID: 1, role: 'assistant', id: 'a1' },
      { turnID: 1, role: 'user', id: 'u1' },
      { turnID: 1, role: 'assistant', id: 'a2' }, // dup of a1
    ]
    const result = dedupMessages(msgs)
    expect(result).toHaveLength(2)
    expect(result.find((m) => m.role === 'assistant')!.id).toBe('a2') // last wins
  })

  it('keeps all messages with turnID=0 (history)', () => {
    const msgs = [
      { turnID: 0, role: 'user', id: 'u1' },
      { turnID: 0, role: 'assistant', id: 'a1' },
      { turnID: 0, role: 'user', id: 'u2' },
      { turnID: 0, role: 'assistant', id: 'a2' },
    ]
    const result = dedupMessages(msgs)
    expect(result).toHaveLength(4) // all kept
  })
})
