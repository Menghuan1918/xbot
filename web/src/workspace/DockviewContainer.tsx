/**
 * DockviewContainer — mounts the imperative Dockview layout and bridges it
 * to React (Spec 2 §3.3).
 *
 * `dockview` (v7) ships only a framework-agnostic core — there is no
 * `<DockviewReact>`. So we:
 *   1. create a `DockviewComponent` on a host div in a layout effect,
 *   2. register `createComponent`/`createTabComponent` factories that mount
 *      React (createRoot) on the dockview-provided `element`,
 *   3. hand the resulting `DockviewApi` up to the parent's `useTabManager`
 *      via `bindApi` so tab ops drive the layout,
 *   4. seed an Agent tab (always present, not closable) on first ready.
 *
 * React is only mounted once per panel; dockview owns the DOM lifetime and
 * calls `dispose()` on the renderer, which unmounts the React root. KISS: no
 * state syncing back into React — the tab manager derives its state from
 * dockview's panel events instead.
 */
import { useEffect, useRef } from 'react'
import {
  DockviewComponent,
  themeVisualStudio,
  type DockviewApi,
  type DockviewComponentOptions,
  type DockviewIDisposable,
  type GroupPanelPartInitParameters,
  type IContentRenderer,
  type ITabRenderer,
  type TabPartInitParameters,
} from 'dockview'
import { createRoot, type Root } from 'react-dom/client'

import { AgentPanel } from '@/workspace/panels/AgentPanel'
import { FilePanel } from '@/workspace/panels/FilePanel'
import { TerminalPanel } from '@/workspace/panels/TerminalPanel'
import { TabHeader } from '@/workspace/TabHeader'
import type { PanelParams } from '@/types/tab'
import type { TabManager } from '@/hooks/useTabManager'

interface DockviewContainerProps {
  /** The tab manager that owns tab operations; its api is bound on ready. */
  tabManager: TabManager
  /** Called once dockview is ready and seeded (for App-level wiring). */
  onReady?: () => void
}

/** Registry of content components keyed by TabType. */
const CONTENT_COMPONENTS = {
  agent: AgentPanel,
  file: FilePanel,
  terminal: TerminalPanel,
} as const

export function DockviewContainer({ tabManager, onReady }: DockviewContainerProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const apiRef = useRef<DockviewApi | null>(null)
  const seededRef = useRef(false)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const options: DockviewComponentOptions = {
      theme: themeVisualStudio,
      createComponent: (opts) => new ReactContentRenderer(opts.name),
      createTabComponent: () => new ReactTabRenderer(),
    }

    let dockview: DockviewComponent
    try {
      dockview = new DockviewComponent(host, options)
    } catch {
      return
    }
    const api: DockviewApi = (dockview as unknown as { api: DockviewApi }).api
    apiRef.current = api
    tabManager.bindApi(api)

    if (!seededRef.current) {
      seededRef.current = true
      // Seed the always-present Agent tab (not closable).
      tabManager.openTab({
        type: 'agent',
        title: 'Agent',
        icon: 'bot',
        closable: false,
      })
      onReady?.()
    }

    return () => {
      tabManager.bindApi(null)
      apiRef.current = null
      try { dockview.dispose() } catch { /* ignore */ }
    }
    // tabManager is stable across renders (useMemo'd); onReady is fire-once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabManager])

  return <div ref={hostRef} className="h-full w-full" />
}

/* ── React ↔ dockview renderers ── */

/**
 * Mounts a content panel React component on the dockview element.
 * `name` is the `component` string from addPanel, matching a TabType.
 */
class ReactContentRenderer implements IContentRenderer {
  readonly element: HTMLElement
  private root: Root | null = null
  private params: GroupPanelPartInitParameters | null = null
  private readonly name: string

  constructor(name: string) {
    this.name = name
    this.element = document.createElement('div')
    this.element.className = 'h-full w-full overflow-hidden'
  }

  init(parameters: GroupPanelPartInitParameters): void {
    this.params = parameters
    this.root = createRoot(this.element)
    this.render()
  }

  /** Re-render on params update (dockview calls update() → we re-render). */
  update(): void {
    this.render()
  }

  private render(): void {
    if (!this.root || !this.params) return
    const Component = CONTENT_COMPONENTS[this.name as keyof typeof CONTENT_COMPONENTS]
    if (!Component) return
    this.root.render(
      <Component
        params={this.params.params as PanelParams}
        api={this.params.api}
        containerApi={this.params.containerApi}
      />,
    )
  }

  dispose(): void {
    this.root?.unmount()
    this.root = null
    this.params = null
  }
}

/**
 * Mounts the custom TabHeader React component as the dockview tab.
 * Active state comes from `containerApi.onDidActivePanelChange` (comparing the
 * event's panel id with this tab's panel id) so the accent bar tracks focus.
 */
class ReactTabRenderer implements ITabRenderer {
  readonly element: HTMLElement
  private root: Root | null = null
  private params: TabPartInitParameters | null = null
  private activeSub: DockviewIDisposable | null = null

  constructor() {
    this.element = document.createElement('div')
    this.element.className = 'relative flex h-full min-w-0 items-center'
  }

  init(parameters: TabPartInitParameters): void {
    this.params = parameters
    this.root = createRoot(this.element)
    // Track the panel id this tab renders so we can match active-panel events.
    const panelId = (parameters.params as PanelParams & { id?: string }).tabId
    const onActive = parameters.containerApi.onDidActivePanelChange
    this.activeSub = onActive((e) => {
      const activeId = e.panel ? (e.panel.params as PanelParams).tabId : null
      this.render(activeId === panelId)
    })
    this.render(this.isActive())
  }

  update(): void {
    this.render(this.isActive())
  }

  /** Initial active state: this panel is active iff containerApi.activePanel is it. */
  private isActive(): boolean {
    if (!this.params) return false
    const active = this.params.containerApi.activePanel
    if (!active) return false
    return (active.params as PanelParams).tabId === (this.params.params as PanelParams).tabId
  }

  private render(isActive: boolean): void {
    if (!this.root || !this.params) return
    const panelParams = this.params.params as PanelParams
    this.root.render(
      <TabHeader
        params={panelParams}
        api={this.params.api}
        isActive={isActive}
        onActivate={() => this.params?.api.setActive()}
      />,
    )
  }

  dispose(): void {
    this.activeSub?.dispose()
    this.activeSub = null
    this.root?.unmount()
    this.root = null
    this.params = null
  }
}
