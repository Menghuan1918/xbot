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
    appearance: 'Appearance',
    theme: 'Theme',
    dark: 'Dark',
    light: 'Light',
    accentColor: 'Accent Color',
    collapseProcess: 'Collapse intermediate steps',
    language: 'Language',
  },
  designSystem: {
    title: 'Design System Foundation',
    themeToggle: 'Toggle theme',
    languageToggle: 'Toggle language',
  },
}

export default en
