/**
 * useTerminal — terminal session store + React hook (xterm.js spec §3.5).
 *
 * The terminal store is a **module-level singleton** (`terminalStore`) so it is
 * importable from two trees that do not share React context:
 *   - the right-sidebar `TerminalList` (normal app tree), and
 *   - the dockview `TerminalPanel`, which mounts in an isolated React root
 *     (dockview hands each panel a detached element; see DockviewContainer).
 *
 * Responsibilities split:
 *   - **Store** owns the terminal *list* (create / close / status / list) and the
 *     Dockview tab wiring (openTab / closeTab / focus).
 *   - **Panel** owns the live WS data channel + xterm instance and performs
 *     backend teardown (DELETE /api/terminal/{tid}) on unmount, then calls
 *     `terminalStore.remove(id)` to drop itself from the list. This keeps the
 *     teardown logic in exactly one place (the panel's React cleanup) regardless
 *     of whether the terminal is closed via the tab X, middle-click, or the
 *     sidebar trash button (all of which unmount the panel).
 *
 * Session-level lifecycle: terminals are tagged with their owning `chatID`. The
 * backend destroys a session's terminals on chat delete (`CleanupChat`); the
 * affected panel then receives a WS "terminal not found" error and removes
 * itself. Switching sessions does not close terminals (they persist in the
 * store) — matching "切换会话时终端保持".
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { useWSConnection } from '@/hooks/useWSConnection'
import { fetchHistory } from '@/components/agent/api'
import type { TabManager } from '@/hooks/useTabManager'
import type { TerminalSession, TerminalStatus } from '@/types/terminal'

let termSeq = 0
function genTermId(): string {
  termSeq += 1
  return `term-${Date.now().toString(36)}-${termSeq}`
}

/** Minimal tab operations the store needs from the Dockview tab manager. */
interface TabOps {
  openTab: (tab: {
    type: 'terminal'
    title: string
    icon: string
    closable: boolean
    data: { terminalId: string }
  }) => string
  closeTab: (id: string) => void
  setActiveTab: (id: string) => void
  tabs: ReadonlyArray<{ id: string; type: string; data?: { terminalId?: string } }>
}

interface CreateResponse {
  tid?: string
  error?: string
}

class TerminalStore {
  private sessions = new Map<string, TerminalSession>()
  private listeners = new Set<() => void>()
  private tabOps: TabOps | null = null

  /* ── binding ── */
  bindTabOps(ops: TabOps | null): void {
    this.tabOps = ops
  }

  /* ── subscription (React mirror) ── */
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  private notify(): void {
    this.listeners.forEach((fn) => fn())
  }

  /* ── reads ── */
  snapshot(): TerminalSession[] {
    return [...this.sessions.values()].sort((a, b) => a.createdAt - b.createdAt)
  }
  getSession(id: string): TerminalSession | null {
    return this.sessions.get(id) ?? null
  }

  /* ── writes ── */
  patch(id: string, partial: Partial<TerminalSession>): void {
    const s = this.sessions.get(id)
    if (!s) return
    this.sessions.set(id, { ...s, ...partial })
    this.notify()
  }
  updateStatus(id: string, status: TerminalStatus, extra?: Partial<TerminalSession>): void {
    this.patch(id, { status, ...extra })
  }
  remove(id: string): void {
    if (this.sessions.delete(id)) this.notify()
  }

  /** Resolve the Dockview tab id for a terminal (stored, else search tabs). */
  private tabIdFor(id: string): string | undefined {
    const s = this.sessions.get(id)
    if (s?.tabId) return s.tabId
    const found = this.tabOps?.tabs.find(
      (t) => t.type === 'terminal' && t.data?.terminalId === id,
    )
    if (found) {
      this.patch(id, { tabId: found.id })
      return found.id
    }
    return undefined
  }

  /**
   * Create a backend PTY + register a session + open a Dockview tab.
   * Returns the frontend terminal id, or null on failure.
   */
  async createTerminal(chatID: string, cwd: string): Promise<string | null> {
    let tid: string
    try {
      const res = await fetch('/api/terminal/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatID, cwd }),
      })
      const data = (await res.json().catch(() => ({}))) as CreateResponse
      if (!res.ok || !data.tid) {
        throw new Error(data.error || `create ${res.status}`)
      }
      tid = data.tid
    } catch {
      return null
    }

