package web

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"xbot/bus"
	log "xbot/logger"
	"xbot/protocol"

	"github.com/google/uuid"
)

var (
	errInboundUnavailable = errors.New("message bus unavailable")
	errEmptyMessage       = errors.New("content or upload_keys is required")
)

type inboundIdentity struct {
	SenderID           string
	SenderName         string
	WebUserID          int
	FeishuUserID       string
	CanonicalUserID    int64
	CanonicalRole      string
	IsCLI              bool
	OverrideSenderID   string
	OverrideSenderName string
}

func (wc *WebChannel) inboundIdentityFromRequest(r *http.Request) inboundIdentity {
	identity := inboundIdentity{
		SenderID:  senderIDFromContext(r.Context()),
		WebUserID: userIDFromContext(r.Context()),
	}
	if si, ok := webSessionFromContext(r.Context()); ok {
		identity.SenderName = si.username
		identity.FeishuUserID = si.feishuUserID
	}
	if identity.SenderName == "" {
		identity.SenderName = identity.SenderID
	}
	if wc.callbacks.IdentityResolver != nil {
		resolveChannel := "web"
		if identity.FeishuUserID != "" {
			resolveChannel = "feishu"
		}
		identity.CanonicalUserID, identity.CanonicalRole, _ = wc.callbacks.IdentityResolver.Resolve(resolveChannel, identity.SenderID)
	}
	return identity
}

func (wc *WebChannel) resolveInboundSession(ctx context.Context, identity inboundIdentity, channelName, chatID string) (SessionSelector, error) {
	sel := wc.GetCurrentSession(identity.SenderID)
	if channelName != "" && chatID != "" {
		sel = SessionSelector{Channel: channelName, ChatID: chatID}
	}
	if !identity.IsCLI && !wc.canAccessSession(ctx, identity.WebUserID, identity.SenderID, sel.Channel, sel.ChatID) {
		return SessionSelector{}, fmt.Errorf("access denied")
	}
	return sel, nil
}

func (wc *WebChannel) dispatchUserMessage(ctx context.Context, identity inboundIdentity, msg protocol.WSClientMessage) (SessionSelector, error) {
	if strings.TrimSpace(msg.Content) == "" && len(msg.UploadKeys) == 0 {
		return SessionSelector{}, errEmptyMessage
	}

	sel, err := wc.resolveInboundSession(ctx, identity, msg.Channel, msg.ChatID)
	if err != nil {
		return SessionSelector{}, err
	}

	originalContent := msg.Content
	content := wc.expandUploadKeys(msg)
	metadata := map[string]string{bus.MetadataReplyPolicy: bus.ReplyPolicyOptional}
	if identity.FeishuUserID != "" {
		metadata["feishu_user_id"] = identity.FeishuUserID
	}
	if identity.CanonicalUserID > 0 {
		metadata["user_id"] = strconv.FormatInt(identity.CanonicalUserID, 10)
		metadata["user_role"] = identity.CanonicalRole
	}

	msgSenderID := identity.SenderID
	msgSenderName := identity.SenderName
	msgChatType := "p2p"
	if identity.IsCLI {
		if msg.SenderID != "" {
			msgSenderID = msg.SenderID
		}
		if msg.SenderName != "" {
			msgSenderName = msg.SenderName
		}
		if msg.ChatType != "" {
			msgChatType = msg.ChatType
		}
	}

	if content != originalContent && len(msg.UploadKeys) > 0 {
		wc.hub.sendToClient(sel.ChatID, protocol.WSMessage{
			Type:            protocol.MsgTypeUserEcho,
			Content:         content,
			OriginalContent: originalContent,
			TS:              time.Now().Unix(),
		})
	}

	trimmed := strings.TrimSpace(content)
	if wc.db != nil && shouldEagerSaveUserMessage(sel.Channel, trimmed) {
		if err := eagerSaveUserMsg(wc.db, sel.Channel, sel.ChatID, content); err != nil {
			log.WithError(err).Warn("Failed to eager-save user message")
		} else {
			metadata["user_msg_eager_saved"] = "true"
		}
	}

	err = wc.enqueueInbound(ctx, bus.InboundMessage{
		Channel:    sel.Channel,
		SenderID:   msgSenderID,
		SenderName: msgSenderName,
		ChatID:     sel.ChatID,
		ChatType:   msgChatType,
		Content:    content,
		Time:       time.Now(),
		RequestID:  strings.ReplaceAll(uuid.New().String(), "-", ""),
		From:       bus.NewIMAddress(sel.Channel, msgSenderID),
		Metadata:   metadata,
	})
	return sel, err
}

