/**
 * DockviewContainer — mounts the imperative Dockview layout and bridges it
 * to React.
 *
 * `dockview` (v7) ships only a framework-agnostic core — there is no
 * `<DockviewReact>`. So we:
 *   1. create a `DockviewComponent` on a host div in a mount-once effect,
 *   2. register `createComponent`/`createTabComponent` factories that mount
 *      React (createRoot) on the dockview-provided `element`,
 *   3. hand the resulting `DockviewApi` up to the parent's `useTabManager`
 *      via `bindApi` so tab ops drive the layout,
 *   4. seed an Agent tab (always present, not closable) on first ready.
 *
 * Context bridging: dockview hands the renderer its own detached DOM element,
 * so each `createRoot` is an isolated React tree that does NOT inherit the
 * app's Context providers. We re-wrap every panel/tab in the app's providers
 * (Theme, I18n, WS, Cwd, Auth), reading the live values via a ref kept in sync
 * from the outer tree.
 */
import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
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
import { ThemeContext } from '@/providers/theme'
import { I18nContext, type I18nContextValue } from '@/providers/i18n'
import { WSContext } from '@/providers/WSProvider'
import type { WSConnection } from '@/types/ws'
import { CwdContext, type CwdContextValue } from '@/providers/CwdProvider'
import { AuthContext, type AuthContextValue } from '@/providers/AuthProvider'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/providers/i18n'
import { useWSConnection } from '@/providers/WSProvider'
import { useCwd } from '@/providers/CwdProvider'
import { useAuth } from '@/hooks/useAuth'
import { useSessionStore, type SessionStore as SessionStoreType, SessionStoreContext } from '@/hooks/useSessionStore'
import type { ThemeContextValue } from '@/types/theme'
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

/** Live outer-tree context values handed to each isolated panel root. */
interface ContextRefs {
  theme: ThemeContextValue
  i18n: I18nContextValue
  ws: WSConnection
  cwd: CwdContextValue
  auth: AuthContextValue
  sessionStore: SessionStoreType
}

export function DockviewContainer({ tabManager, onReady }: DockviewContainerProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const apiRef = useRef<DockviewApi | null>(null)
  const seededRef = useRef(false)
  const tabManagerRef = useRef(tabManager)
  tabManagerRef.current = tabManager

  // Collect live context values from the outer tree.
  const themeValue = useTheme()
  const i18nValue = useI18n()
  const wsValue = useWSConnection()
  const cwdValue = useCwd()
  const authValue = useAuth()
  const sessionStoreValue = useSessionStore()
  const ctxRef = useRef<ContextRefs>({ theme: themeValue, i18n: i18nValue, ws: wsValue, cwd: cwdValue, auth: authValue, sessionStore: sessionStoreValue })
  ctxRef.current.theme = themeValue
  ctxRef.current.i18n = i18nValue
  ctxRef.current.ws = wsValue
  ctxRef.current.cwd = cwdValue
  ctxRef.current.auth = authValue
  ctxRef.current.sessionStore = sessionStoreValue

  // Force all panels + tab headers to re-render when theme/i18n changes.
  useEffect(() => {
    const api = apiRef.current
    if (!api) return
    for (const panel of api.panels) {
      panel.update({ params: panel.params as Record<string, unknown> })
    }
  }, [themeValue, i18nValue])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const options: DockviewComponentOptions = {
      theme: themeVisualStudio,
      createComponent: (opts) => new ReactContentRenderer(opts.name, ctxRef),
      createTabComponent: () => new ReactTabRenderer(ctxRef),
      // Without this, dockview falls back to its built-in DefaultTab which
      // always shows an X close button regardless of our closable flag.
      defaultTabComponent: 'react',
      // Suppress the right-click context menu which has a "close" action.
      getTabContextMenuItems: () => [],
    }

    let dockview: DockviewComponent
    try {
      dockview = new DockviewComponent(host, options)
    } catch {
      return
    }
    const api: DockviewApi = (dockview as unknown as { api: DockviewApi }).api
    apiRef.current = api
    const mgr = tabManagerRef.current
    mgr.bindApi(api)

    if (!seededRef.current) {
      seededRef.current = true
      // Seed the always-present Agent tab (not closable).
      mgr.openTab({
        type: 'agent',
        title: 'Agent',
        icon: 'bot',
        closable: false,
      })
      onReady?.()
    }

    return () => {
      tabManagerRef.current.bindApi(null)
      apiRef.current = null
      try { dockview.dispose() } catch { /* ignore */ }
    }
  }, [])

  return <div ref={hostRef} className="h-full w-full" />
}

/* ── React ↔ dockview renderers ── */

/** Wrap a node in the app's full provider stack for an isolated React root. */
function withProviders(node: ReactNode, ctxRef: RefObject<ContextRefs>): ReactNode {
  const ctx = ctxRef.current
  return (
    <ThemeContext.Provider value={ctx.theme}>
      <I18nContext.Provider value={ctx.i18n}>
        <WSContext.Provider value={ctx.ws}>
          <CwdContext.Provider value={ctx.cwd}>
            <AuthContext.Provider value={ctx.auth}>
              <SessionStoreContext.Provider value={ctx.sessionStore}>
                {node}
              </SessionStoreContext.Provider>
            </AuthContext.Provider>
          </CwdContext.Provider>
        </WSContext.Provider>
      </I18nContext.Provider>
    </ThemeContext.Provider>
  )
}

/**
 * Mounts a content panel React component on the dockview element.
 * `name` is the `component` string from addPanel, matching a TabType.
 */
class ReactContentRenderer implements IContentRenderer {
  readonly element: HTMLElement
  private root: Root | null = null
  private params: GroupPanelPartInitParameters | null = null
  private readonly name: string
  private readonly ctxRef: RefObject<ContextRefs>

  constructor(name: string, ctxRef: RefObject<ContextRefs>) {
    this.name = name
    this.ctxRef = ctxRef
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
      withProviders(
        <Component
          params={this.params.params as PanelParams}
          api={this.params.api}
          containerApi={this.params.containerApi}
        />,
        this.ctxRef,
      ),
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
  private readonly ctxRef: RefObject<ContextRefs>

  constructor(ctxRef: RefObject<ContextRefs>) {
    this.ctxRef = ctxRef
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
      withProviders(
        <TabHeader
          params={panelParams}
          api={this.params.api}
          isActive={isActive}
          onActivate={() => this.params?.api.setActive()}
        />,
        this.ctxRef,
      ),
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
