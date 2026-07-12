package web

import (
	"bufio"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"xbot/protocol"
)

func TestWriteSSEEventFormat(t *testing.T) {
	recorder := httptest.NewRecorder()
	client := &Client{w: recorder, flusher: recorder}
	msg := protocol.WSMessage{
		Type:    protocol.MsgTypeText,
		Seq:     42,
		Content: "hello",
	}

	if err := writeSSEEvent(client, msg); err != nil {
		t.Fatal(err)
	}
	wantData, err := json.Marshal(msg)
	if err != nil {
		t.Fatal(err)
	}
	want := "id:42\nevent:text\ndata:" + string(wantData) + "\n\n"
	if got := recorder.Body.String(); got != want {
		t.Fatalf("unexpected SSE event:\n got: %q\nwant: %q", got, want)
	}
	if !recorder.Flushed {
		t.Fatal("SSE event was not flushed")
	}
}

func TestWriteSSEHeartbeat(t *testing.T) {
	if sseHeartbeatInterval != 15*time.Second {
		t.Fatalf("heartbeat interval = %s, want 15s", sseHeartbeatInterval)
	}
	recorder := httptest.NewRecorder()
	client := &Client{w: recorder, flusher: recorder}

	if err := writeSSEHeartbeat(client); err != nil {
		t.Fatal(err)
	}
	if got := recorder.Body.String(); got != ":heartbeat\n\n" {
		t.Fatalf("heartbeat = %q, want %q", got, ":heartbeat\n\n")
	}
	if !recorder.Flushed {
		t.Fatal("SSE heartbeat was not flushed")
	}
}

func TestSSEReceivesHubStatefulAndStatelessEvents(t *testing.T) {
	db := newTestDB(t)
	wc, _ := newTestWebChannel(t, db)
	server := startTestServer(t, wc)
	cookie := loginTestAdmin(t, server.URL)

	resp := openSSE(t, server.URL, cookie, "web-1", "")
	defer resp.Body.Close()
	if got := resp.Header.Get("Content-Type"); got != "text/event-stream" {
		t.Fatalf("Content-Type = %q", got)
	}
	if got := resp.Header.Get("Cache-Control"); got != "no-cache" {
		t.Fatalf("Cache-Control = %q", got)
	}
	if got := resp.Header.Get("X-Accel-Buffering"); got != "no" {
		t.Fatalf("X-Accel-Buffering = %q", got)
	}
	if got := resp.Header.Get("Connection"); got != "keep-alive" {
		t.Fatalf("Connection = %q", got)
	}

	wc.hub.mu.RLock()
	var connected *Client
	for _, client := range wc.hub.conns {
		connected = client
		break
	}
	wc.hub.mu.RUnlock()
	if connected == nil {
		t.Fatal("SSE client was not registered with Hub")
	}
	if connected.connType != clientConnTypeSSE || connected.w == nil || connected.flusher == nil {
		t.Fatalf("unexpected SSE client transport fields: %#v", connected)
	}

	reader := bufio.NewReader(resp.Body)
	wc.SendProgress("web-1", &protocol.ProgressEvent{Phase: "thinking"})
	stateful := readSSEEvent(t, reader)
	assertSSEMessage(t, stateful, protocol.MsgTypeProgress, 1)

	wc.SendStreamContent("web-1", "partial", "reasoning")
	stateless := readSSEEvent(t, reader)
	assertSSEMessage(t, stateless, protocol.MsgTypeStreamContent, 2)

	if err := resp.Body.Close(); err != nil {
		t.Fatal(err)
	}
	waitForHubClients(t, wc, 0)
}

func TestSSELastEventIDReplaysMissedEvents(t *testing.T) {
	db := newTestDB(t)
	wc, _ := newTestWebChannel(t, db)
	wc.stampAndBuffer("web-1", protocol.WSMessage{Type: protocol.MsgTypeText, Content: "seen"})
	wc.stampAndBuffer("web-1", protocol.WSMessage{Type: protocol.MsgTypeText, Content: "missed"})
	server := startTestServer(t, wc)
	cookie := loginTestAdmin(t, server.URL)

	resp := openSSE(t, server.URL, cookie, "web-1", "1")
	defer resp.Body.Close()
	event := readSSEEvent(t, bufio.NewReader(resp.Body))
	msg := assertSSEMessage(t, event, protocol.MsgTypeText, 2)
	if msg.Content != "missed" {
		t.Fatalf("replayed content = %q, want missed", msg.Content)
	}
}

