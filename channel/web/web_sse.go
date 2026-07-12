package web

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	log "xbot/logger"
	"xbot/protocol"

	"github.com/google/uuid"
)

const sseHeartbeatInterval = 15 * time.Second

// handleSSE streams server events for one authenticated Web session.
func (wc *WebChannel) handleSSE(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonErrorResponse(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	senderID := senderIDFromContext(r.Context())
	if senderID == "" {
		jsonErrorResponse(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	chatID := strings.TrimSpace(r.URL.Query().Get("chat_id"))
	if chatID == "" {
		jsonErrorResponse(w, http.StatusBadRequest, "chat_id is required")
		return
	}
	sel, ok := wc.resolveSSESession(w, r, senderID, chatID)
	if !ok {
		return
	}

	lastSeq, err := parseLastEventID(r.Header.Get("Last-Event-ID"))
	if err != nil {
		jsonErrorResponse(w, http.StatusBadRequest, "invalid Last-Event-ID")
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		jsonErrorResponse(w, http.StatusInternalServerError, "streaming unsupported")
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	// SSE responses are intentionally long-lived; keep the server's REST write
	// timeout while clearing it only for this response.
	_ = http.NewResponseController(w).SetWriteDeadline(time.Time{})

	client := &Client{
		connType:     clientConnTypeSSE,
		w:            w,
		flusher:      flusher,
		sendCh:       make(chan protocol.WSMessage, webSendChBufSize),
		done:         make(chan struct{}),
		hub:          wc.hub,
		userID:       senderID,
		id:           strings.ReplaceAll(uuid.New().String(), "-", ""),
		statelessSig: make(chan struct{}, 1),
	}

	wc.hub.addClient(client.id, client)
	wc.hub.subscribe(client.id, chatID)
	defer func() {
		client.closeDone()
		wc.hub.removeClient(client.id)
		log.WithFields(log.Fields{
			"sender_id": senderID,
			"chat_id":   chatID,
			"client_id": client.id,
		}).Info("SSE client disconnected")
	}()

	log.WithFields(log.Fields{
		"sender_id": senderID,
		"chat_id":   chatID,
		"client_id": client.id,
	}).Info("SSE client connected")

	// Commit the response headers immediately even when no event is ready yet.
	flusher.Flush()
	if lastSeq > 0 {
		if err := wc.replaySSEEvents(client, sel, lastSeq); err != nil {
			log.WithError(err).WithField("client_id", client.id).Debug("SSE replay stopped")
			return
		}
	}

	wc.sseWriteLoop(r.Context(), client)
}

func (wc *WebChannel) resolveSSESession(w http.ResponseWriter, r *http.Request, senderID, chatID string) (SessionSelector, bool) {
	sel := wc.GetCurrentSession(senderID)
	if sel.ChatID != chatID {
		sel = SessionSelector{Channel: "web", ChatID: chatID}
		if webChatIDLooksLikeSubAgent(chatID) {
			sel.Channel = "agent"
		}
	}
	if !wc.canAccessSession(r.Context(), userIDFromContext(r.Context()), senderID, sel.Channel, sel.ChatID) {
		jsonErrorResponse(w, http.StatusForbidden, "access denied")
		return SessionSelector{}, false
	}
	return sel, true
}

func parseLastEventID(raw string) (uint64, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return 0, nil
	}
	return strconv.ParseUint(raw, 10, 64)
}

func (wc *WebChannel) replaySSEEvents(client *Client, sel SessionSelector, lastSeq uint64) error {
	events := wc.getEventStream(sel.ChatID).eventsAfter(lastSeq)
	replayedProgress := false
	for _, event := range events {
		if event.Type == protocol.MsgTypeProgress {
			replayedProgress = true
		}
		if err := writeSSEEvent(client, event); err != nil {
			return err
		}
	}

	if !replayedProgress && wc.callbacks.GetActiveProgress != nil {
		if progress := wc.callbacks.GetActiveProgress(sel.Channel, sel.ChatID); progress != nil {
			if err := writeSSEEvent(client, protocol.WSMessage{
				Type:     protocol.MsgTypeProgress,
				TS:       time.Now().Unix(),
				Progress: progress,
			}); err != nil {
				return err
			}
		}
	}

	if wc.callbacks.GetPendingAskUser != nil {
		if progress := wc.callbacks.GetPendingAskUser(sel.Channel, sel.ChatID); progress != nil {
			if err := writeSSEEvent(client, protocol.WSMessage{
				Type:     protocol.MsgTypeAskUser,
				TS:       time.Now().Unix(),
				ChatID:   sel.ChatID,
				Progress: progress,
			}); err != nil {
				return err
			}
		}
	}
	return nil
}

func (wc *WebChannel) sseWriteLoop(ctx context.Context, client *Client) {
	ticker := time.NewTicker(sseHeartbeatInterval)
	defer ticker.Stop()

	for {
		select {
		case <-client.statelessSig:
			for _, msg := range client.drainStateless() {
				if err := writeSSEEvent(client, *msg); err != nil {
					return
				}
			}
		case msg, ok := <-client.sendCh:
			if !ok {
				return
			}
			if err := writeSSEEvent(client, msg); err != nil {
				return
			}
		case <-ticker.C:
			if err := writeSSEHeartbeat(client); err != nil {
				return
			}
		case <-ctx.Done():
			return
		case <-client.done:
			return
		}
	}
}

func writeSSEEvent(client *Client, msg protocol.WSMessage) error {
	data, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("marshal SSE event: %w", err)
	}
	if _, err := fmt.Fprintf(client.w, "id:%d\nevent:%s\ndata:%s\n\n", msg.Seq, msg.Type, data); err != nil {
		return fmt.Errorf("write SSE event: %w", err)
	}
	client.flusher.Flush()
	return nil
}

func writeSSEHeartbeat(client *Client) error {
	if _, err := io.WriteString(client.w, ":heartbeat\n\n"); err != nil {
		return fmt.Errorf("write SSE heartbeat: %w", err)
	}
	client.flusher.Flush()
	return nil
}
