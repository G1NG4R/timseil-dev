//go:build db

// The contact queries against a real server.
//
// Three of them cannot be proved anywhere else, and they are the reason this
// file is long.
//
// The idempotent insert is a race, and a stub cannot have one. Two clicks arrive
// as two requests at the same moment; the query has to let exactly one of them
// create a row and hand the other the same receipt. Postgres is the only thing
// that decides that, so Postgres is what the test asks.
//
// The rate-limit floor is arithmetic over now(), and now() in Postgres is the
// transaction's clock. A Go test with an injected clock would prove a different
// function than the one that runs.
//
// The dispatcher's backoff is written into a WHERE clause rather than into a
// column, so "is this row due yet" is a question only the database can answer.
//
// Run with: make check-db
package store_test

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/G1NG4R/timseil-dev/api/internal/fixtures"
	"github.com/G1NG4R/timseil-dev/api/internal/store"
)

// The window and the schedule under test. Deliberately not the production
// constants: those live in internal/contact, and a store test that imported
// them would go red the day a policy changed without a single query being
// wrong.
const (
	testWindow      = 10 * time.Minute
	testBackoffBase = 2 * time.Minute
	testMaxAttempts = 5
)

func interval(d time.Duration) pgtype.Interval {
	return pgtype.Interval{Microseconds: d.Microseconds(), Valid: true}
}

func at(ts time.Time) pgtype.Timestamptz {
	return pgtype.Timestamptz{Time: ts, Valid: true}
}

// submission is one row's worth of input. hash stands in for the SHA-256 of the
// message and pepper stands in for the peppered digest of the address; both are
// 32 bytes because the schema insists, and neither is computed here — how they
// are derived is internal/contact's business and is tested there.
type submission struct {
	id       string
	clientTs time.Time
	email    string
	hash     byte
	ip       byte
}

func (s submission) params() store.InsertContactMessageParams {
	return store.InsertContactMessageParams{
		ID:          s.id,
		ClientTs:    at(s.clientTs),
		Name:        "Anna Keller",
		Email:       s.email,
		Message:     "Hallo, ich hätte eine Frage zu einem der Systeme.",
		MessageHash: bytes32(s.hash),
		IpHash:      bytes32(s.ip),
		DwellMs:     4200,
	}
}

func bytes32(fill byte) []byte {
	out := make([]byte, 32)
	for i := range out {
		out[i] = fill
	}
	return out
}

func aSubmission() submission {
	return submission{
		id:       "msg_0000000000000001",
		clientTs: time.Date(2026, 8, 18, 14, 22, 7, 0, time.UTC),
		email:    "anna@example.org",
		hash:     0x01,
		ip:       0x0a,
	}
}

func insert(t *testing.T, q *store.Queries, s submission) (string, error) {
	t.Helper()
	return q.InsertContactMessage(context.Background(), s.params())
}

func mustInsert(t *testing.T, q *store.Queries, s submission) string {
	t.Helper()

	id, err := insert(t, q, s)
	if err != nil {
		t.Fatalf("InsertContactMessage: %v", err)
	}
	return id
}

// backdate moves a row's received_at into the past. There is no query for it and
// there should not be: nothing in production rewrites when a message arrived.
// The window and the backoff are both measured from that column, so a test of
// either has to be able to place a row in time.
func backdate(t *testing.T, pool *pgxpool.Pool, id string, ago time.Duration) {
	t.Helper()

	_, err := pool.Exec(context.Background(),
		`UPDATE contact_messages SET received_at = now() - $2::interval WHERE id = $1`,
		id, interval(ago))
	if err != nil {
		t.Fatalf("backdating %s: %v", id, err)
	}
}

func rowCount(t *testing.T, pool *pgxpool.Pool) int {
	t.Helper()

	var n int
	if err := pool.QueryRow(context.Background(),
		`SELECT count(*) FROM contact_messages`).Scan(&n); err != nil {
		t.Fatalf("counting: %v", err)
	}
	return n
}

