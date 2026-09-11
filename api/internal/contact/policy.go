// Package contact serves POST /api/contact, drains what it could not deliver,
// and clears out what it no longer needs.
//
// It is the only unauthenticated write path on the site and its only conversion
// point, so it carries more machinery than any read endpoint: a honeypot, a
// dwell time, two rate limits, an origin check, an idempotency key, a hashed
// address, an inline send, a dispatcher behind it and a purge behind that.
//
// It is also the only package here that stores personal data, which is why the
// purge is part of it rather than an operational chore somewhere else: the
// retention period and the sentence justifying it belong next to the code that
// wrote the row.
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
	//
	// AND SINCE H12b THERE IS A THIRD READER, outside this module and outside
	// this language: /privacy tells a visitor their address is kept for ten
	// minutes. The mirror is RATE_LIMIT_MINUTES in web/lib/legal/retention.ts,
	// and web/lib/legal/retention.test.ts reads THIS FILE and fails if the two
	// stop agreeing — including if this line stops being written as
	// `N * time.Minute`. Change the number here and the test names the sentence
	// that went stale with it.
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

// The purge's numbers.
//
// H12 BROUGHT THIS LOOP FORWARD OUT OF L7, and the reason is a sentence in the
// build plan rather than anything technical: the privacy page "muss mit dem
// übereinstimmen, was der Code tut. Nicht umgekehrt." A page that names no
// retention period is thin under Art. 5(1)(e); a page that names one no loop
// keeps is what the handbook calls an untruth with legal consequences. So the
// loop is written first and the page cites it, not the other way round.
const (
	// How long a settled message stays in the table.
	//
	// THIRTY DAYS IS DERIVED, NOT CHOSEN. The row has three jobs and none of
	// them outlives a month. Delivery is hours: five attempts on the schedule
	// in contact.sql are spent about half an hour after the message arrives.
	// Idempotency is client_ts + email + message_hash, and a resend of the same
	// text a month later is a new message by any reading. The rate-limit floor
	// looks ten minutes back. After that the row is a second copy of something
	// already sitting in a mailbox, and a second copy nobody needs is exactly
	// what a retention rule is for.
	//
	// Thirty days rather than the shortest defensible number because the row is
	// also the only record of what the relay did with a message — last_error,
	// delivery_attempts, mail_message_id — and that is what a person reads when
	// somebody writes "I sent you something and heard nothing". A window
	// shorter than a holiday would delete the evidence before the question
	// arrives.
	//
	// THE PAGE ADR 0075 WROTE THIS FOR NOW EXISTS, AND IT QUOTES THIS LINE.
	// /privacy promises deletion after thirty days; the mirror is
	// RETENTION_DAYS in web/lib/legal/retention.ts, held against this file by
	// web/lib/legal/retention.test.ts. That test is the bracket the ADR said was
	// missing under "Was das kostet", and it fails on a rewording as well as on
	// a new value — so `720 * time.Hour` is a red test and not a silent lie on a
	// legal page.
	retentionWindow = 30 * 24 * time.Hour

	// The tick, and it is what decides how far PAST the window a row can live.
	//
	// The page says thirty days without an asterisk, so the overshoot has to be
	// small enough that the sentence stays true at any reading: at one hour, a
	// row is gone within 30 days and one hour of the deadline. Cheaper than the
	// dispatcher's minute by a factor of sixty, and against an index that has
	// nothing to return on all but one run in seven hundred.
	purgeEvery = time.Hour

	// The ceiling on one run. One indexed DELETE over a range, so this is a
	// bound on a database that has stopped answering rather than on the work.
	purgeTimeout = 30 * time.Second
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

	// The ceiling on writing down what happened, detached from whatever
	// deadline the attempt itself ran under.
	//
	// Short, because it is one indexed UPDATE by primary key, and separate
	// because the two failures are different: a send that ran out of time still
	// has to record that it tried, or the attempt counter never advances and
	// the message is retried forever with nothing to say why.
	bookkeepingTimeout = 5 * time.Second
)
