// Package contact serves POST /api/contact and drains what it could not
// deliver.
//
// It is the only unauthenticated write path on the site and its only conversion
// point, so it carries more machinery than any read endpoint: a honeypot, a
// dwell time, two rate limits, an origin check, an idempotency key, a hashed
// address, an inline send and a dispatcher behind it.
//
// The five answers, in the order the checks run:
//
//	400  the body did not validate, the content type was wrong, or the Origin
//	     was present and not ours
//	202  the honeypot was filled or the visitor was too fast — no row, no mail,
//	     a receipt that leads nowhere
//	429  the token bucket or the database floor said this address has had its
//	     three in ten minutes
//	202  stored, and either sent or left for the dispatcher
//	502  stored, the relay refused, and the dispatcher will try again
//
// Nothing here writes a name, an address or a message to a log. F1 makes that a
// rule later; the cheapest time to obey it is before the lines exist.
package contact

import "time"

// The numbers this package runs on.
//
// Constants and not environment variables, on ADR 0020 §7's rule: they answer no
// question that differs between one deployment and another. Two of them carry a
// second reason. Three in ten minutes is a promise the public API documentation
// makes in writing, so it belongs in a commit rather than in a Dokploy field.
// And sendBudgetPerHour is what stands between this service and OVH's quota — a
// number that decides whether the mailbox keeps working belongs next to the
// sentence explaining it.
const (
	// The stricter limit, from the build plan and the contract's own
	// description of the endpoint.
	//
	// Exported because it is enforced twice and the two halves have to agree:
	// internal/server builds the token bucket in front of the route from these,
	// and the database floor below uses them for its window. Two statements of
	// "three in ten minutes" is one too many.
	RateLimit       = 3
	RateLimitWindow = 10 * time.Minute

	// The hourly ceiling on messages actually handed to the relay.
	//
	// The acceptance criterion of this phase is "the rate limit bites before
	// OVH's quota does", and a per-IP limit cannot deliver that: a hundred
	// addresses each submitting their lawful three would be three hundred mails
	// in ten minutes against a quota of about two hundred an hour. So there is a
	// second limit that is not per anything.
	//
	// 150 of OVH MX Plan's ~200 leaves room for whatever else the domain sends.
	// Reaching it is not an outage: the row is stored, the visitor is told the
	// message was accepted — which is true — and the dispatcher carries it out
	// in the next hour's budget.
	sendBudgetPerHour = 150

	// The dwell floor, from the contract's `dwellMs: minimum 3000`.
	minDwell = 3000

	// The field bounds, from components/schemas/ContactRequest. maxLength is
	// also in the schema (00006_contact.sql), minLength is not: the migration
	// says in as many words that a minimum is a UX rule and belongs here.
	minName    = 2
	maxName    = 80
	maxEmail   = 254
	minMessage = 20
	maxMessage = 4000

	// How far out a client clock may be before its timestamp is refused.
	//
	// Wide on purpose. `ts` exists to make a double click idempotent, not to
	// stop spam — anyone wanting a second row need only change a word of the
	// message — so a tight window would buy nothing and would cost every
	// visitor whose laptop clock has drifted. What is left is a bound loose
	// enough to be nobody's problem and tight enough to keep nonsense out of a
	// timestamptz column.
	maxClockSkew = 48 * time.Hour
)

// The dispatcher's numbers.
const (
	// The tick. A message the handler could not send is one a visitor is
	// waiting on an answer to, so the queue is looked at often; a run that finds
	// nothing costs one indexed lookup against a partial index that is empty
	// when the relay is healthy.
	dispatchEvery = time.Minute

	// The ceiling on one run, and the batch it may take. The batch is small
	// because each message is a separate SMTP conversation and a run must finish
	// well inside the tick — otherwise two runs overlap and send the same row
	// twice.
	dispatchTimeout = 45 * time.Second
	dispatchBatch   = 10

	// Attempts before a message stops being the dispatcher's problem and
	// becomes a person's. With the schedule in contact.sql the fifth attempt
	// falls about half an hour after the message arrived, which is long enough
	// for an ordinary relay wobble and short enough that a real outage is
	// noticed rather than retried into.
	maxDeliveryAttempts = 5
	deliveryBackoffBase = 2 * time.Minute

	// Consecutive failed runs before the dispatcher stops reaching for the
	// relay, and how long it waits.
	//
	// Shorter than the thirty minutes internal/contributions uses, and the
	// asymmetry is deliberate: a stale calendar is a cosmetic problem and an
	// undelivered message is somebody who wrote and got no answer. Ten minutes
	// still turns a day-long outage into 144 connection attempts instead of
	// 1440, which is the point — each of those attempts carries a credential.
	breakerThreshold = 3
	breakerCooldown  = 10 * time.Minute
)
