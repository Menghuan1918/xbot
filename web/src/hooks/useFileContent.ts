/**
 * useFileContent — file content loader (Spec 5 §3.8).
 *
 * Front-end Mock: returns a deterministic sample string per file extension
 * so the editor/preview components are exercisable without a backend file API
 * (which is out of scope — see Spec 5 §2). Swapping in a real `GET` later only
 * needs to replace `loadContent` below.
 *
 * State shape mirrors a typical content hook:
 *   - `content`  — current text (editable; FilePanel writes back via setContent)
 *   - `loading`  — true during the (mock) async load
 *   - `setContent` — imperative setter for the editor's onChange path
 *   - `imageUrl` — resolved image src for image files (placeholder), else null
 */
import { useCallback, useEffect, useState } from 'react'

import { fileExt, isImageFile } from '@/components/file/fileTypes'

export interface UseFileContentResult {
  content: string
  loading: boolean
  setContent: (next: string) => void
  imageUrl: string | null
}

/**
 * A tiny, dependency-free placeholder image: an inline SVG data URL sized to
 * the requested dimensions. Avoids network and keeps the demo self-contained.
 */
function placeholderImage(label: string): string {
  const safe = label.replace(/[&<>]/g, '')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">`
    + `<rect width="640" height="360" fill="#252526"/>`
    + `<rect x="1" y="1" width="638" height="358" fill="none" stroke="#3c3c3c"/>`
    + `<text x="50%" y="50%" font-family="monospace" font-size="28" fill="#cccccc"`
    + ` text-anchor="middle" dominant-baseline="middle">${safe}</text>`
    + `</svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

function generateMockContent(filePath: string): { content: string; imageUrl: string | null } {
  const ext = fileExt(filePath)
  const name = filePath.split('/').pop() || filePath || 'file'

  if (isImageFile(filePath)) {
    return { content: '', imageUrl: placeholderImage(name) }
  }

  switch (ext) {
    case '.md':
    case '.markdown':
      return { content: MOCK_MD, imageUrl: null }
    case '.ts':
    case '.tsx':
      return { content: MOCK_TS, imageUrl: null }
    case '.go':
      return { content: MOCK_GO, imageUrl: null }
    case '.json':
      return { content: MOCK_JSON, imageUrl: null }
    case '.py':
      return { content: MOCK_PY, imageUrl: null }
    default:
      return { content: MOCK_PLAINTEXT(name), imageUrl: null }
  }
}

/** Async-looking load so `loading` is observable; resolves on next tick. */
function loadContent(filePath: string): Promise<{ content: string; imageUrl: string | null }> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(generateMockContent(filePath)), 0)
  })
}

export function useFileContent(filePath: string): UseFileContentResult {
  const [content, setContent] = useState('')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    loadContent(filePath).then((res) => {
      if (cancelled) return
      setContent(res.content)
      setImageUrl(res.imageUrl)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [filePath])

  const setContentFn = useCallback((next: string) => setContent(next), [])

  return { content, loading, setContent: setContentFn, imageUrl }
}

/* ── Mock samples ─────────────────────────────────────────────────────── */

const MOCK_MD = `# Markdown 预览示例 · Markdown Preview

> Spec 5 文件 Tab — 复用 \`react-markdown\` + \`remark-gfm\` + \`rehype-katex\`。

## 功能特性

- **GFM 表格**、任务列表、删除线
- 代码块语法高亮（highlight.js）
- 数学公式（KaTeX）

## 表格

| 类型      | 模式   | 可切换 |
| --------- | ------ | ------ |
| Markdown  | 预览   | ✅     |
| 代码      | 编辑   | ✅     |
| 图片      | 预览   | ❌     |

## 任务清单

- [x] Monaco 编辑器封装
- [x] Markdown 预览
- [ ] 接入真实文件 API

## 代码块

\`\`\`typescript
interface FilePanelProps {
  filePath: string
  initialMode?: 'editor' | 'preview'
}
\`\`\`

## 数学公式

行内公式 $E = mc^2$，块级公式：

$$
\\int_{0}^{1} x^2 \\, dx = \\frac{1}{3}
$$
`

const MOCK_TS = `// Spec 5 — Monaco 编辑器示例 (TypeScript)
import { useEffect, useState } from 'react'

export function useCounter(initial: number = 0) {
  const [count, setCount] = useState(initial)

  useEffect(() => {
    console.log('count changed:', count)
  }, [count])

  const increment = () => setCount((c) => c + 1)
  const decrement = () => setCount((c) => c - 1)
  const reset = () => setCount(initial)

  return { count, increment, decrement, reset }
}
`

const MOCK_GO = `// Spec 5 — Monaco 编辑器示例 (Go)
package main

import "fmt"

// Fibonacci returns the n-th Fibonacci number.
func Fibonacci(n int) int {
	if n <= 1 {
		return n
	}
	a, b := 0, 1
	for i := 2; i <= n; i++ {
		a, b = b, a+b
	}
	return b
}

func main() {
	for i := 0; i < 10; i++ {
		fmt.Printf("fib(%d) = %d\\n", i, Fibonacci(i))
	}
}
`

const MOCK_JSON = `{
  "name": "xbot-web",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "test": "vitest run"
  },
  "dependencies": {
    "@monaco-editor/react": "^4.7.0",
    "react": "^19.2.4",
    "react-markdown": "^10.1.0"
  }
}
`

const MOCK_PY = `# Spec 5 — Monaco 编辑器示例 (Python)
def fibonacci(n: int) -> int:
    """Return the n-th Fibonacci number."""
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a


if __name__ == "__main__":
    for i in range(10):
        print(f"fib({i}) = {fibonacci(i)}")
`

function MOCK_PLAINTEXT(name: string): string {
  return `# ${name}\n\nThis file type has no dedicated sample content.\nEdit freely — content is not persisted (Spec 5 §2: front-end edit only).\n`
}
