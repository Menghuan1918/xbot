package web

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

// startTerminalTestServer registers the terminal + auth routes on a test server.
func startTerminalTestServer(t *testing.T, wc *WebChannel) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("/api/auth/register", limitBodySize(wc.handleRegister))
	mux.HandleFunc("/api/auth/login", limitBodySize(wc.handleLogin))
	mux.HandleFunc("/api/terminal/create", limitBodySize(wc.authMiddleware(wc.handleTerminalCreate)))
	mux.HandleFunc("/api/terminal/", wc.authMiddleware(wc.handleTerminalRoute))
	mux.HandleFunc("/ws/terminal", wc.handleTerminalWS)
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)
	return server
}

// registerLoginCookie registers a test user, logs in, and returns the session cookie.
func registerLoginCookie(t *testing.T, server *httptest.Server) *http.Cookie {
	t.Helper()
	body := `{"username":"ptyuser","password":"pw123456"}`
	resp, err := http.Post(server.URL+"/api/auth/register", "application/json", strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()

	loginResp, err := http.Post(server.URL+"/api/auth/login", "application/json", strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	defer loginResp.Body.Close()
	for _, c := range loginResp.Cookies() {
		if c.Name == webSessionCookieName {
			return c
		}
	}
	t.Fatal("no session cookie returned on login")
	return nil
}

// createTerminal calls POST /api/terminal/create and returns the tid.
func createTerminal(t *testing.T, server *httptest.Server, cookie *http.Cookie, chatID, cwd string) string {
	t.Helper()
	reqBody := `{"chatID":"` + chatID + `","cwd":"` + cwd + `"}`
	req, _ := http.NewRequest("POST", server.URL+"/api/terminal/create", strings.NewReader(reqBody))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(cookie)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 on terminal create, got %d", resp.StatusCode)
	}
	var out struct {
		TID string `json:"tid"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatal(err)
	}
	if out.TID == "" {
		t.Fatal("empty tid returned")
	}
	return out.TID
}

// deleteTerminal calls DELETE /api/terminal/{tid}.
func deleteTerminal(t *testing.T, server *httptest.Server, cookie *http.Cookie, tid string) int {
	t.Helper()
	req, _ := http.NewRequest("DELETE", server.URL+"/api/terminal/"+tid, nil)
	req.AddCookie(cookie)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	return resp.StatusCode
}

// ---------------------------------------------------------------------------
// safeCwd unit tests
// ---------------------------------------------------------------------------

func TestSafeCwd_RejectsTraversal(t *testing.T) {
	got := safeCwd("/tmp/../etc")
	// filepath.Clean collapses ".." → "/etc" which exists and is a dir, so the
	// traversal is neutralised to the normalised absolute path, not the parent.
	if !filepath.IsAbs(got) {
		t.Fatalf("expected absolute path, got %q", got)
	}
	// Must never contain a ".." component.
	if strings.Contains(got, "..") {
		t.Fatalf("path contains traversal: %q", got)
	}
}

func TestSafeCwd_FallbackForMissingDir(t *testing.T) {
	got := safeCwd("/this/does/not/exist/12345")
	// Fallback to home or "/" — both must be absolute and exist.
	info, err := os.Stat(got)
	if err != nil || !info.IsDir() {
		t.Fatalf("safeCwd returned non-existent dir %q: %v", got, err)
	}
}

func TestSafeCwd_EmptyUsesHome(t *testing.T) {
	home, _ := os.UserHomeDir()
	got := safeCwd("")
	// If a home directory exists, safeCwd("") should resolve to it.
	if home != "" {
		info, err := os.Stat(home)
		if err == nil && info.IsDir() && got != home {
			t.Fatalf("safeCwd(\"\") = %q, expected home %q", got, home)
		}
	}
	// Regardless, the result must be a valid directory.
	info, err := os.Stat(got)
	if err != nil || !info.IsDir() {
		t.Fatalf("safeCwd(\"\") returned invalid dir %q: %v", got, err)
	}
}

// ---------------------------------------------------------------------------
// TerminalManager unit tests
// ---------------------------------------------------------------------------

func TestTerminalManager_RegisterUnregister(t *testing.T) {
	tm := newTerminalManager()
	// Use nil ptmx/cmd — we only test manager bookkeeping, not PTY I/O.
	ts := &TerminalSession{tid: "t1", chatID: "c1", done: make(chan struct{})}
	tm.register(ts)

	if _, ok := tm.get("t1"); !ok {
		t.Fatal("terminal not found after register")
	}

	removed, ok := tm.unregister("t1")
	if !ok || removed.tid != "t1" {
		t.Fatal("unregister failed")
	}
	if _, ok := tm.get("t1"); ok {
		t.Fatal("terminal still found after unregister")
	}
}

func TestTerminalManager_CleanupChat(t *testing.T) {
	tm := newTerminalManager()
	for i := 0; i < 3; i++ {
		ts := &TerminalSession{tid: "t" + string(rune('1'+i)), chatID: "chatX", done: make(chan struct{})}
		tm.register(ts)
	}
	// Different chatID should be untouched.
	other := &TerminalSession{tid: "other", chatID: "chatY", done: make(chan struct{})}
	tm.register(other)

	tm.CleanupChat("chatX")

	if _, ok := tm.get("t1"); ok {
		t.Fatal("t1 not cleaned up")
	}
	if _, ok := tm.get("other"); !ok {
		t.Fatal("other terminal should not be cleaned up")
	}
}

// ---------------------------------------------------------------------------
// HTTP API tests
// ---------------------------------------------------------------------------

func TestTerminalCreateAndDelete(t *testing.T) {
	db := newTestDB(t)
	wc, _ := newTestWebChannel(t, db)
	server := startTerminalTestServer(t, wc)
	cookie := registerLoginCookie(t, server)

	tid := createTerminal(t, server, cookie, "chat-create-delete", "")
	if _, ok := wc.terminals().get(tid); !ok {
		t.Fatal("terminal not registered in manager")
	}

	// DELETE destroys the terminal.
	if code := deleteTerminal(t, server, cookie, tid); code != http.StatusOK {
		t.Fatalf("expected 200 on delete, got %d", code)
	}
	if _, ok := wc.terminals().get(tid); ok {
		t.Fatal("terminal still found after delete")
	}
}

func TestTerminalDelete_NotFound(t *testing.T) {
	db := newTestDB(t)
	wc, _ := newTestWebChannel(t, db)
	server := startTerminalTestServer(t, wc)
	cookie := registerLoginCookie(t, server)

	if code := deleteTerminal(t, server, cookie, "nonexistent-tid"); code != http.StatusNotFound {
		t.Fatalf("expected 404 for missing terminal, got %d", code)
	}
}

func TestTerminalCreate_MissingChatID(t *testing.T) {
	db := newTestDB(t)
	wc, _ := newTestWebChannel(t, db)
	server := startTerminalTestServer(t, wc)
	cookie := registerLoginCookie(t, server)

	req, _ := http.NewRequest("POST", server.URL+"/api/terminal/create", strings.NewReader(`{}`))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(cookie)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400 for missing chatID, got %d", resp.StatusCode)
	}
}

func TestTerminalCreate_Unauthorized(t *testing.T) {
	db := newTestDB(t)
	wc, _ := newTestWebChannel(t, db)
	server := startTerminalTestServer(t, wc)

	resp, err := http.Post(server.URL+"/api/terminal/create", "application/json",
		strings.NewReader(`{"chatID":"c1"}`))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401 without cookie, got %d", resp.StatusCode)
	}
}

func TestTerminalCleanupChatViaManager(t *testing.T) {
	db := newTestDB(t)
	wc, _ := newTestWebChannel(t, db)
	server := startTerminalTestServer(t, wc)
	cookie := registerLoginCookie(t, server)

	// Create 3 terminals on the same chatID.
	chatID := "chat-cleanup"
	tids := make([]string, 3)
	for i := range tids {
		tids[i] = createTerminal(t, server, cookie, chatID, "")
	}

	// All should be registered.
	for _, tid := range tids {
		if _, ok := wc.terminals().get(tid); !ok {
			t.Fatalf("terminal %s not registered", tid)
		}
	}

	// Session-level cleanup destroys all of them.
	wc.terminals().CleanupChat(chatID)

	for _, tid := range tids {
		if _, ok := wc.terminals().get(tid); ok {
			t.Fatalf("terminal %s not cleaned up", tid)
		}
	}
}

// ---------------------------------------------------------------------------
// WebSocket integration test
// ---------------------------------------------------------------------------

func TestTerminalWS_EchoAndResize(t *testing.T) {
	db := newTestDB(t)
	wc, _ := newTestWebChannel(t, db)
	server := startTerminalTestServer(t, wc)
	cookie := registerLoginCookie(t, server)

	tid := createTerminal(t, server, cookie, "chat-ws", "")

	// Dial the WS data channel.
	wsURL := strings.Replace(server.URL, "http://", "ws://", 1)
	header := http.Header{}
	header.Set("Cookie", webSessionCookieName+"="+cookie.Value)
	conn, resp, err := websocket.DefaultDialer.Dial(wsURL+"/ws/terminal?tid="+tid, header)
	if err != nil {
		status := -1
		if resp != nil {
			status = resp.StatusCode
		}
		t.Fatalf("WS dial failed: %v (status %d)", err, status)
	}
	defer conn.Close()
	t.Cleanup(func() {
		// Ensure the terminal is destroyed after the test.
		wc.destroyTerminal(tid)
	})

	// Send a resize — must not panic or error.
	resizeMsg := []byte(`{"type":"resize","cols":80,"rows":24}`)
	if err := conn.WriteMessage(websocket.TextMessage, resizeMsg); err != nil {
		t.Fatalf("resize write failed: %v", err)
	}

	// Send stdin: a simple echo command.
	echoCmd := base64.StdEncoding.EncodeToString([]byte("echo hello-pty-xyz\n"))
	stdinMsg := []byte(`{"type":"stdin","data":"` + echoCmd + `"}`)
	if err := conn.WriteMessage(websocket.TextMessage, stdinMsg); err != nil {
		t.Fatalf("stdin write failed: %v", err)
	}

	// Read messages until we see the echoed output containing our marker.
	deadline := time.Now().Add(10 * time.Second)
	_ = conn.SetReadDeadline(deadline)
	sawEcho := false
	for time.Now().Before(deadline) && !sawEcho {
		var msg struct {
			Type string `json:"type"`
			Data string `json:"data"`
		}
		if err := conn.ReadJSON(&msg); err != nil {
			// Timeout or connection close after shell exits.
			break
		}
		if msg.Type == "stdout" {
			decoded, _ := base64.StdEncoding.DecodeString(msg.Data)
			if strings.Contains(string(decoded), "hello-pty-xyz") {
				sawEcho = true
			}
		}
	}
	if !sawEcho {
		t.Fatal("did not receive echoed output within timeout")
	}
}

func TestTerminalWS_NotFound(t *testing.T) {
	db := newTestDB(t)
	wc, _ := newTestWebChannel(t, db)
	server := startTerminalTestServer(t, wc)
	cookie := registerLoginCookie(t, server)

	wsURL := strings.Replace(server.URL, "http://", "ws://", 1)
	header := http.Header{}
	header.Set("Cookie", webSessionCookieName+"="+cookie.Value)
	_, resp, err := websocket.DefaultDialer.Dial(wsURL+"/ws/terminal?tid=does-not-exist", header)
	if err == nil {
		t.Fatal("expected WS dial to fail for unknown tid")
	}
	if resp != nil && resp.StatusCode != http.StatusNotFound {
		t.Fatalf("expected 404 for unknown tid, got %d", resp.StatusCode)
	}
}
