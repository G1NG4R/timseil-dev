package uptime

import "time"

// outage is one closed down/up pair, expanded into the instants a check would
// have run at while the host was away.
//
// Grouped by outage rather than flattened into single observations, because the
// outage is the unit that shares a reason and the unit BackfillOpsChecks writes:
// one statement, one reason, one array of instants. A flat list would have to be
// regrouped at the call site to say the same thing.
//
// There is no `up` field. A backfilled row is always down — the store query
// writes that column as a constant and ADR 0038 says why: the file is an OUTAGE
// log, "up" is witnessed by a live probe or by nobody, and a replayed line must
// not be able to claim the site was answering.
type outage struct {
	reason string
	at     []time.Time
}

// outages turns transitions into the checks the prober could not deliver.
//
// One pair at a time: a `down` and the `up` that closes it become an instant
// every step from the first, up to but NOT including the recovery.
//
// WHAT THE COUNT DECIDES CHANGED WITH #180. It used to decide the duration:
// down_sec was failed checks TIMES the probe interval, so five instants across
// 09:15 to 09:40 came to the 1500 seconds that happened, and an off-by-one here
// was a public number five minutes wrong. The roll-up now sums the gaps between
// the instants themselves, so the count decides two other things instead —
// checks_total and checks_down, which are what the outage threshold is compared
// against, and therefore the COLOUR of the cell rather than the number under it.
//
// The duration it produces is now one step short, and that is stated rather than
// papered over: the last instant has no successor, because the recovery is not
// written as a row — a replayed line may never claim the site was up (ADR 0038).
// Five instants are four gaps. Making it exact again means writing the recovery
// as an observation of its own, which is a change to ADR 0038 and not to this
// file.
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
func outages(ts []transition, step time.Duration) []outage {
	// A non-positive step would spin forever. It cannot happen from cmd/api,
	// which passes a constant, and the guard is here so that it cannot happen
	// from the next caller either.
	if step <= 0 {
		return nil
	}

	var out []outage

	// Walked from the second transition, so every step has the pair it needs and
	// the first line is only ever somebody's opening. That also states the
	// trailing-down rule without a special case: an outage whose recovery has not
	// been written has no successor to be closed by, so the loop never reaches it.
	//
	// parse guarantees the alternation, which is what lets the predecessor of an
	// `up` be a `down` without asking.
	for i := 1; i < len(ts); i++ {
		down, up := ts[i-1], ts[i]
		if down.up {
			continue
		}

		var at []time.Time
		for t := down.at; t.Before(up.at); t = t.Add(step) {
			at = append(at, t)
		}

		out = append(out, outage{reason: down.reason, at: at})
	}

	return out
}

// checks is how many rows a replay of these outages would write, before the
// database discards the ones it already has. The log line the loop prints is
// the only place anybody sees it.
func checks(os []outage) int {
	n := 0
	for _, o := range os {
		n += len(o.at)
	}
	return n
}
