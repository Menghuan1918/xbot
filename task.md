# 性能优化 + 折叠逻辑 + 动效

## 背景

xbot web 前端需要深度优化性能和渲染体验。当前存在以下问题：
1. Markdown 每帧全量重解析（O(L²)），流式期间严重卡顿
2. SessionStore 返回对象未 memo，导致 Dockview 所有面板频繁重渲染
3. Monaco Editor ~3MB 静态导入，未懒加载
4. 全部折叠时未折叠中间的 TEXT 输出（O），只折叠了 T 和 C
5. 折叠/展开无平滑动画过渡
6. highlight.js 无缓存

## 任务 1: MarkdownRenderer 防抖

文件: `web/src/components/agent/MarkdownRenderer.tsx`

在组件内部对 `content` 做 ~150ms 防抖，流式期间减少解析频率从 60fps → ~6fps。用户对 Markdown 渲染的 200ms 延迟几乎无感知。

实现方式：
```tsx
function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

// 在 MarkdownRenderer 中
const debouncedContent = useDebouncedValue(content, 150)
// 用 debouncedContent 代替 content 传给 <Markdown>
```

## 任务 2: SessionStore memo

文件: `web/src/hooks/useSessionStore.ts`

用 useMemo 包裹 `useSessionStoreImpl()` 的返回对象，避免每次渲染返回新引用导致所有面板重渲染。同时 memoize `sortedSessions` 和 `groups`。

```tsx
const sortedSessions = useMemo(() => sortSessions(sessions, starredIds), [sessions, starredIds])
const groups = useMemo(() => groupSessions(sessions, category, starredIds), [sessions, category, starredIds])
const value = useMemo(() => ({
  sessions, groups, sortedSessions, activeSessionId, ...
  // 函数们已 useCallback，无需加入依赖
}), [sessions, groups, sortedSessions, activeSessionId, starredIds, category, channel, loading, error])
return value
```

## 任务 3: Monaco 懒加载

文件: `web/src/workspace/DockviewContainer.tsx`

把 `FilePanel` 和 `TerminalPanel` 改为 `React.lazy` + `Suspense`，首次打开对应标签页时才加载。AgentPanel 保持静态导入。

```tsx
import { lazy, Suspense } from 'react'
const FilePanel = lazy(() => import('@/workspace/panels/FilePanel').then(m => ({ default: m.FilePanel })))
const TerminalPanel = lazy(() => import('@/workspace/panels/TerminalPanel').then(m => ({ default: m.TerminalPanel })))
```

在 `ReactContentRenderer.render()` 中包裹 Suspense（fallback 用简单的 loading spinner）。

## 任务 4: highlight.js 缓存

文件: `web/src/components/agent/highlight.ts`

添加 LRU 缓存（limit 200），对已提交消息的代码块缓存命中率接近 100%。

```typescript
const cache = new Map<string, string | null>()
const CACHE_LIMIT = 200
```

## 任务 5: 全部折叠逻辑修复

文件: `web/src/components/agent/AssistantMessage.tsx`

当前 `all` 级别只显示摘要 + `message.content`。但 `message.content` 可能是空的，实际的 TEXT 输出分散在 `iterations` 的 `thinking` 字段中。

修复：
- `all` 级别（已完成态）：折叠所有中间内容（包括所有迭代的 O/thinking），只显示最后一个 TEXT 输出
- 最后一个 TEXT = `message.content`，如果为空则取最后一个迭代的 `thinking`
- 中间内容通过点击摘要行展开，展开后用 `minimal` 级别渲染

```tsx
if (effectiveLevel === 'all' && !isStreaming) {
  // 获取最后一个 TEXT 输出
  const lastText = message.content || iterations[iterations.length - 1]?.thinking || ''
  return (
    <div className="agent-msg-card px-1">
      {showSummary && (
        <FoldedLine title={摘要} defaultOpen={false} onToggle={setSummaryExpanded}>
          {summaryExpanded && <TurnBody iterations={iterations} level="minimal" />}
        </FoldedLine>
      )}
      {lastText && <MarkdownRenderer content={lastText} />}
    </div>
  )
}
```

## 任务 6: 全局动效优化

文件: `web/src/index.css` + `web/src/components/agent/FoldedLine.tsx`

改进折叠/展开动画：
- 使用 CSS `grid-template-rows: 0fr → 1fr` 实现平滑高度过渡（比 max-height 更自然）
- 添加 opacity 过渡
- 折叠箭头旋转动画

```css
.fold-container {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.2s ease-out, opacity 0.2s ease-out;
  opacity: 0;
}
.fold-container.open {
  grid-template-rows: 1fr;
  opacity: 1;
}
.fold-content {
  overflow: hidden;
}
```

更新 FoldedLine 组件使用新的动画方式（始终渲染 children 但用 CSS 控制可见性，而非条件渲染）。

## 验证

- `npm run build` 无错误
- `npx tsc --noEmit` 无错误
- 折叠/展开有平滑过渡效果
- 全部折叠只显示最后一个 TEXT
- Markdown 渲染不卡顿

保持KISS原则，最后一步不需要合入主分支，保留在worktree中。
