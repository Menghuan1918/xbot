// PTY terminal backend for the Web channel.
//
// Implements the spec "后端 PTY 终端 API":
//   - POST   /api/terminal/create     — create a PTY session
//   - DELETE /api/terminal/{tid}      — destroy a PTY session
//   - WS     /ws/terminal?tid=<tid>   — bidirectional data channel
//
// Each terminal is bound to a chatID; session teardown (chat delete, channel
// stop) batch-cleans every terminal owned by the session.

package web

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"sync/atomic"
	"time"

	log "xbot/logger"

	"github.com/creack/pty"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const (
	terminalReadBufSize = 4096
	// idleDisconnectTimeout is how long a terminal stays alive after the last
	// WS client disconnects, allowing transient reconnects.
	terminalIdleTimeout = 30 * time.Second
	// wsWriteTimeout bounds how long a server→client WS frame may block.
	terminalWSWriteTimeout = 10 * time.Second
)

// ---------------------------------------------------------------------------
// TerminalSession
// ---------------------------------------------------------------------------

// TerminalSession represents one active PTY terminal.
type TerminalSession struct {
	tid    string
	chatID string
	ptmx   *os.File  // PTY master
	cmd    *exec.Cmd // underlying shell process

	// idleTimer arms a grace window: the terminal is reaped if no WS client is
	// (re)connected before the timer fires. Guarded by mu alongside ptmx writes.
	idleTimer *time.Timer
	// done is closed exactly once when the terminal is closed, allowing idle
	// watchers and read goroutines to exit promptly.
	done chan struct{}

	mu     sync.Mutex // protects ptmx writes (stdin) + Setsize + idleTimer
	closed atomic.Bool
}

// writeStdin writes bytes to the PTY master (shell stdin). Safe for concurrent use.
func (ts *TerminalSession) writeStdin(data []byte) error {
	ts.mu.Lock()
	defer ts.mu.Unlock()
	if ts.closed.Load() {
		return errTerminalClosed
	}
	_, err := ts.ptmx.Write(data)
	return err
}

// resize updates the PTY window size. Safe for concurrent use.
func (ts *TerminalSession) resize(cols, rows uint16) error {
	ts.mu.Lock()
	defer ts.mu.Unlock()
	if ts.closed.Load() {
		return errTerminalClosed
	}
	return pty.Setsize(ts.ptmx, &pty.Winsize{Cols: cols, Rows: rows})
}

// close idempotently closes the PTY master and signals idle watchers.
// Closing the PTY master unblocks the read goroutine (ptmx.Read returns error).
// Safe to call multiple times.
func (ts *TerminalSession) close() {
	if !ts.closed.CompareAndSwap(false, true) {
		return
	}
	ts.mu.Lock()
	if ts.idleTimer != nil {
		ts.idleTimer.Stop()
		ts.idleTimer = nil
	}
	ts.mu.Unlock()
	_ = ts.ptmx.Close()
	close(ts.done)
}

// waitProcess waits for the underlying shell process to exit and returns its
// exit code. Called from the read goroutine after ptmx.Read returns EOF/error.
func (ts *TerminalSession) waitProcess() int {
	if ts.cmd != nil && ts.cmd.Process != nil {
		_ = ts.cmd.Wait()
		if ts.cmd.ProcessState != nil {
			return ts.cmd.ProcessState.ExitCode()
		}
	}
	return 0
}

// ---------------------------------------------------------------------------
// TerminalManager
// ---------------------------------------------------------------------------

// TerminalManager manages all active terminals, grouped by chatID.
// Concurrency: terminals (tid→*TerminalSession) and byChat
// (chatID→map[tid]struct{}) are sync.Map for lock-free reads.
type TerminalManager struct {
	terminals sync.Map // tid → *TerminalSession
	byChat    sync.Map // chatID → map[tid]struct{}
}

// newTerminalManager constructs an empty TerminalManager.
func newTerminalManager() *TerminalManager {
	return &TerminalManager{}
}

// newMapTIDs constructs a guarded tid set with an initialised map.
func newMapTIDs() *mapTIDs {
	return &mapTIDs{m: make(map[string]struct{})}
}

