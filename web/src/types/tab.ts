/**
 * Tab param types shared between useTabManager and DockviewContainer.
 *
 * `PanelParams` is what dockview hands to a panel content renderer and to a
 * custom tab header renderer (via the panel's `.params`). It carries the
 * logical tab id/type plus the domain payload (agent sessionId / file path).
 */
import type { TabType } from './shared'

export interface PanelParams {
  tabId: string
  type: TabType
  title: string
  /** Lucide icon name resolved by the TabHeader. */
  icon?: string
  sessionId?: string
  filePath?: string
  /** False suppresses the close button and blocks closeTab (agent tabs). */
  closable: boolean
}
