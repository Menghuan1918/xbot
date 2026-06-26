/**
 * Mock file tree for the right sidebar file browser/search (Spec 6 §3.3/§3.4).
 *
 * The real backend filesystem interface is out of scope (main design §2.2), so
 * the browser/search operate on this in-memory tree. Kept small and realistic
 * (mirrors a typical Vite + React project) so the UI is exercisable without a
 * backend. `flattenTree` is the shared projection both the explorer and search
 * consume.
 */
export interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileNode[]
  /** Monaco-ish language id used to pick a file-type icon. */
  language?: string
}

export const mockFileTree: FileNode[] = [
  {
    name: 'src',
    path: '/src',
    type: 'directory',
    children: [
      {
        name: 'components',
        path: '/src/components',
        type: 'directory',
        children: [
          { name: 'Button.tsx', path: '/src/components/Button.tsx', type: 'file', language: 'typescript' },
          { name: 'Card.tsx', path: '/src/components/Card.tsx', type: 'file', language: 'typescript' },
          {
            name: 'sidebar',
            path: '/src/components/sidebar',
            type: 'directory',
            children: [
              { name: 'FileExplorer.tsx', path: '/src/components/sidebar/FileExplorer.tsx', type: 'file', language: 'typescript' },
              { name: 'FileSearch.tsx', path: '/src/components/sidebar/FileSearch.tsx', type: 'file', language: 'typescript' },
              { name: 'DiffViewer.tsx', path: '/src/components/sidebar/DiffViewer.tsx', type: 'file', language: 'typescript' },
              { name: 'SessionConfig.tsx', path: '/src/components/sidebar/SessionConfig.tsx', type: 'file', language: 'typescript' },
            ],
          },
        ],
      },
      {
        name: 'hooks',
        path: '/src/hooks',
        type: 'directory',
        children: [
          { name: 'useTabManager.ts', path: '/src/hooks/useTabManager.ts', type: 'file', language: 'typescript' },
          { name: 'useSessionStore.ts', path: '/src/hooks/useSessionStore.ts', type: 'file', language: 'typescript' },
          { name: 'useWSConnection.ts', path: '/src/hooks/useWSConnection.ts', type: 'file', language: 'typescript' },
        ],
      },
      { name: 'App.tsx', path: '/src/App.tsx', type: 'file', language: 'typescript' },
      { name: 'main.tsx', path: '/src/main.tsx', type: 'file', language: 'typescript' },
      { name: 'index.css', path: '/src/index.css', type: 'file', language: 'css' },
    ],
  },
  { name: 'package.json', path: '/package.json', type: 'file', language: 'json' },
  { name: 'tsconfig.json', path: '/tsconfig.json', type: 'file', language: 'json' },
  { name: 'vite.config.ts', path: '/vite.config.ts', type: 'file', language: 'typescript' },
  { name: 'README.md', path: '/README.md', type: 'file', language: 'markdown' },
]

/** Flatten a tree into a list of file leaves (search projection). */
export function flattenFiles(nodes: FileNode[]): FileNode[] {
  const out: FileNode[] = []
  const walk = (list: FileNode[]): void => {
    for (const node of list) {
      if (node.type === 'directory') {
        if (node.children) walk(node.children)
      } else {
        out.push(node)
      }
    }
  }
  walk(nodes)
  return out
}

/** Derive the Monaco-ish language id from a file path's extension. */
export function languageFromPath(path: string): string | undefined {
  const ext = path.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'ts':
    case 'tsx':
      return 'typescript'
    case 'js':
    case 'jsx':
      return 'javascript'
    case 'json':
      return 'json'
    case 'md':
      return 'markdown'
    case 'css':
      return 'css'
    default:
      return undefined
  }
}