func (wc *WebChannel) expandUploadKeys(msg protocol.WSClientMessage) string {
	content := msg.Content
	if len(msg.UploadKeys) == 0 || wc.ossProvider == nil {
		return content
	}
	for i, key := range msg.UploadKeys {
		displayName := key
		if i < len(msg.FileNames) && msg.FileNames[i] != "" {
			displayName = filepath.Base(msg.FileNames[i])
		}
		var fileSize int64
		if i < len(msg.FileSizes) {
			fileSize = msg.FileSizes[i]
		}
		downloadURL, err := wc.ossProvider.GetDownloadURL(key)
		if err != nil {
			log.WithError(err).WithField("key", key).Warn("Failed to get download URL for OSS file")
			content += fmt.Sprintf("\n\n📎 [用户上传文件: %s] (获取下载链接失败)", displayName)
			continue
		}
		ext := strings.ToLower(filepath.Ext(displayName))
		if isImageExt(ext) {
			content += fmt.Sprintf("\n\n<image url=\"%s\" name=\"%s\" size=\"%d\" />\n![%s](%s)", downloadURL, displayName, fileSize, displayName, downloadURL)
		} else {
			content += fmt.Sprintf("\n\n<file name=\"%s\" url=\"%s\" size=\"%d\" />", displayName, downloadURL, fileSize)
		}
	}
	return content
}

func (wc *WebChannel) dispatchCancel(ctx context.Context, identity inboundIdentity, channelName, chatID string) (SessionSelector, error) {
	sel, err := wc.resolveInboundSession(ctx, identity, channelName, chatID)
	if err != nil {
		return SessionSelector{}, err
	}
	msgSenderID := identity.SenderID
	msgSenderName := identity.SenderName
	if identity.IsCLI {
		if identity.OverrideSenderID != "" {
			msgSenderID = identity.OverrideSenderID
		}
		if identity.OverrideSenderName != "" {
			msgSenderName = identity.OverrideSenderName
		}
	}
	return sel, wc.enqueueInbound(ctx, bus.InboundMessage{
		Channel:    sel.Channel,
		SenderID:   msgSenderID,
		SenderName: msgSenderName,
		ChatID:     sel.ChatID,
		ChatType:   "p2p",
		Content:    "/cancel",
		Time:       time.Now(),
		RequestID:  strings.ReplaceAll(uuid.New().String(), "-", ""),
		From:       bus.NewIMAddress(sel.Channel, msgSenderID),
	})
}

func (wc *WebChannel) dispatchAskUserResponse(ctx context.Context, identity inboundIdentity, channelName, chatID string, response protocol.AskUserResponse) (SessionSelector, error) {
	sel, err := wc.resolveInboundSession(ctx, identity, channelName, chatID)
	if err != nil {
		return SessionSelector{}, err
	}
	if response.Cancelled {
		return wc.dispatchCancel(ctx, identity, sel.Channel, sel.ChatID)
	}
	if len(response.Answers) == 0 {
		return SessionSelector{}, fmt.Errorf("answer is required")
	}
	parts := make([]string, 0, len(response.Answers))
	for questionID, answer := range response.Answers {
		parts = append(parts, fmt.Sprintf("Q%s: %s", questionID, answer))
	}
	return sel, wc.enqueueInbound(ctx, bus.InboundMessage{
		Channel:    sel.Channel,
		SenderID:   identity.SenderID,
		SenderName: identity.SenderName,
		ChatID:     sel.ChatID,
		ChatType:   "p2p",
		Content:    strings.Join(parts, "\n\n"),
		Time:       time.Now(),
		RequestID:  strings.ReplaceAll(uuid.New().String(), "-", ""),
		From:       bus.NewIMAddress(sel.Channel, identity.SenderID),
		Metadata:   map[string]string{"ask_user_answered": "true"},
	})
}

func (wc *WebChannel) enqueueInbound(ctx context.Context, message bus.InboundMessage) error {
	if wc.msgBus == nil {
		return errInboundUnavailable
	}
	select {
	case wc.msgBus.Inbound <- message:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	case <-wc.stopCh:
		return errInboundUnavailable
	}
}