func status(t *testing.T, pool *pgxpool.Pool, id string) (state string, attempts int32,
	delivered pgtype.Timestamptz, lastErr *string, messageID *string,
) {
	t.Helper()

	err := pool.QueryRow(context.Background(),
		`SELECT delivery_status, delivery_attempts, delivered_at, last_error, mail_message_id
		   FROM contact_messages WHERE id = $1`, id).
		Scan(&state, &attempts, &delivered, &lastErr, &messageID)
	if err != nil {
		t.Fatalf("reading %s: %v", id, err)
	}
	return
}

// ----------------------------------------------------------------- idempotency

func TestASubmissionComesBackWithItsReceipt(t *testing.T) {
	q, pool := loadedPool(t, fixtures.Empty)

	s := aSubmission()
	if got := mustInsert(t, q, s); got != s.id {
		t.Errorf("the insert returned %q, want %q", got, s.id)
	}
	if n := rowCount(t, pool); n != 1 {
		t.Errorf("%d rows, want 1", n)
	}
}

// The double click, as the schema sees it. The second insert must not create a
// row and must not error: it returns nothing, and the caller reads the receipt
// the first one was given.
func TestTheSameSubmissionTwiceLeavesOneRow(t *testing.T) {
	q, pool := loadedPool(t, fixtures.Empty)

	first := aSubmission()
	mustInsert(t, q, first)

	second := first
	second.id = "msg_0000000000000002" // a fresh receipt the visitor must not get

	if _, err := insert(t, q, second); !errors.Is(err, pgx.ErrNoRows) {
		t.Fatalf("the second insert returned %v, want pgx.ErrNoRows", err)
	}
	if n := rowCount(t, pool); n != 1 {
		t.Fatalf("%d rows after a double click, want 1", n)
	}

	found, err := q.FindContactMessageID(context.Background(), store.FindContactMessageIDParams{
		ClientTs:    at(first.clientTs),
		Email:       first.email,
		MessageHash: bytes32(first.hash),
	})
	if err != nil {
		t.Fatalf("FindContactMessageID: %v", err)
	}
	if found != first.id {
		t.Errorf("the lookup returned %q, want the first receipt %q", found, first.id)
	}
}

// The index is on lower(email), so the conflict target has to be too. Written as
// (client_ts, email, message_hash) the statement compiles and then matches
// nothing, and every resend becomes a duplicate row — a failure with no symptom
// until somebody reads the table.
func TestTheReceiptIsFoundWhateverTheAddressCase(t *testing.T) {
	q, pool := loadedPool(t, fixtures.Empty)

	first := aSubmission()
	mustInsert(t, q, first)

	shouting := first
	shouting.id = "msg_0000000000000003"
	shouting.email = "Anna@Example.ORG"

	if _, err := insert(t, q, shouting); !errors.Is(err, pgx.ErrNoRows) {
		t.Fatalf("a differently cased address inserted a second row: %v", err)
	}
	if n := rowCount(t, pool); n != 1 {
		t.Fatalf("%d rows, want 1", n)
	}

	found, err := q.FindContactMessageID(context.Background(), store.FindContactMessageIDParams{
		ClientTs:    at(first.clientTs),
		Email:       shouting.email,
		MessageHash: bytes32(first.hash),
	})
	if err != nil {
		t.Fatalf("FindContactMessageID: %v", err)
	}
	if found != first.id {
		t.Errorf("the lookup returned %q, want %q", found, first.id)
	}
}

// Idempotency must not swallow a real second message. Somebody who writes again
// with something else to say is not a double click.
func TestADifferentMessageIsANewRow(t *testing.T) {
	q, pool := loadedPool(t, fixtures.Empty)

	first := aSubmission()
	mustInsert(t, q, first)

	again := first
	again.id = "msg_0000000000000004"
	again.hash = 0x02

	if got := mustInsert(t, q, again); got != again.id {
		t.Errorf("the second message returned %q, want %q", got, again.id)
	}
	if n := rowCount(t, pool); n != 2 {
		t.Errorf("%d rows, want 2", n)
	}
}

