// The grammar, and mostly the ways of breaking it.
//
// The file is written by a machine and read by this one, so the interesting
// cases are all on the rejecting side: a parser that quietly skips a line it
// does not understand turns a corrupted log into a shorter one, and a shorter
// outage log reads as "the site was up".
package uptime

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

const header = "# uptime-log.txt — machine written (F4). Format: docs/adr/0038.\n"

func stamp(t *testing.T, s string) time.Time {
	t.Helper()

	at, err := time.Parse(stampLayout, s)
	if err != nil {
		t.Fatalf("the test's own stamp %q does not parse: %v", s, err)
	}
	return at
}

// parseString keeps the readers out of the cases that are about content.
func parseString(t *testing.T, in string) ([]transition, error) {
	t.Helper()
	return parse(strings.NewReader(in))
}

func TestParseReadsAClosedOutage(t *testing.T) {
	in := header +
		"2026-08-24T09:15:00Z\tdown\tconnect timeout\n" +
		"2026-08-24T09:40:00Z\tup\n"

	got, err := parse(strings.NewReader(in))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	want := []transition{
		{at: stamp(t, "2026-08-24T09:15:00Z"), up: false, reason: "connect timeout"},
		{at: stamp(t, "2026-08-24T09:40:00Z"), up: true},
	}

	if len(got) != len(want) {
		t.Fatalf("got %d transitions, want %d", len(got), len(want))
	}
	for i := range want {
		if !got[i].at.Equal(want[i].at) || got[i].up != want[i].up || got[i].reason != want[i].reason {
			t.Errorf("transition %d: got %+v, want %+v", i, got[i], want[i])
		}
	}
}

// A file with nothing in it is the ordinary state of this log, not a fault: no
// outage has happened yet. The same has to hold for a file that carries only
// its header, because that is what the prober writes when it creates one.
func TestParseAcceptsAnEmptyLog(t *testing.T) {
	for name, in := range map[string]string{
		"nothing at all":  "",
		"only the header": header,
		"header, no eol":  strings.TrimSuffix(header, "\n"),
	} {
		t.Run(name, func(t *testing.T) {
			got, err := parse(strings.NewReader(in))
			if err != nil {
				t.Fatalf("parse: %v", err)
			}
			if len(got) != 0 {
				t.Fatalf("got %d transitions, want none", len(got))
			}
		})
	}
}

func TestParseRejects(t *testing.T) {
	cases := map[string]struct {
		in   string
		says string
	}{
		"down follows down": {
			in: "2026-08-24T09:15:00Z\tdown\tconnect timeout\n" +
				"2026-08-24T09:20:00Z\tdown\tconnect timeout\n",
			says: "alternate",
		},
		"up follows up": {
			in: "2026-08-24T09:15:00Z\tdown\tconnect timeout\n" +
				"2026-08-24T09:40:00Z\tup\n" +
				"2026-08-24T09:45:00Z\tup\n",
			says: "alternate",
		},
		"the log opens with up": {
			in:   "2026-08-24T09:40:00Z\tup\n",
			says: "opens with up",
		},
		"the stamp goes backwards": {
			in: "2026-08-24T09:15:00Z\tdown\tconnect timeout\n" +
				"2026-08-24T09:10:00Z\tup\n",
			says: "does not come after",
		},
		"the stamp stands still": {
			in: "2026-08-24T09:15:00Z\tdown\tconnect timeout\n" +
				"2026-08-24T09:15:00Z\tup\n",
			says: "does not come after",
		},
		"a reason on an up line": {
			in: "2026-08-24T09:15:00Z\tdown\tconnect timeout\n" +
				"2026-08-24T09:40:00Z\tup\tconnect timeout\n",
			says: "only an outage has one",
		},
		"a down line without a reason": {
			in:   "2026-08-24T09:15:00Z\tdown\n",
			says: "name its reason",
		},
		// The one that matters most. An unlisted reason is how an address gets
		// into a public file: the prober maps a curl exit code, and anything
		// that is not a mapping is a quote.
		"a reason outside the vocabulary": {
			in:   "2026-08-24T09:15:00Z\tdown\tconnect to 203.0.113.7 port 443 failed\n",
			says: "not one of the reasons",
		},
		"fractional seconds": {
			in:   "2026-08-24T09:15:00.123Z\tdown\tconnect timeout\n",
			says: "not a stamp",
		},
		"an offset instead of Z": {
			in:   "2026-08-24T11:15:00+02:00\tdown\tconnect timeout\n",
			says: "not a stamp",
		},
		"a date without a time": {
			in:   "2026-08-24\tdown\tconnect timeout\n",
			says: "not a stamp",
		},
		// Spaces instead of tabs read as one field, which would let a reason
		// with a space in it swallow the field beside it.
		"spaces instead of tabs": {
			in:   "2026-08-24T09:15:00Z down connect timeout\n",
			says: "tab separated",
		},
		"one field": {
			in:   "2026-08-24T09:15:00Z\n",
			says: "tab separated",
		},
		"four fields": {
			in:   "2026-08-24T09:15:00Z\tdown\tconnect timeout\textra\n",
			says: "tab separated",
		},
		"a state that is neither": {
			in:   "2026-08-24T09:15:00Z\tflaky\tconnect timeout\n",
			says: "neither up nor down",
		},
		"an empty line in the middle": {
			in: "2026-08-24T09:15:00Z\tdown\tconnect timeout\n" +
				"\n" +
				"2026-08-24T09:40:00Z\tup\n",
			says: "empty",
		},
	}

	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			got, err := parse(strings.NewReader(header + tc.in))
			if err == nil {
				t.Fatalf("parse accepted it and returned %d transitions", len(got))
			}
			if !strings.Contains(err.Error(), tc.says) {
				t.Fatalf("error is %q, want it to mention %q", err, tc.says)
			}
		})
	}
}

