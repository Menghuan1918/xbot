/**
 * DiffViewer — line diff between two text blocks (Spec 6 §3.5).
 *
 * Two editable areas (original / modified) on top, a rendered diff below.
 * Uses a lightweight line-level LCS diff — no heavy Monaco here (Monaco itself
 * is Spec 5; pulling it in just for diff would balloon the bundle for a
 * lightweight sidebar). The diff colors lines:
 *   - removed  (in original, not in modified)  → red background
 *   - added    (in modified, not in original)    → green background
 *   - unchanged                              → muted
 *
 * The LCS runs over the full lines; char-level sub-highlighting would be a
 * nice-to-have but isn't required by the acceptance criteria (KISS).
 */
import { useMemo, useState } from 'react'

import { useI18n } from '@/providers/i18n'
import { ScrollArea } from '@/components/ui/scroll-area'

type DiffOp = { kind: 'equal' | 'added' | 'removed'; text: string }

/** Line-level diff via LCS DP. O(n*m) is fine for small inputs. */
function lineDiff(a: string[], b: string[]): DiffOp[] {
  const n = a.length
  const m = b.length
  // dp[i][j] = LCS length of a[i:] and b[j:]
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const out: DiffOp[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ kind: 'equal', text: a[i] })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ kind: 'removed', text: a[i] })
      i++
    } else {
      out.push({ kind: 'added', text: b[j] })
      j++
    }
  }
  while (i < n) out.push({ kind: 'removed', text: a[i++] })
  while (j < m) out.push({ kind: 'added', text: b[j++] })
  return out
}

const SAMPLE_A = `function greet(name) {
  console.log("Hello, " + name);
  return true;
}`

const SAMPLE_B = `function greet(name) {
  console.log(\`Hello, \${name}!\`);
  return true;
}`

export function DiffViewer() {
  const { t } = useI18n()
  const [original, setOriginal] = useState(SAMPLE_A)
  const [modified, setModified] = useState(SAMPLE_B)

  const diff = useMemo(() => {
    // Treat fully-empty inputs as "no diff" (avoids the degenerate [""] → ["",""]
    // two-line render and surfaces the empty-state hint). Otherwise LCS the lines.
    if (original.trim() === '' && modified.trim() === '') return []
    return lineDiff(original.split('\n'), modified.split('\n'))
  }, [original, modified])

  return (
    <div className="flex h-full flex-col">
      <div className="grid flex-shrink-0 grid-cols-2 gap-px border-b bg-border">
        <textarea
          value={original}
          onChange={(e) => setOriginal(e.target.value)}
          spellCheck={false}
          aria-label={t('sidebar.original')}
          className="h-28 resize-none bg-bg-primary p-2 font-mono text-xs text-text-primary outline-none"
          placeholder={t('sidebar.original')}
        />
        <textarea
          value={modified}
          onChange={(e) => setModified(e.target.value)}
          spellCheck={false}
          aria-label={t('sidebar.modified')}
          className="h-28 resize-none bg-bg-primary p-2 font-mono text-xs text-text-primary outline-none"
          placeholder={t('sidebar.modified')}
        />
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <pre className="min-w-full font-mono text-xs leading-5">
          {diff.map((op, idx) => (
            <DiffLine key={idx} op={op} />
          ))}
          {diff.length === 0 && (
            <div className="px-3 py-6 text-center text-text-muted">{t('sidebar.diffEmpty')}</div>
          )}
        </pre>
      </ScrollArea>
    </div>
  )
}

function DiffLine({ op }: { op: DiffOp }) {
  const bg =
    op.kind === 'added'
      ? 'var(--diff-added)'
      : op.kind === 'removed'
        ? 'var(--diff-removed)'
        : 'transparent'
  const fg = op.kind === 'equal' ? 'var(--text-secondary)' : 'var(--text-primary)'
  const marker = op.kind === 'added' ? '+' : op.kind === 'removed' ? '-' : ' '
  return (
    <div className="flex whitespace-pre" style={{ backgroundColor: bg }}>
      <span className="select-none px-2 text-text-muted">{marker}</span>
      <span className="whitespace-pre px-1" style={{ color: fg }}>
        {op.text || ' '}
      </span>
    </div>
  )
}
