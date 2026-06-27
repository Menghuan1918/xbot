/**
 * TerminalPanel — real terminal panel backed by xterm.js (xterm spec §3.6).
 *
 * Replaces the Spec 2 placeholder. Each panel mounts one xterm.js Terminal +
 * FitAddon + WebLinksAddon and owns one TerminalWS data channel to
 * `/ws/terminal?tid=<tid>`. The tid comes from the terminal store session
 * keyed by the `terminalId` in the dockview panel params.
 *
 * Lifecycle (single teardown path): when this panel unmounts — for ANY reason
 * (tab X, middle-click, sidebar trash, app teardown) — its React cleanup sends a
 * close frame, disposes the terminal, removes itself from the store, and DELETEs
 * the backend PTY. The sidebar's close button simply closes the tab, which
 * unmounts this panel and runs that cleanup. This avoids split teardown logic.
 *
 * The store is a module-level singleton (see useTerminal) so this isolated
 * dockview panel can reach it without app Context (dockview mounts each panel in
 * a detached React root; see DockviewContainer). Theme + i18n ARE bridged via
 * withProviders, so useTheme works here.
 */
import { useEffect, useRef } from 'react'
import { Terminal, type ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'

import { useTheme } from '@/hooks/useTheme'
import { TerminalWS } from '@/lib/terminalWS'
import { terminalStore } from '@/hooks/useTerminal'
import { useI18n } from '@/providers/i18n'
import type { PanelProps } from '@/workspace/panels/types'

const FONT_FAMILY = 'Menlo, Monaco, "Courier New", monospace'
const FONT_SIZE = 13

/** Read a CSS custom property from :root (trimmed; undefined if missing). */
function cssVar(name: string): string | undefined {
  if (typeof window === 'undefined') return undefined
  const v = getComputedStyle(document.documentElement).getPropertyValue(name)
  const t = v.trim()
  return t || undefined
}

/** Build an xterm theme from the app's semantic CSS variables. */
function terminalTheme(): ITheme {
  const bg = cssVar('--bg-primary') ?? '#1e1e1e'
  const fg = cssVar('--text-primary') ?? '#cccccc'
  const accent = cssVar('--accent') ?? '#3388bb'
  return {
    background: bg,
    foreground: fg,
    cursor: accent,
    cursorAccent: bg,
    // Translucent accent for the selection highlight.
    selectionBackground: `${accent}55`,
  }
}

export function TerminalPanel({ params }: PanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const wsRef = useRef<TerminalWS | null>(null)
  /** tid captured at mount so cleanup can DELETE even if the session is gone. */
  const tidRef = useRef<string>('')
  const { theme, accentColor } = useTheme()
  const { t } = useI18n()
  const terminalId = params.terminalId

  // Mount-once: create the xterm instance + WS channel + ResizeObserver.
  // terminalId is stable for a panel's lifetime (each terminal has its own
  // dockview panel), so this effect runs once.
  useEffect(() => {
    const host = containerRef.current
    if (!host || !terminalId) return
    const session = terminalStore.getSession(terminalId)
    if (!session) return
    tidRef.current = session.tid

    const term = new Terminal({
      fontSize: FONT_SIZE,
      fontFamily: FONT_FAMILY,
      cursorBlink: true,
      allowProposedApi: true,
      theme: terminalTheme(),
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.loadAddon(new WebLinksAddon())
    term.open(host)
    termRef.current = term
    fitRef.current = fit

    const doFit = () => {
      try {
        fit.fit()
      } catch {
        /* container has no size yet — ResizeObserver will retry */
      }
      if (wsRef.current) {
        wsRef.current.resize(term.cols, term.rows)
      }
    }
    doFit()

    const ws = new TerminalWS(session.tid, {
      onStdout: (data) => term.write(data),
      onStderr: (data) => term.write(data),
      onExit: (code) => {
        terminalStore.updateStatus(terminalId, 'exited', { exitCode: code })
        term.write(`\r\n\x1b[90m[process exited${code ? ` with code ${code}` : ''}]\x1b[0m\r\n`)
      },
      onError: (message) => {
        terminalStore.updateStatus(terminalId, 'error', { error: message })
        term.write(`\r\n\x1b[31m[error: ${message}]\x1b[0m\r\n`)
      },
      onOpen: () => {
        terminalStore.updateStatus(terminalId, 'connected')
        doFit()
      },
      onClose: (willReconnect) => {
        // Only reflect a transient drop as "connecting" (reconnecting); explicit
        // close / exit / error are handled by their own callbacks + unmount.
        if (willReconnect) terminalStore.updateStatus(terminalId, 'connecting')
      },
    })
    wsRef.current = ws

    // xterm user input → PTY stdin.
    const onData = term.onData((data) => ws.sendStdin(data))

    // Adaptive resize: observe the host and refit + tell the backend.
    const ro = new ResizeObserver(() => doFit())
    ro.observe(host)

    return () => {
      ro.disconnect()
      onData.dispose()
      // Send a close frame so the backend destroys the PTY immediately (no idle
      // grace wait); the DELETE below is a reliable fallback for dropped frames.
      ws.close()
      wsRef.current = null
      term.dispose()
      termRef.current = null
      fitRef.current = null
      terminalStore.remove(terminalId)
      void terminalStore.deleteBackend(tidRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminalId])

  // Re-apply the xterm theme when the app theme or accent color changes.
  // (Theme changes also force a panel.update() in DockviewContainer, but the
  // xterm instance itself needs its options.theme swapped here.)
  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.theme = terminalTheme()
    }
  }, [theme, accentColor])

  if (!terminalId || !terminalStore.getSession(terminalId)) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-text-secondary">
        {t('workspace.terminal')} — {t('sidebar.terminalUnavailable')}
      </div>
    )
  }

  return <div ref={containerRef} className="h-full w-full overflow-hidden bg-[var(--bg-primary)]" />
}
