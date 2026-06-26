/**
 * Tests for ProgressStore throttling + snapshot semantics (Spec 4).
 *
 * The store must coalesce many high-frequency mutations (one per streamed
 * token) into at most one notify per animation frame, and hand out a stable
 * snapshot reference between notifies (so useSyncExternalStore does not loop).
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

import { ProgressStore } from '@/components/agent/progressStore'

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
      reasoningContent: '',
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
    expect(store.getSnapshot().reasoningContent).toBe('foo bar')
    store.dispose()
  })

  it('pushIteration appends a snapshot', () => {
    const store = new ProgressStore()
    store.pushIteration({ iteration: 1, tools: [] })
    store.pushIteration({ iteration: 2, tools: [{ name: 'Read', status: 'done' }] })
    flushRaf()
    expect(store.getSnapshot().iterationHistory).toHaveLength(2)
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