// The race the ON CONFLICT exists for. Select-then-insert has a window in which
// both requests find nothing and both insert; one then dies on the unique index
// and the visitor gets a 500 for pressing a button twice.
func TestTwoSimultaneousSubmissionsProduceOneRow(t *testing.T) {
	q, pool := loadedPool(t, fixtures.Empty)

	const clicks = 8

	var (
		wg      sync.WaitGroup
		mu      sync.Mutex
		created []string
		failed  []error
	)

	start := make(chan struct{})
	for i := range clicks {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			<-start

			s := aSubmission()
			s.id = "msg_race" + string(rune('a'+i))

			id, err := q.InsertContactMessage(context.Background(), s.params())
			mu.Lock()
			defer mu.Unlock()
			switch {
			case err == nil:
				created = append(created, id)
			case errors.Is(err, pgx.ErrNoRows):
				// The expected loser: no row, no error worth reporting.
			default:
				failed = append(failed, err)
			}
		}(i)
	}
	close(start)
	wg.Wait()

	if len(failed) > 0 {
		t.Errorf("%d of %d concurrent submissions errored, first: %v", len(failed), clicks, failed[0])
	}
	if len(created) != 1 {
		t.Errorf("%d of %d submissions created a row, want exactly 1", len(created), clicks)
	}
	if n := rowCount(t, pool); n != 1 {
		t.Errorf("%d rows, want 1", n)
	}
}

// ------------------------------------------------------------- the limit floor

func TestTheFloorCountsOnlyInsideTheWindow(t *testing.T) {
	q, pool := loadedPool(t, fixtures.Empty)

	inside := aSubmission()
	mustInsert(t, q, inside)

	outside := aSubmission()
	outside.id = "msg_0000000000000005"
	outside.hash = 0x02
	mustInsert(t, q, outside)
	backdate(t, pool, outside.id, testWindow+time.Minute)

	row, err := q.CountRecentContactMessages(context.Background(),
		store.CountRecentContactMessagesParams{
			IpHash:     bytes32(inside.ip),
			WindowSize: interval(testWindow),
		})
	if err != nil {
		t.Fatalf("CountRecentContactMessages: %v", err)
	}
	if row.Recent != 1 {
		t.Errorf("the window holds %d messages, want 1 — an expired one was counted", row.Recent)
	}
}

func TestTheFloorCountsPerAddress(t *testing.T) {
	// One noisy address must not throttle everybody else. The bucket is the
	// hash, so a different hash is a different visitor.
	q, _ := loadedPool(t, fixtures.Empty)

	mine := aSubmission()
	mustInsert(t, q, mine)

	theirs := aSubmission()
	theirs.id = "msg_0000000000000006"
	theirs.hash = 0x02
	theirs.ip = 0x0b
	mustInsert(t, q, theirs)

	row, err := q.CountRecentContactMessages(context.Background(),
		store.CountRecentContactMessagesParams{
			IpHash:     bytes32(mine.ip),
			WindowSize: interval(testWindow),
		})
	if err != nil {
		t.Fatalf("CountRecentContactMessages: %v", err)
	}
	if row.Recent != 1 {
		t.Errorf("the count is %d, want 1 — somebody else's message was counted", row.Recent)
	}
}

