package mail

import (
	"bytes"
	"context"
	"log/slog"
	"strings"
	"testing"
)

// Until F1 this transport logged `envelope`: the whole of RFC 5322, which is
// the visitor's address, their name and the text they typed. The operations
// sheet rules out exactly that — "no IP, no form contents" — and internal/logx
// cannot repair it, because a filter that recognises an address leaves the name
// and the message standing.
//
// The test is written against the whole fixture rather than the address alone,
// so that reinstating any part of the envelope fails it.
func TestTheLogTransportNeverWritesTheMessage(t *testing.T) {
	var buf bytes.Buffer
	log := slog.New(slog.NewJSONHandler(&buf, nil))

	m := fixture()
	if err := NewLogSender("contact@timseil.dev", log).Send(context.Background(), m); err != nil {
		t.Fatalf("Send: %v", err)
	}

	out := buf.String()
	for _, forbidden := range []struct{ what, value string }{
		{"the visitor's address", "anna@example.org"},
		{"the visitor's name", "Anna Keller"},
		{"the message they typed", "Hallo, ich habe eine Frage."},
		{"the operator's inbox", "inbox@timseil.dev"},
		{"the raw envelope", "Reply-To:"},
	} {
		if strings.Contains(out, forbidden.value) {
			t.Errorf("%s reached the log:\n%s", forbidden.what, out)
		}
	}

	// What the line is for: proving the message was really assembled.
	if !strings.Contains(out, m.MessageID) {
		t.Errorf("the message id is gone, so the line proves nothing:\n%s", out)
	}
	if !strings.Contains(out, `"bytes"`) {
		t.Errorf("the byte count is gone, and it was the evidence:\n%s", out)
	}
}