    const id = genTermId()
    const session: TerminalSession = {
      id,
      tid,
      chatID,
      cwd,
      title: `Terminal ${termSeq}`,
      status: 'connecting',
      createdAt: Date.now(),
    }
    this.sessions.set(id, session)
    this.notify()

    const tabId =
      this.tabOps?.openTab({
        type: 'terminal',
        title: session.title,
        icon: 'terminal',
        closable: true,
        data: { terminalId: id },
      }) ?? ''
    if (tabId) this.patch(id, { tabId: tabId })
    // If tabId is '' the tab was queued before dockview was ready; tabIdFor()
    // recovers it from the tabs list on the next focus/close.
    return id
  }

  /** Focus a terminal's tab (sidebar click). No-op if the tab is gone. */
  focusTerminal(id: string): void {
    const tabId = this.tabIdFor(id)
    if (tabId) this.tabOps?.setActiveTab(tabId)
  }

  /**
   * Close a terminal via its tab. Closing the tab unmounts the panel, whose
   * cleanup disposes the WS and DELETEs the backend, then removes the session.
   * If there is no tab (panel never mounted), tear down directly here.
   */
  closeTerminal(id: string): void {
    const tabId = this.tabIdFor(id)
    if (tabId) {
      this.tabOps?.closeTab(tabId)
      return
    }
    // No tab → no panel owns a WS. Tear down the backend + drop the session.
    const s = this.sessions.get(id)
    this.remove(id)
    if (s) void this.deleteBackend(s.tid)
  }

  /** DELETE /api/terminal/{tid} (best-effort; terminal may already be gone). */
  async deleteBackend(tid: string): Promise<void> {
    try {
      await fetch(`/api/terminal/${encodeURIComponent(tid)}`, { method: 'DELETE' })
    } catch {
      /* ignore — backend idle-reaps orphaned terminals */
    }
  }
}

/** Module-level singleton — survives re-renders and is importable anywhere. */
export const terminalStore = new TerminalStore()

export interface TerminalManager {
  terminals: TerminalSession[]
  createTerminal: () => Promise<string | null>
  closeTerminal: (id: string) => void
  focusTerminal: (id: string) => void
}

export function useTerminal(tabManager: TabManager): TerminalManager {
  const ws = useWSConnection()

  // Keep the store bound to the live tab manager (re-bind on identity change).
  useEffect(() => {
    const ops: TabOps = {
      openTab: (tab) => tabManager.openTab(tab),
      closeTab: (id) => tabManager.closeTab(id),
      setActiveTab: (id) => tabManager.setActiveTab(id),
      get tabs() {
        return tabManager.tabs
      },
    }
    terminalStore.bindTabOps(ops)
    return () => terminalStore.bindTabOps(null)
  }, [tabManager])

  // Mirror the store's snapshot into React state for the sidebar list.
  const [terminals, setTerminals] = useState<TerminalSession[]>(() =>
    terminalStore.snapshot(),
  )
  useEffect(
    () => terminalStore.subscribe(() => setTerminals(terminalStore.snapshot())),
    [],
  )

  const createTerminal = useCallback(async (): Promise<string | null> => {
    // Resolve the current session's chatID (server's active chat) + cwd so the
    // new terminal starts in the session's working directory.
    let chatID = ''
    try {
      const hist = await fetchHistory()
      chatID = hist.chat_id ?? ''
    } catch {
      /* fall through with empty chatID */
    }
    let cwd = ''
    if (chatID) {
      try {
        const r = await ws.rpc<{ dir?: string }>('get_cwd', {
          channel: 'web',
          chat_id: chatID,
        })
        cwd = r?.dir ?? ''
      } catch {
        /* non-fatal; backend falls back to the user's home dir */
      }
    }
    const id = await terminalStore.createTerminal(chatID, cwd)
    if (!id) toast.error('Failed to create terminal')
    return id
  }, [ws])

  const closeTerminal = useCallback((id: string) => terminalStore.closeTerminal(id), [])
  const focusTerminal = useCallback((id: string) => terminalStore.focusTerminal(id), [])

  return useMemo<TerminalManager>(
    () => ({ terminals, createTerminal, closeTerminal, focusTerminal }),
    [terminals, createTerminal, closeTerminal, focusTerminal],
  )
}