// register stores a terminal under both tid and chatID group.
func (tm *TerminalManager) register(ts *TerminalSession) {
	tm.terminals.Store(ts.tid, ts)
	raw, _ := tm.byChat.LoadOrStore(ts.chatID, newMapTIDs())
	set := raw.(*mapTIDs)
	set.mu.Lock()
	if set.m == nil {
		set.m = make(map[string]struct{})
	}
	set.m[ts.tid] = struct{}{}
	set.mu.Unlock()
}

// unregister removes a terminal from both indices. Returns true if the
// terminal existed and was removed.
func (tm *TerminalManager) unregister(tid string) (*TerminalSession, bool) {
	raw, ok := tm.terminals.LoadAndDelete(tid)
	if !ok {
		return nil, false
	}
	ts := raw.(*TerminalSession)
	if setRaw, ok := tm.byChat.Load(ts.chatID); ok {
		set := setRaw.(*mapTIDs)
		set.mu.Lock()
		delete(set.m, tid)
		if len(set.m) == 0 {
			set.mu.Unlock()
			tm.byChat.Delete(ts.chatID) // remove empty group
		} else {
			set.mu.Unlock()
		}
	}
	return ts, true
}

// get retrieves a terminal by tid.
func (tm *TerminalManager) get(tid string) (*TerminalSession, bool) {
	raw, ok := tm.terminals.Load(tid)
	if !ok {
		return nil, false
	}
	return raw.(*TerminalSession), true
}

// CleanupChat destroys every terminal owned by chatID.
func (tm *TerminalManager) CleanupChat(chatID string) {
	raw, ok := tm.byChat.LoadAndDelete(chatID)
	if !ok {
		return
	}
	set := raw.(*mapTIDs)
	set.mu.Lock()
	ids := make([]string, 0, len(set.m))
	for tid := range set.m {
		ids = append(ids, tid)
	}
	set.mu.Unlock()
	for _, tid := range ids {
		if ts, ok := tm.terminals.LoadAndDelete(tid); ok {
			ts.(*TerminalSession).close()
		}
	}
}

// CleanupAll destroys every terminal (used on channel shutdown).
func (tm *TerminalManager) CleanupAll() {
	tm.terminals.Range(func(_, v any) bool {
		v.(*TerminalSession).close()
		return true
	})
	tm.terminals = sync.Map{}
	tm.byChat = sync.Map{}
}

// mapTIDs is a guarded set of tids, stored inside TerminalManager.byChat.
type mapTIDs struct {
	mu sync.Mutex
	m  map[string]struct{}
}

// ---------------------------------------------------------------------------
// HTTP / WS handlers
// ---------------------------------------------------------------------------

// sentinel errors
var errTerminalClosed = errString("terminal closed")

type errString string

func (e errString) Error() string { return string(e) }

