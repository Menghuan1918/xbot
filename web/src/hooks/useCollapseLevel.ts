/**
 * useCollapseLevel — shared preference for how Agent intermediate steps are
 * shown (Spec 7 §3.4). Persisted to localStorage under COLLAPSE_LEVEL_STORAGE_KEY
 * and broadcast via a tiny external store so every subscriber (the settings panel
 * and the Agent workspace) stays in sync without a provider.
 *
 * KISS: a single module-level store with useSyncExternalStore; no Context needed.
 */
import { useSyncExternalStore } from 'react'
import {
  COLLAPSE_LEVEL_STORAGE_KEY,
  type CollapseLevel,
} from '@/types/shared'

const DEFAULT_LEVEL: CollapseLevel = 'minimal'

function isValid(v: unknown): v is CollapseLevel {
  return v === 'all' || v === 'minimal' || v === 'none'
}

function readStored(): CollapseLevel {
  try {
    const v = localStorage.getItem(COLLAPSE_LEVEL_STORAGE_KEY)
    if (isValid(v)) return v
  } catch { /* ignore */ }
  return DEFAULT_LEVEL
}

function writeStored(level: CollapseLevel): void {
  try {
    localStorage.setItem(COLLAPSE_LEVEL_STORAGE_KEY, level)
  } catch { /* ignore */ }
}

// Module-level external store.
let current: CollapseLevel = readStored()
const listeners = new Set<() => void>()

/** "storage" event keeps tabs in sync across windows; only valid values win. */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== COLLAPSE_LEVEL_STORAGE_KEY) return
    const next = isValid(e.newValue) ? (e.newValue as CollapseLevel) : DEFAULT_LEVEL
    if (next === current) return
    current = next
    listeners.forEach((l) => l())
  })
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot(): CollapseLevel {
  return current
}

function setCollapseLevel(level: CollapseLevel): void {
  if (!isValid(level) || level === current) return
  current = level
  writeStored(level)
  listeners.forEach((l) => l())
}

/** Read + write the collapse-level preference, reactive across the app. */
export function useCollapseLevel(): {
  collapseLevel: CollapseLevel
  setCollapseLevel: (level: CollapseLevel) => void
} {
  const collapseLevel = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return { collapseLevel, setCollapseLevel }
}