// Retry-After is measured from the oldest message still inside the window. A
// fixed "ten minutes" would be wrong for everyone who submitted nine minutes
// ago, and a 429 a client cannot see coming is a 429 it retries immediately.
func TestTheFloorReportsWhenTheWindowFrees(t *testing.T) {
	q, pool := loadedPool(t, fixtures.Empty)

	old := aSubmission()
	mustInsert(t, q, old)
	backdate(t, pool, old.id, 9*time.Minute)

	recent := aSubmission()
	recent.id = "msg_0000000000000007"
	recent.hash = 0x02
	mustInsert(t, q, recent)

	row, err := q.CountRecentContactMessages(context.Background(),
		store.CountRecentContactMessagesParams{
			IpHash:     bytes32(old.ip),
			WindowSize: interval(testWindow),
		})
	if err != nil {
		t.Fatalf("CountRecentContactMessages: %v", err)
	}
	if row.Recent != 2 {
		t.Fatalf("the window holds %d messages, want 2", row.Recent)
	}
	if !row.Oldest.Valid {
		t.Fatal("the oldest timestamp is null although the window is not empty")
	}

	frees := time.Since(row.Oldest.Time)
	if frees < 8*time.Minute || frees > 10*time.Minute {
		t.Errorf("the oldest message is %s old, want about nine minutes", frees)
	}
}

func TestAnEmptyWindowHasNoOldest(t *testing.T) {
	// The nullable half of the row. A caller that read Oldest without checking
	// Valid would compute a Retry-After from the zero time and answer with a
	// number of seconds since 1970.
	q, _ := loadedPool(t, fixtures.Empty)

	row, err := q.CountRecentContactMessages(context.Background(),
		store.CountRecentContactMessagesParams{
			IpHash:     bytes32(0x0a),
			WindowSize: interval(testWindow),
		})
	if err != nil {
		t.Fatalf("CountRecentContactMessages: %v", err)
	}
	if row.Recent != 0 {
		t.Errorf("the count is %d, want 0", row.Recent)
	}
	if row.Oldest.Valid {
		t.Errorf("the oldest timestamp is %s, want null", row.Oldest.Time)
	}
}

// ---------------------------------------------------------------- the queue

func deliverable(t *testing.T, q *store.Queries) []store.ListDeliverableContactMessagesRow {
	t.Helper()

	rows, err := q.ListDeliverableContactMessages(context.Background(),
		store.ListDeliverableContactMessagesParams{
			MaxAttempts: testMaxAttempts,
			BackoffBase: interval(testBackoffBase),
			BatchSize:   10,
		})
	if err != nil {
		t.Fatalf("ListDeliverableContactMessages: %v", err)
	}
	return rows
}

func TestAFreshSubmissionIsImmediatelyDeliverable(t *testing.T) {
	// Zero attempts means the handler never tried: the hourly send budget was
	// spent, or the breaker was open before the row was written. That row has
	// to go out at the next tick rather than the tick after, which is what the
	// −1 in base × (2^attempts − 1) buys.
	q, _ := loadedPool(t, fixtures.Empty)
	mustInsert(t, q, aSubmission())

	if rows := deliverable(t, q); len(rows) != 1 {
		t.Fatalf("%d deliverable rows, want 1", len(rows))
	}
}

func TestADeliveredMessageLeavesTheQueue(t *testing.T) {
	q, pool := loadedPool(t, fixtures.Empty)
	s := aSubmission()
	mustInsert(t, q, s)

	messageID := s.id + "@timseil.dev"
	err := q.MarkContactMessageSent(context.Background(), store.MarkContactMessageSentParams{
		ID:            s.id,
		MailMessageID: &messageID,
	})
	if err != nil {
		t.Fatalf("MarkContactMessageSent: %v", err)
	}

	state, attempts, delivered, lastErr, stored := status(t, pool, s.id)
	if state != "sent" {
		t.Errorf("the state is %q, want sent", state)
	}
	if !delivered.Valid {
		t.Error("delivered_at is null on a sent message — the schema check should have refused this")
	}
	if attempts != 1 {
		t.Errorf("attempts is %d, want 1", attempts)
	}
	if lastErr != nil {
		t.Errorf("last_error survived delivery: %q", *lastErr)
	}
	if stored == nil || *stored != messageID {
		t.Errorf("mail_message_id is %v, want %q", stored, messageID)
	}
	if rows := deliverable(t, q); len(rows) != 0 {
		t.Errorf("%d deliverable rows after delivery, want 0", len(rows))
	}
}

