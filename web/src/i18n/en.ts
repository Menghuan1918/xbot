/**
 * en translation resources (Spec 1 设计系统基础).
 * Mirrors the zh-CN structure 1:1.
 */
import type { Translations } from './zh-CN'

const en: Translations = {
  common: {
    confirm: 'Confirm',
    cancel: 'Cancel',
    save: 'Save',
    delete: 'Delete',
    rename: 'Rename',
    search: 'Search',
    close: 'Close',
    new: 'New',
    loading: 'Loading...',
    error: 'Error',
    retry: 'Retry',
  },
  sidebar: {
    sessions: 'Sessions',
    files: 'Files',
    search: 'Search',
    diff: 'Diff',
    config: 'Config',
  },
  session: {
    all: 'All',
    byChannel: 'Channel',
    byTime: 'Time',
    byStatus: 'Status',
    newSession: 'New Session',
    workPath: 'Work Path',
    starred: 'Starred',
    status: {
      running: 'Running',
      waiting: 'Waiting for input',
      idle: 'Idle',
      error: 'Error',
    },
  },
  workspace: {
    agent: 'Agent',
    file: 'File',
    terminal: 'Terminal',
    preview: 'Preview',
    edit: 'Edit',
    splitRight: 'Split Right',
    closeTab: 'Close Tab',
  },
  settings: {
    title: 'Settings',
    // navigation
    nav: {
      appearance: 'Appearance',
      collapse: 'Collapse',
      language: 'Language',
      llm: 'LLM Config',
    },
    // appearance
    theme: 'Theme',
    dark: 'Dark',
    light: 'Light',
    accentColor: 'Accent Color',
    accentCustom: 'Custom',
    accentInvalid: 'Invalid color',
    // collapse
    collapseProcess: 'Collapse intermediate steps',
    collapseLevel: 'Collapse level',
    collapseLevelDesc: 'How Agent intermediate steps (tool calls / reasoning) are shown',
    collapseAll: 'Collapse all',
    collapseAllDesc: 'Show final output only',
    collapseMinimal: 'Minimal',
    collapseMinimalDesc: 'Show tool name and summary, collapse details',
    collapseNone: 'Expand all',
    collapseNoneDesc: 'Show every intermediate step',
    // language
    language: 'Language',
    languageDesc: 'Interface display language',
    // llm
    model: 'Model',
    modelDesc: 'Select the active LLM model',
    maxContext: 'Max context',
    maxContextDesc: 'Maximum tokens kept in the conversation context',
    maxOutputTokens: 'Max output tokens',
    maxOutputTokensDesc: 'Maximum tokens in a single response',
    thinkingMode: 'Thinking mode',
    thinkingModeDesc: 'Reasoning/thinking behavior (empty = auto)',
    loading: 'Loading...',
    loadFailed: 'Failed to load',
    saved: 'Saved',
    saveFailed: 'Failed to save',
    notConnected: 'Not connected to server',
  },
  designSystem: {
    title: 'Design System Foundation',
    themeToggle: 'Toggle theme',
    languageToggle: 'Toggle language',
  },
}

export default en
