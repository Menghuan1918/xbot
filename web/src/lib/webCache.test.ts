import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearWebCaches,
  lastSeqCache,
  loadSessionTreeCache,
  messagesCache,
  progressSnapshotCache,
  saveSessionTreeCache,
  SESSION_TREE_CACHE_KEY,
} from './webCache'
import type { SessionInfo } from '@/types/shared'

const session: SessionInfo = {
  chatID: 'chat-1',
  channel: 'web',
  label: 'Chat',
  lastActive: '2026-07-13T00:00:00Z',
  preview: '',
  status: 'idle',
  isCurrent: true,
}

beforeEach(() => {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
  })
  messagesCache.clear()
  lastSeqCache.clear()
  progressSnapshotCache.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('web caches', () => {
  it('persists a versioned session tree', () => {
    saveSessionTreeCache([session], [])
    expect(loadSessionTreeCache()).toEqual({ version: 1, sessions: [session], subAgents: [] })
  })

  it('clears local and in-memory cache layers together', () => {
    localStorage.setItem(SESSION_TREE_CACHE_KEY, '{}')
    messagesCache.set('chat-1', [])
    lastSeqCache.set('chat-1', 4)
    progressSnapshotCache.set('chat-1', { phase: 'tool' })

    clearWebCaches()

    expect(localStorage.getItem(SESSION_TREE_CACHE_KEY)).toBeNull()
    expect(messagesCache.size).toBe(0)
    expect(lastSeqCache.size).toBe(0)
    expect(progressSnapshotCache.size).toBe(0)
  })
})
