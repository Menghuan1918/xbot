package web

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"xbot/protocol"
)

// apiError mirrors the error envelope returned by jsonErrorResponse.
type apiError struct {
	Code    string `json:"code,omitempty"`
	Message string `json:"message,omitempty"`
}

type testAPIEnvelope struct {
	OK    bool            `json:"ok"`
	Data  json.RawMessage `json:"data"`
	Error *apiError       `json:"error"`
}

func decodeAPIData(t *testing.T, reader io.Reader, dst any) testAPIEnvelope {
	t.Helper()
	var envelope testAPIEnvelope
	if err := json.NewDecoder(reader).Decode(&envelope); err != nil {
		t.Fatal(err)
	}
	if len(envelope.Data) > 0 && string(envelope.Data) != "null" && dst != nil {
		if err := json.Unmarshal(envelope.Data, dst); err != nil {
			t.Fatal(err)
		}
	}
	return envelope
}

// authedAPIRequestFor creates an authenticated request with a custom sender/userID.
func authedAPIRequestFor(method, target string, body []byte, senderID string, userID int) *http.Request {
	req := httptest.NewRequest(method, target, bytes.NewReader(body))
	ctx := contextWithSenderID(contextWithUserID(req.Context(), userID), senderID)
	return req.WithContext(ctx)
}

// fixedIdentityResolver is a test stub for IdentityResolverAPI.
type fixedIdentityResolver struct {
	userID int64
	role   string
}

func (f fixedIdentityResolver) Resolve(channel, channelUserID string) (int64, string, error) {
	return f.userID, f.role, nil
}
func (f fixedIdentityResolver) IsAdmin(userID int64) bool            { return f.role == "admin" }
func (f fixedIdentityResolver) SetRole(userID int64, role string) error { return nil }
func (f fixedIdentityResolver) ListIdentities(userID int64) (any, error) { return []any{}, nil }
func (f fixedIdentityResolver) ListAllUsers() (any, error)              { return []any{}, nil }
func (f fixedIdentityResolver) GenerateLinkCode(userID int64) (string, error) {
	return "", nil
}
func (f fixedIdentityResolver) ConsumeLinkCode(code string) (int64, error) { return 0, nil }
func (f fixedIdentityResolver) ValidateLinkCode(code string) (int64, error) { return 0, nil }
func (f fixedIdentityResolver) LinkIdentity(targetUserID int64, channel, channelUserID string) (bool, error) {
	return false, nil
}
func (f fixedIdentityResolver) PreviewMerge(sourceUserID, targetUserID int64) (any, error) { return nil, nil }
func (f fixedIdentityResolver) MergeUsers(sourceUserID, targetUserID int64) error          { return nil }
func (f fixedIdentityResolver) UnlinkIdentity(userID, identityID int64) error              { return nil }

// normalizeSSEEvent reclassifies a progress event into its SSE event type.
// Pure-stream fields (StreamContent/ReasoningStreamContent/StreamingTools)
// map to "stream_content"; everything else maps to "progress_structured".
func normalizeSSEEvent(msg protocol.WSMessage) protocol.WSMessage {
	if msg.Type != protocol.MsgTypeProgress || msg.Progress == nil {
		return msg
	}
	p := msg.Progress
	if p.StreamContent != "" || p.ReasoningStreamContent != "" || len(p.StreamingTools) > 0 {
		msg.Type = protocol.MsgTypeStreamContent
	}
	return msg
}

var _ = context.Background
