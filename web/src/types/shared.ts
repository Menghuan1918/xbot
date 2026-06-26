/**
 * Shared domain types (Spec 1 设计系统基础).
 *
 * Pure data types consumed across specs. Stateful interfaces (WSConnection,
 * TabManager, SessionStore) are defined in Spec 2; keep them out of here.
 */

export type Theme = 'dark' | 'light'
export type Locale = 'zh-CN' | 'en'
export type TabType = 'agent' | 'file' | 'terminal'
export type SessionStatus = 'running' | 'waiting_input' | 'idle' | 'error'
export type SessionCategory = 'all' | 'channel' | 'time' | 'status'

export interface Tab {
  id: string
  type: TabType
  title: string
  icon?: string
  closable: boolean
  data?: TabData
}

export interface TabData {
  filePath?: string
  content?: string
  language?: string
  previewMode?: boolean
}

export interface SessionInfo {
  chatID: string
  channel: string
  label: string
  lastActive: string
  preview: string
  status: SessionStatus
  isCurrent: boolean
}