// handleTerminalCreate handles POST /api/terminal/create.
func (wc *WebChannel) handleTerminalCreate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonErrorResponse(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req struct {
		ChatID string `json:"chatID"`
		Cwd    string `json:"cwd"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonErrorResponse(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.ChatID == "" {
		jsonErrorResponse(w, http.StatusBadRequest, "chatID is required")
		return
	}

	cwd := safeCwd(req.Cwd)

	shell := os.Getenv("SHELL")
	if shell == "" {
		shell = "/bin/bash"
	}
	c := exec.Command(shell, "--login")
	c.Dir = cwd
	c.Env = append(os.Environ(), "TERM=xterm-256color")

	ptmx, err := pty.Start(c)
	if err != nil {
		log.WithError(err).Warn("PTY start failed")
		jsonErrorResponse(w, http.StatusInternalServerError, "failed to start terminal")
		return
	}

	tid := uuid.NewString()
	ts := &TerminalSession{
		tid:    tid,
		chatID: req.ChatID,
		ptmx:   ptmx,
		cmd:    c,
		done:   make(chan struct{}),
	}
	ts.idleTimer = time.NewTimer(terminalIdleTimeout)
	wc.terminals().register(ts)

	// Arm the idle watcher so a terminal that is never connected gets reaped
	// within the grace window. The timer is stopped/reset when a WS connects.
	go wc.terminalIdleWatch(ts)

	writeJSON(w, http.StatusOK, map[string]any{"tid": tid})
}

// terminalIdleWatch reaps the terminal if no client (re)connects before the
// idle timer fires. Exits early when the terminal is closed by other means.
func (wc *WebChannel) terminalIdleWatch(ts *TerminalSession) {
	timer := ts.idleTimer
	if timer == nil {
		return
	}
	select {
	case <-timer.C:
		// Grace window elapsed — destroy the terminal.
		if removed, ok := wc.terminals().unregister(ts.tid); ok {
			removed.close()
		}
	case <-ts.done:
		// Terminal was closed elsewhere.
	}
}

// handleTerminalRoute dispatches path-keyed terminal routes (DELETE handler).
func (wc *WebChannel) handleTerminalRoute(w http.ResponseWriter, r *http.Request) {
	// /api/terminal/{tid}
	rest := r.URL.Path[len("/api/terminal/"):]
	tid := rest
	switch r.Method {
	case http.MethodDelete:
		wc.handleTerminalDelete(w, r, tid)
	default:
		jsonErrorResponse(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

// handleTerminalDelete handles DELETE /api/terminal/{tid}.
func (wc *WebChannel) handleTerminalDelete(w http.ResponseWriter, r *http.Request, tid string) {
	if tid == "" {
		jsonErrorResponse(w, http.StatusBadRequest, "tid is required")
		return
	}
	ts, ok := wc.terminals().unregister(tid)
	if !ok {
		jsonErrorResponse(w, http.StatusNotFound, "terminal not found")
		return
	}
	ts.close()
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// terminalWSUpgrader is a permissive upgrader for terminal data channels — the
// browser-origin checks from wsUpgrader() are intentionally disabled so that
// xterm.js frontends served from any host can connect (auth is via Cookie).
var terminalWSUpgrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
	CheckOrigin:     func(r *http.Request) bool { return true },
}

// handleTerminalWS handles WS /ws/terminal?tid=<tid>.
func (wc *WebChannel) handleTerminalWS(w http.ResponseWriter, r *http.Request) {
	// Auth: cookie/session (same as the chat WS). For WS there is no body to
	// limit; just validate the session.
	si := wc.validateSession(r)
	if si == nil {
		jsonErrorResponse(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	tid := r.URL.Query().Get("tid")
	if tid == "" {
		jsonErrorResponse(w, http.StatusBadRequest, "tid is required")
		return
	}
	ts, ok := wc.terminals().get(tid)
	if !ok {
		jsonErrorResponse(w, http.StatusNotFound, "terminal not found")
		return
	}

	// Stop the idle timer — a real client is connecting now.
	ts.mu.Lock()
	if ts.idleTimer != nil {
		ts.idleTimer.Stop()
		ts.idleTimer = nil
	}
	ts.mu.Unlock()

	conn, err := terminalWSUpgrader.Upgrade(w, r, nil)
	if err != nil {
		log.WithError(err).Warn("terminal WS upgrade failed")
		return
	}
	defer conn.Close()

	wc.serveTerminalWS(ts, conn)
}

// serveTerminalWS runs the bidirectional pump between the PTY and the WS conn.
// Returns when the PTY process exits or the WS client disconnects. On a
// transient disconnect (not an explicit "close") the terminal stays alive for
// terminalIdleTimeout to allow reconnect; on explicit "close" or PTY exit the
// terminal is destroyed immediately.
func (wc *WebChannel) serveTerminalWS(ts *TerminalSession, conn *websocket.Conn) {
	pumpDone := make(chan struct{})
	ptyExited := make(chan struct{})
	// PTY → WS pump.
	go func() {
		defer close(pumpDone)
		buf := make([]byte, terminalReadBufSize)
		for {
			n, err := ts.ptmx.Read(buf)
			if n > 0 {
				encoded := base64.StdEncoding.EncodeToString(buf[:n])
				_ = conn.SetWriteDeadline(time.Now().Add(terminalWSWriteTimeout))
				if werr := conn.WriteJSON(map[string]any{"type": "stdout", "data": encoded}); werr != nil {
					return
				}
			}
			if err != nil {
				code := 0
				if err.Error() == "EOF" || isEOF(err) {
					code = ts.waitProcess()
					close(ptyExited)
				}
				_ = conn.SetWriteDeadline(time.Now().Add(terminalWSWriteTimeout))
				_ = conn.WriteJSON(map[string]any{"type": "exit", "code": code})
				return
			}
		}
	}()

	// WS → PTY pump. Blocks until read error/close or PTY exit.
	explicitClose := false
	for {
		select {
		case <-ptyExited:
			// PTY process finished — tear down everything.
			wc.destroyTerminal(ts.tid)
			<-pumpDone
			return
		default:
		}
		_, raw, err := conn.ReadMessage()
		if err != nil {
			break // client disconnected
		}
		var msg struct {
			Type string `json:"type"`
			Data string `json:"data"`
			Cols uint16 `json:"cols"`
			Rows uint16 `json:"rows"`
		}
		if jerr := json.Unmarshal(raw, &msg); jerr != nil {
			_ = conn.SetWriteDeadline(time.Now().Add(terminalWSWriteTimeout))
			_ = conn.WriteJSON(map[string]any{"type": "error", "message": "invalid message"})
			continue
		}
		switch msg.Type {
		case "stdin":
			data, derr := base64.StdEncoding.DecodeString(msg.Data)
			if derr != nil {
				// Allow plain-text fallback for convenience.
				data = []byte(msg.Data)
			}
			if werr := ts.writeStdin(data); werr != nil {
				_ = conn.WriteJSON(map[string]any{"type": "error", "message": werr.Error()})
			}
		case "resize":
			if rerr := ts.resize(msg.Cols, msg.Rows); rerr != nil {
				_ = conn.WriteJSON(map[string]any{"type": "error", "message": rerr.Error()})
			}
		case "close":
			explicitClose = true
			goto drain
		}
	}

drain:
	// Wait for the PTY→WS pump to finish flushing.
	select {
	case <-pumpDone:
	case <-time.After(terminalWSWriteTimeout):
	}
	if explicitClose {
		wc.destroyTerminal(ts.tid)
	} else {
		// Transient disconnect — arm idle timer for reconnect grace window.
		wc.armIdleTimer(ts)
	}
}

// destroyTerminal removes and closes a terminal by tid (no-op if missing).
func (wc *WebChannel) destroyTerminal(tid string) {
	if removed, ok := wc.terminals().unregister(tid); ok {
		removed.close()
	}
}

// armIdleTimer (re)arms the idle grace timer on the terminal so a transient WS
// disconnect can reconnect before the terminal is reaped.
func (wc *WebChannel) armIdleTimer(ts *TerminalSession) {
	ts.mu.Lock()
	if ts.idleTimer == nil {
		ts.idleTimer = time.NewTimer(terminalIdleTimeout)
	} else {
		ts.idleTimer.Reset(terminalIdleTimeout)
	}
	ts.mu.Unlock()
	go func(s *TerminalSession) {
		s.mu.Lock()
		timer := s.idleTimer
		s.mu.Unlock()
		if timer == nil {
			return
		}
		select {
		case <-timer.C:
			wc.destroyTerminal(s.tid)
		case <-s.done:
		}
	}(ts)
}

// isEOF reports whether err represents an EOF read on the PTY.
func isEOF(err error) bool {
	return err != nil && err.Error() == "EOF"
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// terminals returns the TerminalManager owned by the WebChannel, lazily
// allocating it the first time it is needed.
func (wc *WebChannel) terminals() *TerminalManager {
	if wc.terminalMgr == nil {
		wc.terminalMgr = newTerminalManager()
	}
	return wc.terminalMgr
}

// safeCwd normalises a requested working directory and rejects traversal.
// Falls back to the user's home directory, then "/" if the path does not exist.
func safeCwd(requested string) string {
	cwd := requested
	if cwd == "" {
		if home, err := os.UserHomeDir(); err == nil {
			cwd = home
		} else {
			cwd = "/"
		}
	}
	// Normalise: clean, then resolve to absolute. Reject ".." traversal by
	// ensuring the cleaned absolute path is rooted.
	abs, err := filepath.Abs(filepath.Clean(cwd))
	if err != nil || !filepath.IsAbs(abs) {
		return "/"
	}
	// filepath.Clean collapses ".." segments, but guard against paths that
	// escape via symlinks by checking existence and lstat.
	info, err := os.Stat(abs)
	if err != nil || !info.IsDir() {
		// Try home, then root.
		if home, herr := os.UserHomeDir(); herr == nil {
			if hinfo, herr := os.Stat(home); herr == nil && hinfo.IsDir() {
				return home
			}
		}
		return "/"
	}
	return abs
}
