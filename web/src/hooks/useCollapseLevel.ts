/**
 * useCollapseLevel — reads/writes the Agent intermediate-process collapse
 * preference (Spec 4 §3.3 / §3.10).
 *
 * Persisted at localStorage key `xbot-collapse-level`. Values:
 *   'all'     — collapse all intermediate steps, show only final output
 *   'minimal' — show tool name + summary, collapse details
 *   'none'    — expand everything
 *
 * Spec 7's settings panel will offer the same control; Spec 4 only needs the
 * read + a lightweight in-component override. The hook keeps one global state
 * instance so all Agent panels stay in sync and the storage event keeps tabs
 * consistent across windows.
 */
import { useCallback, useEffect, useState } from 'react'

import {
  COLLAPSE_LEVELS,
  COLLAPSE_LEVEL_STORAGE_KEY,
  DEFAULT_COLLAPSE_LEVEL,
  type CollapseLevel,
} from '@/types/agent'

function readStored(): CollapseLevel {
  try {
    const v = localStorage.getItem(COLLAPSE_LEVEL_STORAGE_KEY)
    if (v && (COLLAPSE_LEVELS as string[]).includes(v)) return v as CollapseLevel
  } catch {
    /* ignore */
  }
  return DEFAULT_COLLAPSE_LEVEL
}

export interface UseCollapseLevelResult {
  level: CollapseLevel
  setLevel: (level: CollapseLevel) => void
  /** Whether a given collapsible group should start open for this level. */
  defaultOpen: (kind: 'tool' | 'reasoning' | 'iteration') => boolean
}

/**
 * Resolve the default-open state for a collapsible group under a collapse level.
 * Pure helper, exported for components that manage their own open state.
 *
 *   none     → everything open
 *   all      → everything closed (final output only)
 *   minimal  → iteration history closed; reasoning closed (summary shown in
 *              header); tools closed (name+summary shown in header)
 */
export function defaultOpenForLevel(level: CollapseLevel, kind: 'tool' | 'reasoning' | 'iteration'): boolean {
  if (level === 'none') return true
  if (level === 'all') return false
  // 'minimal': every group shows a header summary and keeps its body closed.
  // `kind` is intentionally part of the signature so Spec 7 can diverge groups
  // without touching call sites; today all minimal groups behave the same.
  switch (kind) {
    case 'tool':
    case 'reasoning':
    case 'iteration':
      return false
  }
}

export function useCollapseLevel(): UseCollapseLevelResult {
  const [level, setLevelState] = useState<CollapseLevel>(readStored)

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === COLLAPSE_LEVEL_STORAGE_KEY) setLevelState(readStored())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const setLevel = useCallback((next: CollapseLevel) => {
    setLevelState(next)
    try {
      localStorage.setItem(COLLAPSE_LEVEL_STORAGE_KEY, next)
    } catch {
      /* ignore */
    }
  }, [])

  const defaultOpen = useCallback(
    (kind: 'tool' | 'reasoning' | 'iteration') => defaultOpenForLevel(level, kind),
    [level],
  )

  return { level, setLevel, defaultOpen }
}
