package snapshots

import "time"

// The five numbers this package runs on.
//
// Constants and not environment variables, for the reason ADR 0019 gives about
// the roll-up and ADR 0020 about the refresher: they answer no question that
// differs between one deployment and another. One of them carries a second
// reason -- snapshotEvery decides how dense the site's own measurement history
// is, and an operator who could thin it from the environment would thin months
// of it on the next tick without the page ever looking different.
const (
	// The tick, and it is three numbers agreeing rather than one chosen.
	// The recording rules average over 5m, F4's probe measures every 5m, and
	// internal/ops rolls up every 5m. Asking faster would resample the same
	// window; asking slower would leave the page behind data that already
	// exists.
	snapshotEvery = 5 * time.Minute

	// The ceiling on one run, and "kurzes Timeout" from build plan line 1172.
	// Generous by a factor of a thousand against what the query costs -- two
	// recorded series out of a neighbouring container -- and that is the point:
	// this bound exists to keep a run from overlapping the next tick, not to
	// tune anything.
	runTimeout = 5 * time.Second

	// One HTTP attempt. There is no second one; see the note on Retry in
	// snapshots.go.
	attemptTimeout = 2 * time.Second

	// The bound on what the answer may cost us in memory. A vector of two
	// samples is a few hundred bytes; sixty-four kilobytes is room for a
	// Prometheus error document and no room for an accident.
	maxResponseBytes = 64 << 10

	// The floor and ceiling the contract declares for errorRate. Values outside
	// it are refused rather than clamped -- see reading.take.
	minRatio = 0
	maxRatio = 1
)