func TestAFailedAttemptStaysQueuedAndBacksOff(t *testing.T) {
	q, pool := loadedPool(t, fixtures.Empty)
	s := aSubmission()
	mustInsert(t, q, s)

	reason := "451 the relay was busy"
	err := q.MarkContactMessageFailed(context.Background(), store.MarkContactMessageFailedParams{
		ID:             s.id,
		DeliveryStatus: "queued",
		LastError:      &reason,
	})
	if err != nil {
		t.Fatalf("MarkContactMessageFailed: %v", err)
	}

	state, attempts, delivered, lastErr, _ := status(t, pool, s.id)
	if state != "queued" || attempts != 1 {
		t.Errorf("state = %q, attempts = %d, want queued and 1", state, attempts)
	}
	if delivered.Valid {
		t.Error("delivered_at was set on a failed attempt")
	}
	if lastErr == nil || *lastErr != reason {
		t.Errorf("last_error is %v, want %q", lastErr, reason)
	}

	// One attempt means the next one is due base × (2¹ − 1) = two minutes after
	// the message arrived. Right now it is not.
	if rows := deliverable(t, q); len(rows) != 0 {
		t.Errorf("%d deliverable rows immediately after a failure, want 0 — the backoff did nothing",
			len(rows))
	}

	backdate(t, pool, s.id, 3*time.Minute)
	if rows := deliverable(t, q); len(rows) != 1 {
		t.Errorf("%d deliverable rows once the backoff elapsed, want 1", len(rows))
	}
}

func TestTheBackoffGrowsWithTheAttempts(t *testing.T) {
	q, pool := loadedPool(t, fixtures.Empty)
	s := aSubmission()
	mustInsert(t, q, s)

	// Three attempts: due base × (2³ − 1) = fourteen minutes after arrival.
	for range 3 {
		reason := "451 still busy"
		if err := q.MarkContactMessageFailed(context.Background(),
			store.MarkContactMessageFailedParams{
				ID: s.id, DeliveryStatus: "queued", LastError: &reason,
			}); err != nil {
			t.Fatalf("MarkContactMessageFailed: %v", err)
		}
	}

	backdate(t, pool, s.id, 13*time.Minute)
	if rows := deliverable(t, q); len(rows) != 0 {
		t.Errorf("%d rows due after thirteen minutes and three attempts, want 0", len(rows))
	}

	backdate(t, pool, s.id, 15*time.Minute)
	if rows := deliverable(t, q); len(rows) != 1 {
		t.Errorf("%d rows due after fifteen minutes and three attempts, want 1", len(rows))
	}
}

func TestAGivenUpMessageLeavesTheQueue(t *testing.T) {
	// 'failed' is where a message stops being the dispatcher's problem and
	// becomes a person's. The row keeps the address, so the answer can still be
	// written by hand — nothing is lost, it is only no longer automatic.
	q, pool := loadedPool(t, fixtures.Empty)
	s := aSubmission()
	mustInsert(t, q, s)

	reason := "550 mailbox unavailable"
	if err := q.MarkContactMessageFailed(context.Background(),
		store.MarkContactMessageFailedParams{
			ID: s.id, DeliveryStatus: "failed", LastError: &reason,
		}); err != nil {
		t.Fatalf("MarkContactMessageFailed: %v", err)
	}

	backdate(t, pool, s.id, time.Hour)
	if rows := deliverable(t, q); len(rows) != 0 {
		t.Errorf("%d deliverable rows, want 0 — a given-up message came back", len(rows))
	}
}