func TestSSEReconnectSendsActiveProgressWhenReplayHasNone(t *testing.T) {
	db := newTestDB(t)
	wc, _ := newTestWebChannel(t, db)
	wc.SetCallbacks(WebCallbacks{
		GetActiveProgress: func(channel, chatID string) *protocol.ProgressEvent {
			return &protocol.ProgressEvent{Phase: "tool_exec"}
		},
	})
	wc.stampAndBuffer("web-1", protocol.WSMessage{Type: protocol.MsgTypeText, Content: "seen"})
	server := startTestServer(t, wc)
	cookie := loginTestAdmin(t, server.URL)

	resp := openSSE(t, server.URL, cookie, "web-1", "1")
	defer resp.Body.Close()
	event := readSSEEvent(t, bufio.NewReader(resp.Body))
	msg := assertSSEMessage(t, event, protocol.MsgTypeProgress, 0)
	if msg.Progress == nil || msg.Progress.Phase != "tool_exec" {
		t.Fatalf("unexpected active progress: %#v", msg.Progress)
	}
}

func TestSSERejectsInvalidLastEventID(t *testing.T) {
	db := newTestDB(t)
	wc, _ := newTestWebChannel(t, db)
	server := startTestServer(t, wc)
	cookie := loginTestAdmin(t, server.URL)

	req, err := http.NewRequest(http.MethodGet, server.URL+"/api/sse?chat_id=web-1", nil)
	if err != nil {
		t.Fatal(err)
	}
	req.AddCookie(cookie)
	req.Header.Set("Last-Event-ID", "not-a-sequence")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", resp.StatusCode)
	}
}

func TestSSERequiresAuthenticationAndChatID(t *testing.T) {
	db := newTestDB(t)
	wc, _ := newTestWebChannel(t, db)
	server := startTestServer(t, wc)

	resp, err := http.Get(server.URL + "/api/sse?chat_id=web-1")
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("unauthenticated status = %d, want 401", resp.StatusCode)
	}

	cookie := loginTestAdmin(t, server.URL)
	req, err := http.NewRequest(http.MethodGet, server.URL+"/api/sse", nil)
	if err != nil {
		t.Fatal(err)
	}
	req.AddCookie(cookie)
	resp, err = http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("missing chat_id status = %d, want 400", resp.StatusCode)
	}
}

func openSSE(t *testing.T, serverURL string, cookie *http.Cookie, chatID, lastEventID string) *http.Response {
	t.Helper()
	req, err := http.NewRequest(http.MethodGet, serverURL+"/api/sse?chat_id="+chatID, nil)
	if err != nil {
		t.Fatal(err)
	}
	req.AddCookie(cookie)
	if lastEventID != "" {
		req.Header.Set("Last-Event-ID", lastEventID)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		t.Fatalf("SSE status = %d: %s", resp.StatusCode, body)
	}
	return resp
}

func readSSEEvent(t *testing.T, reader *bufio.Reader) map[string]string {
	t.Helper()
	fields := make(map[string]string, 3)
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			t.Fatalf("read SSE event: %v", err)
		}
		line = strings.TrimSuffix(line, "\n")
		if line == "" {
			return fields
		}
		key, value, ok := strings.Cut(line, ":")
		if !ok {
			t.Fatalf("invalid SSE line %q", line)
		}
		fields[key] = value
	}
}

func assertSSEMessage(t *testing.T, event map[string]string, wantType string, wantSeq uint64) protocol.WSMessage {
	t.Helper()
	if got := event["event"]; got != wantType {
		t.Fatalf("event type = %q, want %q", got, wantType)
	}
	if got := event["id"]; got != strconv.FormatUint(wantSeq, 10) {
		t.Fatalf("event id = %q, want %d", got, wantSeq)
	}
	var msg protocol.WSMessage
	if err := json.Unmarshal([]byte(event["data"]), &msg); err != nil {
		t.Fatalf("decode SSE data: %v", err)
	}
	if msg.Type != wantType || msg.Seq != wantSeq {
		t.Fatalf("SSE data envelope = %#v", msg)
	}
	return msg
}

func waitForHubClients(t *testing.T, wc *WebChannel, want int) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		wc.hub.mu.RLock()
		got := len(wc.hub.conns)
		wc.hub.mu.RUnlock()
		if got == want {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("Hub client count did not reach %d", want)
}
