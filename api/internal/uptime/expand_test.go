// The arithmetic, held against the sentence queries/ops.sql computes.
//
// down_sec is failed checks TIMES the probe interval, so the count these cases
// assert is a public number in disguise: one instant too many or too few is an
// outage duration that is five minutes wrong on a page that says it measures.
package uptime

import (
	"testing"
	"time"
)

const step = 5 * time.Minute

// The example ADR 0038 is written around: 09:15 to 09:40, five instants, and
// 5 × 300 s is the 25 minutes that actually happened.
func TestObservationsExpandsAnOutageOntoTheProbeInterval(t *testing.T) {
	ts := []transition{
		{at: stamp(t, "2026-08-24T09:15:00Z"), reason: "connect timeout"},
		{at: stamp(t, "2026-08-24T09:40:00Z"), up: true},
	}

	got := observations(ts, step)

	want := []string{
		"2026-08-24T09:15:00Z",
		"2026-08-24T09:20:00Z",
		"2026-08-24T09:25:00Z",
		"2026-08-24T09:30:00Z",
		"2026-08-24T09:35:00Z",
	}

	if len(got) != len(want) {
		t.Fatalf("got %d observations, want %d", len(got), len(want))
	}
	for i, at := range want {
		if got[i].at.Format(stampLayout) != at {
			t.Errorf("observation %d is %s, want %s", i, got[i].at.Format(stampLayout), at)
		}
		if got[i].reason != "connect timeout" {
			t.Errorf("observation %d carries reason %q, want the one from its down line", i, got[i].reason)
		}
	}

	if downSec := len(got) * int(step.Seconds()); downSec != 1500 {
		t.Errorf("the roll-up would compute down_sec %d, want 1500", downSec)
	}
}

// The recovery is the exclusive end. An up landing exactly on a grid point is
// the off-by-one this test exists for: counting it would charge five minutes to
// an outage that had already ended.
func TestObservationsExcludesTheRecovery(t *testing.T) {
	cases := map[string]struct {
		down, up string
		want     int
	}{
		"recovery one step later":    {"2026-08-24T09:15:00Z", "2026-08-24T09:20:00Z", 1},
		"recovery inside one step":   {"2026-08-24T09:15:00Z", "2026-08-24T09:17:30Z", 1},
		"recovery a second later":    {"2026-08-24T09:15:00Z", "2026-08-24T09:15:01Z", 1},
		"recovery two steps later":   {"2026-08-24T09:15:00Z", "2026-08-24T09:25:00Z", 2},
		"recovery just short of two": {"2026-08-24T09:15:00Z", "2026-08-24T09:24:59Z", 2},
	}

	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			ts := []transition{
				{at: stamp(t, tc.down), reason: "http 5xx"},
				{at: stamp(t, tc.up), up: true},
			}

			if got := observations(ts, step); len(got) != tc.want {
				t.Fatalf("got %d observations, want %d", len(got), tc.want)
			}
		})
	}
}

// An outage that runs over midnight has to land in two days, because ops_days
// is keyed by day and the grid draws two cells for it.
func TestObservationsCrossMidnight(t *testing.T) {
	ts := []transition{
		{at: stamp(t, "2026-08-24T23:50:00Z"), reason: "connect refused"},
		{at: stamp(t, "2026-08-25T00:10:00Z"), up: true},
	}

	days := map[string]int{}
	for _, o := range observations(ts, step) {
		days[o.at.UTC().Format(time.DateOnly)]++
	}

	if len(days) != 2 || days["2026-08-24"] != 2 || days["2026-08-25"] != 2 {
		t.Fatalf("got %v, want two observations on each of the two days", days)
	}
}

// The trailing-down rule, and the reason the loop is safe to run again: an
// outage without a recorded end contributes nothing at all until the prober has
// written its up line.
func TestObservationsIgnoresAnOpenOutage(t *testing.T) {
	open := []transition{
		{at: stamp(t, "2026-08-24T09:15:00Z"), reason: "dns failure"},
	}

	if got := observations(open, step); len(got) != 0 {
		t.Fatalf("got %d observations from an open outage, want none", len(got))
	}

	// The same log one probe later, once the recovery is on the branch.
	closed := []transition{open[0], {at: stamp(t, "2026-08-24T09:25:00Z"), up: true}}
	if got := observations(closed, step); len(got) != 2 {
		t.Fatalf("got %d observations once it closed, want 2", len(got))
	}
}

func TestObservationsHandlesSeveralOutages(t *testing.T) {
	ts := []transition{
		{at: stamp(t, "2026-08-24T09:15:00Z"), reason: "connect timeout"},
		{at: stamp(t, "2026-08-24T09:25:00Z"), up: true},
		{at: stamp(t, "2026-08-25T14:00:00Z"), reason: "api unreachable"},
		{at: stamp(t, "2026-08-25T14:15:00Z"), up: true},
	}

	got := observations(ts, step)
	if len(got) != 5 {
		t.Fatalf("got %d observations, want 2 from the first outage and 3 from the second", len(got))
	}
	if got[0].reason != "connect timeout" || got[4].reason != "api unreachable" {
		t.Errorf("the reasons did not stay with their own outage: %q and %q", got[0].reason, got[4].reason)
	}
}

func TestObservationsRefusesANonPositiveStep(t *testing.T) {
	ts := []transition{
		{at: stamp(t, "2026-08-24T09:15:00Z"), reason: "tls failure"},
		{at: stamp(t, "2026-08-24T09:40:00Z"), up: true},
	}

	for name, bad := range map[string]time.Duration{"zero": 0, "negative": -step} {
		t.Run(name, func(t *testing.T) {
			if got := observations(ts, bad); got != nil {
				t.Fatalf("got %d observations, want none", len(got))
			}
		})
	}
}

// The two halves together: what the file says, expanded the way the roll-up
// will read it.
func TestParseAndObservationsAgree(t *testing.T) {
	in := header +
		"2026-08-24T09:15:00Z\tdown\tconnect timeout\n" +
		"2026-08-24T09:40:00Z\tup\n"

	ts, err := parseString(t, in)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	if got := observations(ts, step); len(got) != 5 {
		t.Fatalf("got %d observations, want 5", len(got))
	}
}
