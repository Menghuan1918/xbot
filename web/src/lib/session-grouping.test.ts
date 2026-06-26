/**
 * Unit tests for the pure session grouping/sort helpers (Spec 3 §3.2).
 *
 * Covers the four categories, starred-first + lastActive-desc ordering, and
 * group ordering (status/time fixed order, channel discovery order).
 */
import { describe, expect, it } from 'vitest'
import {
  groupSessions,
  sortSessions,
  type SessionGroup,
} from '@/lib/session-grouping'
import type { SessionInfo } from '@/types/shared'

function mk(p: Partial<SessionInfo> & { chatID: string }): SessionInfo {
  return {
    chatID: p.chatID,
    channel: p.channel ?? 'web',
    label: p.label ?? p.chatID,
    lastActive: p.lastActive ?? '2026-06-26T10:00:00Z',
    preview: p.preview ?? '',
    status: p.status ?? 'idle',
    isCurrent: p.isCurrent ?? false,
  }
}

describe('sortSessions', () => {
  it('puts starred first, then sorts lastActive desc within each tier', () => {
    const sessions = [
      mk({ chatID: 'a', lastActive: '2026-06-26T08:00:00Z' }),
      mk({ chatID: 'b', lastActive: '2026-06-26T09:00:00Z' }),
      mk({ chatID: 'c', lastActive: '2026-06-26T07:00:00Z' }),
    ]
    const sorted = sortSessions(sessions, ['a'])
    expect(sorted.map((s) => s.chatID)).toEqual(['a', 'b', 'c'])
  })

  it('with no starred, sorts purely by lastActive desc', () => {
    const sessions = [
      mk({ chatID: 'a', lastActive: '2026-06-01T00:00:00Z' }),
      mk({ chatID: 'b', lastActive: '2026-06-02T00:00:00Z' }),
      mk({ chatID: 'c', lastActive: '2026-05-30T00:00:00Z' }),
    ]
    const sorted = sortSessions(sessions, [])
    expect(sorted.map((s) => s.chatID)).toEqual(['b', 'a', 'c'])
  })
})

describe('groupSessions', () => {
  it("'all' returns a single group with everything sorted", () => {
    const sessions = [
      mk({ chatID: 'a', lastActive: '2026-06-26T08:00:00Z' }),
      mk({ chatID: 'b', lastActive: '2026-06-26T09:00:00Z' }),
    ]
    const groups = groupSessions(sessions, 'all', ['a'])
    expect(groups).toHaveLength(1)
    expect(groups[0].key).toBe('all')
    expect(groups[0].sessions.map((s) => s.chatID)).toEqual(['a', 'b'])
  })

  it("'status' groups in fixed order running→idle→error and skips empties", () => {
    const sessions = [
      mk({ chatID: 'a', status: 'idle' }),
      mk({ chatID: 'b', status: 'running' }),
      mk({ chatID: 'c', status: 'error' }),
    ]
    const groups = groupSessions(sessions, 'status', [])
    expect(groups.map((g) => g.key)).toEqual(['running', 'idle', 'error'])
  })

  it("'time' groups today/yesterday/earlier", () => {
    // Uses Date.now()/new Date() for bucketing — pin to a known "now".
    const realNow = Date.now
    Date.now = () => Date.parse('2026-06-26T12:00:00Z')
    try {
      const sessions = [
        mk({ chatID: 'today', lastActive: '2026-06-26T08:00:00Z' }),
        mk({ chatID: 'yesterday', lastActive: '2026-06-25T08:00:00Z' }),
        mk({ chatID: 'earlier', lastActive: '2026-06-01T08:00:00Z' }),
      ]
      const groups = groupSessions(sessions, 'time', []) as SessionGroup[]
      expect(groups.map((g) => g.key)).toEqual(['today', 'yesterday', 'earlier'])
    } finally {
      Date.now = realNow
    }
  })

  it("'channel' groups by channel in discovery order", () => {
    const sessions = [
      mk({ chatID: '1', channel: 'feishu' }),
      mk({ chatID: '2', channel: 'web' }),
      mk({ chatID: '3', channel: 'feishu' }),
    ]
    const groups = groupSessions(sessions, 'channel', [])
    expect(groups.map((g) => g.key)).toEqual(['feishu', 'web'])
    expect(groups[0].sessions.map((s) => s.chatID)).toEqual(['1', '3'])
  })

  it('starred items float to the top within their group too', () => {
    const sessions = [
      mk({ chatID: 'a', lastActive: '2026-06-26T08:00:00Z', channel: 'web' }),
      mk({ chatID: 'b', lastActive: '2026-06-26T09:00:00Z', channel: 'web' }),
    ]
    const groups = groupSessions(sessions, 'channel', ['a'])
    expect(groups[0].sessions.map((s) => s.chatID)).toEqual(['a', 'b'])
  })
})
