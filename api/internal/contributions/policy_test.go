package contributions

import (
	"testing"
	"time"
)

// clock is a hand-wound one. The breaker's whole subject is elapsed time, and a
// test that waited half an hour for the cooldown would be a test nobody runs.
type clock struct{ t time.Time }

func newClock() *clock {
	return &clock{t: time.Date(2026, 8, 18, 9, 0, 0, 0, time.UTC)}
}

func (c *clock) now() time.Time      { return c.t }
func (c *clock) add(d time.Duration) { c.t = c.t.Add(d) }

// The arithmetic in the constant block, as a test. Three attempts of eight
// seconds plus two backoffs of at most half a second and a second have to fit
// inside the thirty-second ceiling on a run — otherwise a run can overlap the
// next tick, two of them race on the same row, and the requests double during
// exactly the outage the breaker exists to damp.
func TestTheAttemptBudgetFitsInsideTheRunTimeout(t *testing.T) {
	worst := time.Duration(maxAttempts) * attemptTimeout
	for attempt := 1; attempt < maxAttempts; attempt++ {
		worst += backoffBase << (attempt - 1)
	}

	if worst >= runTimeout {
		t.Errorf("the worst case is %s and runTimeout is %s — a run can overlap the next tick",
			worst, runTimeout)
	}
	if runTimeout >= refreshEvery {
		t.Errorf("runTimeout %s is not shorter than the tick %s", runTimeout, refreshEvery)
	}
	// And the hour the contract promises is the hour this package uses.
	if staleAfter != time.Hour {
		t.Errorf("staleAfter = %s, want an hour — the contract says s-maxage=3600", staleAfter)
	}
}
