/**
 * useTabManager — workspace tab operations + state derived from Dockview.
 *
 * Dockview owns the panels; this hook wraps its imperative API and mirrors the
 * panel list into React state (`tabs`/`activeTabId`) so non-dockview UI
 * (counts, badges) can read it. There is exactly one DockviewApi per app,
 * registered by `DockviewContainer` via `bindApi`.
 *
 * Acceptance rules:
 *   - Agent tabs are not closable (closeTab is a no-op for them; the custom
 *     TabHeader also suppresses the close button for `closable=false`).
 *   - At least one Agent tab stays open.
 *   - New tabs split right by default when there is an active group.
 *
 * Why derive state from dockview rather than own it: dockview already tracks
 * panel add/remove/active transitions, drag-split, and popouts. Owning a
 * parallel list and keeping it in sync would duplicate that source of truth
 * and race on drag/drop. Deriving avoids the duplication (KISS).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { DockviewApi, IDockviewPanel } from 'dockview'
import type { Tab } from '@/types/shared'
import type { PanelParams } from '@/types/tab'

let idSeq = 0
function genId(prefix: string): string {
  idSeq += 1
  return `${prefix}-${Date.now().toString(36)}-${idSeq}`
}

/** Build a logical Tab from a dockview panel (params is the source). */
function panelToTab(panel: IDockviewPanel): Tab | null {
  const params = panel.params as PanelParams | undefined
  if (!params?.tabId) return null
  return {
    id: params.tabId,
    type: params.type,
    title: params.title,
    icon: params.icon,
    closable: params.closable,
    data:
      params.type === 'file'
        ? { filePath: params.filePath }
        : params.type === 'agent'
          ? { filePath: params.sessionId }
          : undefined,
  }
}

export interface TabManager {
  tabs: Tab[]
  activeTabId: string | null
  /** Open or focus a tab by logical key; returns the tab id. */
  openTab: (tab: Omit<Tab, 'id'>) => string
  /** Close a tab (agent tabs protected). */
  closeTab: (id: string) => void
  /** Focus a tab by id. */
  setActiveTab: (id: string) => void
  /** Move a tab's panel into a new group to its right (split view). */
  splitRight: (id: string) => void
  /** Register the DockviewApi (called by DockviewContainer on ready). */
  bindApi: (api: DockviewApi | null) => void
}

export function useTabManager(): TabManager {
  const apiRef = useRef<DockviewApi | null>(null)
  // logical tabId → dockview panel id
  const panelIdByTab = useRef<Map<string, string>>(new Map())
  // pending tabs queued before the API is bound (so openTab before ready works)
  const pending = useRef<Omit<Tab, 'id'>[]>([])

  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)

  const resync = useCallback(() => {
    const api = apiRef.current
    if (!api) return
    setTabs(api.panels.map(panelToTab).filter(Boolean) as Tab[])
    const active = api.activePanel ? (api.activePanel.params as PanelParams).tabId : null
    setActiveTabId(active)
  }, [])

  const bindApi = useCallback(
    (api: DockviewApi | null) => {
      apiRef.current = api
      if (!api) return
      const offAdd = api.onDidAddPanel(resync)
      const offRemove = api.onDidRemovePanel(resync)
      const offActive = api.onDidActivePanelChange(resync)
      // Snapshot current state and flush queued tabs.
      resync()
      const queued = pending.current
      pending.current = []
      queued.forEach((t) => openTabInternal(t))
      // Cleanup is owned by the container's effect; store disposers on the api ref.
      ;(apiRef as unknown as { _dispose?: () => void })._dispose = () => {
        offAdd.dispose()
        offRemove.dispose()
        offActive.dispose()
      }
    },
    [resync],
  )

  const openTabInternal = useCallback((input: Omit<Tab, 'id'>): string => {
    const api = apiRef.current
    if (!api) {
      pending.current.push(input)
      return ''
    }
    const key = logicalKey(input)
    // Focus an existing tab with the same logical key instead of duplicating.
    if (key) {
      for (const [tabId, panelId] of panelIdByTab.current) {
        const panel = api.getPanel(panelId)
        const params = panel?.params as PanelParams | undefined
        if (params && logicalKeyFromParams(params) === key) {
          panel?.api.setActive()
          return tabId
        }
      }
    }
    const tabId = genId(input.type)
    const panelId = `dv-${tabId}`
    const group = api.activeGroup
    const position = group ? { direction: 'right' as const, referenceGroup: group } : undefined
    const params: PanelParams = {
      tabId,
      type: input.type,
      title: input.title,
      icon: input.icon,
      sessionId: input.type === 'agent' ? input.data?.filePath : undefined,
      filePath: input.type === 'file' ? input.data?.filePath : undefined,
      closable: input.closable,
    }
    api.addPanel({ id: panelId, title: input.title, component: input.type, params, position })
    panelIdByTab.current.set(tabId, panelId)
    return tabId
  }, [])

  const openTab = useCallback(
    (input: Omit<Tab, 'id'>): string => openTabInternal(input),
    [openTabInternal],
  )

  const closeTab = useCallback((id: string) => {
    const api = apiRef.current
    const panelId = panelIdByTab.current.get(id)
    if (!api || !panelId) return
    const panel = api.getPanel(panelId)
    if (!panel) return
    const params = panel.params as PanelParams
    if (!params.closable) return // agent tabs are not closable
    // Block closing the last agent tab.
    if (params.type === 'agent') {
      const agentCount = api.panels.filter((p) => (p.params as PanelParams).type === 'agent').length
      if (agentCount <= 1) return
    }
    panel.api.close()
  }, [])

  const setActiveTab = useCallback((id: string) => {
    const api = apiRef.current
    const panelId = panelIdByTab.current.get(id)
    const panel = panelId ? api?.getPanel(panelId) : undefined
    panel?.api.setActive()
  }, [])

  const splitRight = useCallback((id: string) => {
    const api = apiRef.current
    const panelId = panelIdByTab.current.get(id)
    const panel = panelId ? api?.getPanel(panelId) : undefined
    if (!api || !panel) return
    // Move the panel into a brand-new group to the right of its current group.
    panel.api.moveTo({ group: panel.group, position: 'right' })
  }, [])

  // When unmounting, drop the dockview disposers we attached on bindApi.
  useEffect(() => {
    return () => {
      const disposer = (apiRef as unknown as { _dispose?: () => void })._dispose
      disposer?.()
      panelIdByTab.current.clear()
    }
  }, [])

  return {
    tabs,
    activeTabId,
    openTab,
    closeTab,
    setActiveTab,
    splitRight,
    bindApi,
  }
}

function logicalKey(input: Pick<Tab, 'type' | 'data'>): string {
  if (input.type === 'file' && input.data?.filePath) return `file:${input.data.filePath}`
  if (input.type === 'agent' && input.data?.filePath) return `agent:${input.data.filePath}`
  if (input.type === 'terminal') return 'terminal'
  return ''
}

function logicalKeyFromParams(p: PanelParams): string {
  if (p.type === 'file') return p.filePath ? `file:${p.filePath}` : ''
  if (p.type === 'agent') return p.sessionId ? `agent:${p.sessionId}` : ''
  if (p.type === 'terminal') return 'terminal'
  return ''
}
