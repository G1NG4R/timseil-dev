package uptime

import "time"

// observation is one row this package will write: the instant a check would
// have run, and the reason it would have failed.
//
// There is no `up` field. A backfilled row is always down — the store query
// writes the column as a constant and ADR 0038 says why: the file is an OUTAGE
// log, "up" is bezeugt by a live probe or by nobody, and a replayed line must
// not be able to claim the site was answering.
type observation struct {
	at     time.Time
	reason string
}

// observations turns transitions into the checks the prober could not deliver.
//
// One pair at a time: a `down` and the `up` that closes it become an instant
// every step from the first, up to but NOT including the recovery. The
// arithmetic has to agree with the roll-up's, because down_sec in
// queries/ops.sql is failed checks TIMES the probe interval — five instants
// across 09:15 to 09:40 is 1500 seconds, which is the outage that happened. An
// off-by-one here is a public number that is five minutes wrong and looks right.
//
// A TRAILING `down` PRODUCES NOTHING. It has no end yet: either the host is
// still away, in which case nothing here is running to ask, or the prober has
// not written the recovery yet and the next run of this loop will find it —
// ON CONFLICT DO NOTHING makes reading the same interval twice free. Counting
// an open outage up to "now" would put a number on the page that no probe
// produced, which is invariant 1 with a clock attached.
//
// There is no cap on how long one outage may be. maxLines already bounds the
// work, and the case a duration cap would "protect" against — a host away for
// weeks — is precisely the record this file exists to keep.
func observations(ts []transition, step time.Duration) []observation {
	// A non-positive step would spin forever. It cannot happen from cmd/api,
	// which passes a constant, and the guard is here so that it cannot happen
	// from the next caller either.
	if step <= 0 {
		return nil
	}

	var out []observation

	// Walked from the second transition, so every step has the pair it needs and
	// the first line is only ever somebody's opening. That also states the
	// trailing-down rule without a special case: an outage whose recovery has not
	// been written has no i to be closed by, so the loop never reaches it.
	//
	// parse guarantees the alternation, which is what lets the predecessor of an
	// `up` be a `down` without asking.
	for i := 1; i < len(ts); i++ {
		down, up := ts[i-1], ts[i]
		if down.up {
			continue
		}

		for at := down.at; at.Before(up.at); at = at.Add(step) {
			out = append(out, observation{at: at, reason: down.reason})
		}
	}

	return out
}