func TestTheAttemptCeilingEndsTheQueue(t *testing.T) {
	q, pool := loadedPool(t, fixtures.Empty)
	s := aSubmission()
	mustInsert(t, q, s)

	for range testMaxAttempts {
		reason := "451 busy"
		if err := q.MarkContactMessageFailed(context.Background(),
			store.MarkContactMessageFailedParams{
				ID: s.id, DeliveryStatus: "queued", LastError: &reason,
			}); err != nil {
			t.Fatalf("MarkContactMessageFailed: %v", err)
		}
	}

	backdate(t, pool, s.id, 24*time.Hour)
	if rows := deliverable(t, q); len(rows) != 0 {
		t.Errorf("%d rows at the attempt ceiling, want 0 — a message would be retried forever",
			len(rows))
	}
}

func TestTheQueueIsOldestFirst(t *testing.T) {
	// A burst must not starve the one submission that came before it.
	q, pool := loadedPool(t, fixtures.Empty)

	first := aSubmission()
	mustInsert(t, q, first)
	backdate(t, pool, first.id, time.Hour)

	second := aSubmission()
	second.id = "msg_0000000000000008"
	second.hash = 0x02
	mustInsert(t, q, second)

	rows := deliverable(t, q)
	if len(rows) != 2 {
		t.Fatalf("%d deliverable rows, want 2", len(rows))
	}
	if rows[0].ID != first.id {
		t.Errorf("the queue starts with %q, want the older %q", rows[0].ID, first.id)
	}
}

// -------------------------------------------------------------- the indexes

// The two indexes 00009 adds, as the planner sees them.
//
// The rate-limit query is the one that matters: it runs in the request path of
// the only write endpoint on the site, and the size of the table it reads is
// decided by whoever is submitting forms. A sequential scan there is a scan an
// attacker can lengthen.
//
// The rows are inserted rather than assumed, because Postgres will happily scan
// sequentially through a table it can hold in one page — proving the index is
// used means giving the planner a reason to want it.
func TestTheRateLimitQueryUsesItsIndex(t *testing.T) {
	q, pool := loadedPool(t, fixtures.Empty)

	for i := range 2000 {
		s := aSubmission()
		s.id = "msg_bulk" + string(rune('a'+i%26)) + string(rune('a'+(i/26)%26)) +
			string(rune('a'+(i/676)%26))
		s.hash = byte(i % 251)
		s.ip = byte(i % 97)
		s.clientTs = s.clientTs.Add(time.Duration(i) * time.Second)
		if _, err := insert(t, q, s); err != nil && !errors.Is(err, pgx.ErrNoRows) {
			t.Fatalf("bulk insert %d: %v", i, err)
		}
	}
	if _, err := pool.Exec(context.Background(), `ANALYZE contact_messages`); err != nil {
		t.Fatalf("ANALYZE: %v", err)
	}

	plan := explain(t, pool,
		`SELECT count(*), min(received_at) FROM contact_messages
		  WHERE ip_hash = $1 AND received_at > now() - $2::interval`,
		bytes32(0x0a), interval(testWindow))

	if !strings.Contains(plan, "contact_messages_ip_window_idx") {
		t.Errorf("the rate-limit query does not use its index:\n%s", plan)
	}
	if strings.Contains(plan, "Seq Scan") {
		t.Errorf("the rate-limit query falls back to a sequential scan:\n%s", plan)
	}
}

func explain(t *testing.T, pool *pgxpool.Pool, query string, args ...any) string {
	t.Helper()

	rows, err := pool.Query(context.Background(), "EXPLAIN "+query, args...)
	if err != nil {
		t.Fatalf("EXPLAIN: %v", err)
	}
	defer rows.Close()

	var plan strings.Builder
	for rows.Next() {
		var line string
		if err := rows.Scan(&line); err != nil {
			t.Fatalf("reading the plan: %v", err)
		}
		plan.WriteString(line)
		plan.WriteString("\n")
	}
	return plan.String()
}