// The three bounds, each hit from just over the edge. Nothing is returned from
// a file that breaks one — a truncated read would be the shorter-log failure
// again, arriving through the door marked "safety".
func TestParseRejectsAFileThatIsTooBig(t *testing.T) {
	t.Run("too many lines", func(t *testing.T) {
		var b strings.Builder
		b.WriteString(header)

		at := stamp(t, "2020-01-01T00:00:00Z")
		for i := range maxLines + 1 {
			if i%2 == 0 {
				b.WriteString(at.Format(stampLayout) + "\tdown\tconnect timeout\n")
			} else {
				b.WriteString(at.Format(stampLayout) + "\tup\n")
			}
			at = at.Add(time.Minute)
		}

		if _, err := parse(strings.NewReader(b.String())); err == nil ||
			!strings.Contains(err.Error(), "longer than") {
			t.Fatalf("err is %v, want it to name the line limit", err)
		}
	})

	t.Run("one line too long", func(t *testing.T) {
		in := header + "2026-08-24T09:15:00Z\tdown\t" + strings.Repeat("x", maxLineBytes) + "\n"

		if _, err := parse(strings.NewReader(in)); err == nil ||
			!strings.Contains(err.Error(), "bytes") {
			t.Fatalf("err is %v, want it to name the line length", err)
		}
	})

	t.Run("too many bytes", func(t *testing.T) {
		// Long comment lines: past the byte budget without tripping the line
		// count or the line length first, so it is this bound that answers.
		var b strings.Builder
		for b.Len() <= maxBytes {
			b.WriteString("# " + strings.Repeat("c", 1000) + "\n")
		}

		if _, err := parse(strings.NewReader(b.String())); err == nil ||
			!strings.Contains(err.Error(), "larger than") {
			t.Fatalf("err is %v, want it to name the byte limit", err)
		}
	})
}

// Every reason the prober may write has to survive the parser. The two lists
// are the same promise written twice, and this is the test that keeps them one.
func TestParseAcceptsEveryReasonInTheVocabulary(t *testing.T) {
	for reason := range reasons {
		t.Run(reason, func(t *testing.T) {
			in := header + "2026-08-24T09:15:00Z\tdown\t" + reason + "\n"

			got, err := parse(strings.NewReader(in))
			if err != nil {
				t.Fatalf("parse: %v", err)
			}
			if len(got) != 1 || got[0].reason != reason {
				t.Fatalf("got %+v, want one transition carrying %q", got, reason)
			}
		})
	}
}

// The two halves of the grammar are written in different languages: tools/probe.sh
// appends the lines, this package accepts them, and nothing in a type system
// connects the two. So the fixture is not hand-written — it is the file the
// script actually produced when it was driven through an outage and a recovery
// against a local server, copied in byte for byte.
//
// If somebody changes the format on either side and not the other, this is the
// test that notices. A hand-typed fixture would only prove that the parser
// agrees with whoever typed it.
func TestTheFileToolsProbeWritesParses(t *testing.T) {
	in, err := os.ReadFile(filepath.Join("testdata", "uptime-log.txt"))
	if err != nil {
		t.Fatalf("reading the fixture: %v", err)
	}

	ts, err := parse(bytes.NewReader(in))
	if err != nil {
		t.Fatalf("the file tools/probe.sh wrote does not parse: %v", err)
	}

	if len(ts) != 2 || ts[0].up || !ts[1].up {
		t.Fatalf("got %+v, want one outage and its recovery", ts)
	}
	if ts[0].reason != "http 5xx" {
		t.Errorf("the outage reads %q, want the word the script mapped", ts[0].reason)
	}

	// And the header the script writes when it creates the file has to be a
	// comment on this side, not a line.
	if !bytes.HasPrefix(in, []byte("# uptime-log.txt")) {
		t.Error("the fixture lost the header tools/probe.sh writes")
	}
}
