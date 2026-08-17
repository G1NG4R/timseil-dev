package reqid

import (
	"context"
	"testing"
)

func TestNewIsUniqueAndWellFormed(t *testing.T) {
	seen := make(map[string]bool, 1000)
	for i := 0; i < 1000; i++ {
		id := New()
		if !Valid(id) {
			t.Fatalf("New() produced %q, which Valid rejects", id)
		}
		if seen[id] {
			t.Fatalf("New() repeated %q after %d draws", id, i)
		}
		seen[id] = true
	}
}

// The broken cases are the point. This value ends up in a JSON log line and in
// a response header, so a newline in it forges log entries and a control
// character splits the header.
func TestValidRejectsWhatWouldForgeALogLineOrSplitAHeader(t *testing.T) {
	bad := map[string]string{
		"a newline":          "abcdefgh\nlevel=ERROR msg=\"nice try\"",
		"a carriage return":  "abcdefgh\r\nSet-Cookie: admin=1",
		"a quote":            `abcdefgh"`,
		"a brace":            "abcdefgh{}",
		"a space":            "abcd efgh",
		"a tab":              "abcdefgh\t",
		"too short":          "abc",
		"empty":              "",
		"beyond the ceiling": string(make([]byte, 65)),
		"non-ascii":          "abcdefgh—",
	}
	for what, id := range bad {
		if Valid(id) {
			t.Errorf("Valid accepted %s: %q", what, id)
		}
	}
}

func TestValidAcceptsWhatOtherServicesActuallySend(t *testing.T) {
	good := []string{
		New(),
		"0123456789abcdef0123456789abcdef",
		"req-01K3F9QX7A",
		"trace_id_with_underscores",
	}
	for _, id := range good {
		if !Valid(id) {
			t.Errorf("Valid rejected %q", id)
		}
	}
}

func TestTheContextRoundTrips(t *testing.T) {
	id := New()
	if got := From(With(context.Background(), id)); got != id {
		t.Errorf("From(With(ctx, %q)) = %q", id, got)
	}
}

// A handler under unit test runs outside the chain. It must get an empty
// string, not a panic and not a wrong type read out of somebody else's key.
func TestFromAnEmptyContextIsEmpty(t *testing.T) {
	if got := From(context.Background()); got != "" {
		t.Errorf("From(background) = %q, want empty", got)
	}
}
