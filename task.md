# 终端会话绑定 + 进程内持久化

## 背景

当前 Web 终端在面板卸载时发送 WS close + DELETE 请求"双击杀"后端 PTY，导致切换会话后终端丢失。需要改为"会话绑定+进程内持久化"：切换会话时断开 WS 但不杀 PTY，切回来时重连恢复。

## 后端改动

### 1. 取消面板卸载时的自动销毁

文件: `channel/web/web_pty.go`

当前 `TerminalSession` 有 30s idle timer（WS 断开后宽限期）。改为：
- 移除 idle timer 的自动回收（或改为超长时限如 30 分钟）
- 终端只在以下情况销毁：1) 用户显式关闭（WS 收到 `{type:"close"}`）2) PTY 进程退出 3) 会话被删除（CleanupChat）
- WS 断开不再自动启动 idle timer

### 2. 新增 ListByChat API

文件: `channel/web/web_pty.go` + `channel/web/web.go`

新增 `GET /api/terminal/list?chatID={chatID}` 端点：
- 返回该会话所有活跃终端的 `{tid, cwd, createdAt}`
- 前端用此 API 在会话切换/页面刷新后恢复终端列表

```go
// web_pty.go
func (tm *TerminalManager) ListByChat(chatID string) []TerminalInfo {
    tm.terminalsMu.RLock()
    defer tm.terminalsMu.RUnlock()
    var result []TerminalInfo
    if tids, ok := tm.byChat.Load(chatID); ok {
        for _, tid := range tids.([]string) {
            if ts, ok := tm.terminals.Load(tid); ok {
                sess := ts.(*TerminalSession)
                result = append(result, TerminalInfo{
                    TID: tid, CWD: sess.cwd, CreatedAt: sess.createdAt,
                })
            }
        }
    }
    return result
}
```

注册路由：
```go
mux.HandleFunc("/api/terminal/list", wc.authMiddleware(wc.handleTerminalList))
```

### 3. TerminalSession 增加元数据

确保 `TerminalSession` 有 `cwd` 和 `createdAt` 字段，供 ListByChat 返回。

## 前端改动

### 4. TerminalPanel 卸载时不断开终端

文件: `web/src/workspace/panels/TerminalPanel.tsx`

当前 cleanup:
```tsx
ws.close()                        // 发 {type:"close"} → 后端销毁 PTY
terminalStore.remove(terminalId)  // 删除前端记录
terminalStore.deleteBackend(tid)  // DELETE → 后端再次销毁
```

改为：
```tsx
ws.disconnect()                    // 断开 WS，不发 close，不销毁后端 PTY
// 不调 deleteBackend
// 不调 store.remove（保留记录，以便恢复）
terminal.dispose()                 // 只清理 xterm 实例
```

新增 `TerminalWS.disconnect()` 方法：只断开 socket 不发 `{type:"close"}`。

### 5. 会话切换时恢复终端

文件: `web/src/hooks/useTerminal.ts`

新增 `restoreFromBackend(chatID)` 方法：
- 调 `GET /api/terminal/list?chatID=xxx` 获取后端活跃终端
- 同步到 `terminalStore`（与本地记录合并，去重）
- 对已有终端的 tab 重新挂载 panel 时 reconnect WS

在会话切换时（`AgentPanel` 或 `useSessionStore` 的 `switchSession`）调用 `restoreFromBackend`。

### 6. 终端列表按会话过滤

文件: `web/src/hooks/useTerminal.ts` + `web/src/components/sidebar/TerminalList.tsx`

`terminalStore.snapshot()` 增加按 `chatID` 过滤的重载。侧边栏只显示当前会话的终端。

### 7. TerminalWS 增加 disconnect 方法

文件: `web/src/lib/terminalWS.ts`

```typescript
/** Disconnect WS without sending close to backend (terminal persists). */
disconnect(): void {
  this.shouldReconnect = false  // 阻止自动重连
  if (this.ws) {
    this.ws.close()  // 关闭 WS 连接（不发 close 帧）
    this.ws = null
  }
}

/** Close terminal permanently (sends close to backend, PTY destroyed). */
close(): void {
  this.shouldReconnect = false
  if (this.ws?.readyState === WebSocket.OPEN) {
    this.ws.send(JSON.stringify({ type: 'close' }))
  }
  this.ws?.close()
  this.ws = null
}
```

### 8. 用户显式关闭才销毁

文件: `web/src/hooks/useTerminal.ts`

`closeTerminal(id)` 方法（用户点击终端的 X 按钮时调用）：
- 调 `ws.close()`（发 close → 后端销毁 PTY）
- 调 `terminalStore.remove(id)`（删除前端记录）
- 不需要 `deleteBackend`（WS close 已通知后端）

## 验证

- 切换会话后切回，终端仍在运行（PTY 未被杀死）
- 页面刷新后，终端列表从后端恢复
- 用户显式关闭终端（点击 X）才真正销毁
- 会话删除时终端批量清理（已有逻辑）
- `go test ./channel/web/...` 通过
- `npm run build` 通过

保持KISS原则，最后一步不需要合入主分支，保留在worktree中。
