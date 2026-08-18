package intake

import (
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
)

// The two bounds on `at`, and neither is a database rule.
//
// FUTURE. A report from ahead of the clock is the expensive one. health.sql's
// LastDeploy is `ORDER BY deployed_at DESC LIMIT 1`, so a single deploy stamped
// 2099 becomes the permanent lastDeploy on /api/health and on the version
// badge, and there is no endpoint that can take it back — the API only writes.
// DeploysForSystem bounds deployed_at from below and not from above, so the
// same row is also a bar over a day that has not happened. Two minutes is room
// for ordinary clock skew between a GitHub runner and this host, and nothing
// more.
//
// PAST. Not an aggregation question: RollUpOpsDays scans on recorded_at and
// groups on observed_at, exactly so that a months-old observation replayed from
// the ops-data branch is still aggregated. It is a growth question. The unique
// constraint on (system_id, observed_at) is the only thing bounding how many
// rows an authenticated but broken prober can write, and without a floor it can
// walk observed_at backwards for ever.
const (
	maxSkewAhead = 2 * time.Minute
	maxAge       = 90 * 24 * time.Hour
)

// maxReasonRunes bounds a free-text field that reaches a public grid. `reason`
// is unbounded text in the schema; a prober that pastes a stack trace into it
// writes a stack trace into our database.
const maxReasonRunes = 200

func (h *Handler) checkInstant(at time.Time) string {
	if at.IsZero() {
		return "required"
	}

	now := h.now()
	switch {
	case at.After(now.Add(maxSkewAhead)):
		return "is in the future"
	case at.Before(now.Add(-maxAge)):
		return fmt.Sprintf("is more than %d days old", int(maxAge.Hours()/24))
	}
	return ""
}

// checkInt32 guards the width of the column rather than the sign alone.
//
// Both values land in a Postgres `integer`. The contract says `type: integer`
// with no bounds, oapi-codegen widens that to Go's int, and so every value from
// 2^31 to 2^63 decodes without complaint and fails in the driver — a 500 for
// something the caller could have been told about.
func checkInt32(v int) string {
	switch {
	case v < 0:
		return "must not be negative"
	case v > math.MaxInt32:
		return "is larger than this field can hold"
	}
	return ""
}

// checkSHA restates deploys_sha_shape_ck: seven to forty lowercase hex digits.
//
// Restated rather than delegated, and rejected rather than lower-cased. A
// pipeline that sends `ABCDEF1` has a bug worth one clear 400; silently
// rewriting its input would store something other than what was sent, which is
// the same objection the contact endpoint raised against a decoder that
// normalises addresses.
func checkSHA(sha string) string {
	if len(sha) < 7 || len(sha) > 40 {
		return "must be 7 to 40 characters"
	}
	for _, r := range sha {
		if (r < '0' || r > '9') && (r < 'a' || r > 'f') {
			return "must be lowercase hexadecimal"
		}
	}
	return ""
}

// collapse flattens anything a log line or a mail header would treat as a
// break. The column is plain text and nothing renders it as HTML, so this is
// not about injection here — it is about a reason that stays one line wherever
// it is read next.
func collapse(s string) string {
	return strings.Join(strings.Fields(s), " ")
}

func truncate(s string, limit int) string {
	runes := []rune(s)
	if len(runes) <= limit {
		return s
	}
	return string(runes[:limit-1]) + "…"
}

func timestamp(t time.Time) pgtype.Timestamptz {
	return pgtype.Timestamptz{Time: t.UTC(), Valid: true}
}
