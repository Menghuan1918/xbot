package web

import (
	"time"

	"xbot/protocol"
)

// ---------------------------------------------------------------------------
// WebSocket handler
// ---------------------------------------------------------------------------

// wsUpgrader returns a WebSocket upgrader with origin checking.
// validateCLIToken validates a CLI auth token and returns the associated senderID.
// Two auth methods:
//  1. Admin token (WebChannelConfig.AdminToken) — senderID = "admin", full access
//  2. Runner token — per-user token from runner_tokens table
// replayMissedEvents replays buffered events with seq > client's last_seq.
// Waits up to 2s for the client's sync message, then replays.
func (wc *WebChannel) enqueuePendingAskUser(client *Client, channelName, chatID string) bool {
	if wc.callbacks.WithPendingAskUser == nil {
		return false
	}
	return wc.callbacks.WithPendingAskUser(channelName, chatID, func(pending *protocol.ProgressEvent) bool {
		select {
		case client.sendCh <- protocol.WSMessage{
			Type:     protocol.MsgTypeAskUser,
			TS:       time.Now().Unix(),
			Channel:  channelName,
			ChatID:   chatID,
			Progress: pending,
		}:
			return true
		default:
			return false
		}
	})
}

func (wc *WebChannel) writeCurrentWSMessage(
	client *Client,
	msg protocol.WSMessage,
	write func(protocol.WSMessage) error,
) (bool, error) {
	if client.isCLI || msg.Type != protocol.MsgTypeAskUser {
		return true, write(msg)
	}
	if msg.Progress == nil || msg.Progress.RequestID == "" || wc.callbacks.WithPendingAskUser == nil {
		return false, nil
	}

	var current protocol.WSMessage
	written := wc.callbacks.WithPendingAskUser(msg.Channel, msg.ChatID, func(pending *protocol.ProgressEvent) bool {
		if pending.RequestID != msg.Progress.RequestID {
			return false
		}
		msg.Progress = pending
		current = msg
		return true
	})
	if !written {
		return false, nil
	}
	return true, write(current)
}

// isImageExt returns true if the file extension is a common image format.
func isImageExt(ext string) bool {
	switch ext {
	case ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg", ".tiff", ".tif":
		return true
	}
	return false
}

// ---------------------------------------------------------------------------
