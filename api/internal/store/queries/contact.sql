-- The queries behind POST /api/contact and the dispatcher that drains what it
-- could not deliver.
--
-- contact_messages is the only table in this schema holding personal data and
-- the only one the public API never reads. Nothing here is a SELECT of a
-- message: the handler writes one and reads back an id, the rate-limit floor
-- counts without looking, and the dispatcher reads the rows it has to send. No
-- query in this file can be reached by a GET.
--
-- Two things are never stored as themselves. ip_hash is a keyed digest of the
-- client address, peppered in Go (00006_contact.sql says why a bare SHA-256 of
-- an IPv4 is worthless), and message_hash stands in for four kilobytes of text
-- in the idempotency key.
--
-- Every timestamp comparison here is against now(), which in Postgres is the
-- transaction's clock. That is deliberate and it is the same trap ADR 0019
-- documents for the ops roll-up: two now() values inside one transaction are
-- equal, so a window computed here is a window as of the statement, not as of
-- some later moment in the same transaction.

-- InsertContactMessage stores one submission and hands back its id.
--
-- ON CONFLICT DO NOTHING against the idempotency index rather than a SELECT
-- followed by an INSERT. The double click this exists to absorb arrives as two
-- requests at once, and select-then-insert has a window between the two
-- statements in which both find nothing and both insert — one of them then
-- fails on the unique index and the visitor gets a 500 for pressing a button
-- twice. Here the second one simply returns no row, and the caller reads the
-- existing id with the query below.
--
-- The conflict target repeats the index expression verbatim, including
-- lower(email): Postgres matches an expression index by its expression, and
-- `(client_ts, email, message_hash)` would compile and then never match
-- anything, turning every resend into a duplicate row.
--
-- name: InsertContactMessage :one
INSERT INTO contact_messages (
       id, client_ts, name, email, message, message_hash, ip_hash, dwell_ms,
       delivery_status, delivery_attempts
) VALUES (
       sqlc.arg(id),
       sqlc.arg(client_ts),
       sqlc.arg(name),
       sqlc.arg(email),
       sqlc.arg(message),
       sqlc.arg(message_hash),
       sqlc.arg(ip_hash),
       sqlc.arg(dwell_ms),
       'queued',
       0
)
    ON CONFLICT (client_ts, lower(email), message_hash) DO NOTHING
 RETURNING id;

-- FindContactMessageID answers the second half of the idempotent insert: the
-- row was already there, so the visitor gets the receipt they were given the
-- first time rather than a new one for a message that was only sent once.
--
-- The query is the one 00006_contact.sql wrote into its COMMENT ON INDEX, and it
-- is written the same way here so that the index is used rather than merely
-- present.
--
-- name: FindContactMessageID :one
SELECT id
  FROM contact_messages
 WHERE client_ts = sqlc.arg(client_ts)
   AND lower(email) = lower(sqlc.arg(email))
   AND message_hash = sqlc.arg(message_hash);

-- CountRecentContactMessages is the rate-limit floor: how many messages this
-- address has already left inside the window, and when the oldest of them
-- arrived.
--
-- The second value is what makes Retry-After a measurement. A fixed "try again
-- in ten minutes" is wrong for everyone who submitted nine minutes ago, and a
-- 429 a client cannot see coming is a 429 it retries immediately.
--
-- The window is a parameter rather than an interval literal because the
-- constant lives in Go, next to the token bucket that has to agree with it. Two
-- places stating ten minutes is one place too many.
--
-- min(received_at) is nullable in SQL — an empty window has no oldest row — and
-- sqlc types it *pgtype.Timestamptz accordingly. The caller reads it only when
-- the count is above zero.
--
-- name: CountRecentContactMessages :one
SELECT count(*)              AS recent,
       min(received_at)::timestamptz AS oldest
  FROM contact_messages
 WHERE ip_hash = sqlc.arg(ip_hash)
   AND received_at > now() - sqlc.arg(window_size)::interval;

-- ListDeliverableContactMessages is the dispatcher's queue.
--
-- Ordered oldest first, so a message that has been waiting longest is tried
-- first and a burst cannot starve the one submission that came before it.
--
-- The eligibility rule is derived from delivery_attempts and received_at rather
-- than stored in a next_attempt_at column. That keeps the backoff recomputable
-- from data that already exists — a column would be a second statement of the
-- same fact, and the two would disagree the first time a row was touched by
-- hand.
--
-- The schedule is received_at + base × (2^attempts − 1), which is the sum of a
-- doubling backoff measured from one fixed origin: 0, 2, 6, 14, 30 minutes at a
-- two-minute base. The −1 is load-bearing at both ends. Without it a row with
-- zero attempts waits a full base before anyone looks at it — and zero attempts
-- is precisely the row the handler never tried, because the hourly send budget
-- was spent or the breaker was open, so it is the one row that should go out at
-- the next tick rather than the tick after. At the other end the gaps between
-- attempts stay a doubling rather than becoming a constant.
--
-- Every column the mail body is made of comes back, dwell_ms included. The
-- rendered message is stored nowhere — a second copy of the text would be a
-- second thing to go stale — so the dispatcher rebuilds it from the row, and it
-- has to be able to build the same one the handler did.
--
-- LIMIT because a relay has a quota and a run has a budget. What does not fit
-- in this run is still queued and still oldest, so the next tick takes it.
--
-- name: ListDeliverableContactMessages :many
SELECT id, client_ts, name, email, message, dwell_ms, delivery_attempts
  FROM contact_messages
 WHERE delivery_status = 'queued'
   AND delivery_attempts < sqlc.arg(max_attempts)::int
   AND received_at + (sqlc.arg(backoff_base)::interval * (2 ^ delivery_attempts - 1))
       <= now()
 ORDER BY received_at
 LIMIT sqlc.arg(batch_size)::int;

-- MarkContactMessageSent closes a row out. delivered_at and the status are the
-- same fact stated twice and the schema refuses to let them disagree
-- (contact_messages_delivered_iff_sent_ck), so they are written together and
-- never apart.
--
-- last_error is cleared: a message that has been delivered has no error, and
-- leaving the last transient failure behind would put a red herring in front of
-- whoever reads this row next.
--
-- name: MarkContactMessageSent :exec
UPDATE contact_messages
   SET delivery_status   = 'sent',
       delivered_at      = now(),
       delivery_attempts = delivery_attempts + 1,
       last_error        = NULL,
       mail_message_id   = sqlc.arg(mail_message_id)
 WHERE id = sqlc.arg(id);

-- MarkContactMessageFailed records an attempt that did not land.
--
-- The status is a parameter, not a literal, because this one statement serves
-- both endings: 'queued' means the dispatcher will come back, 'failed' means it
-- has given up and a human has to read the row. Splitting it into two queries
-- would let the attempt counter and last_error drift apart between them.
--
-- delivered_at is left alone. It is NULL on every path that reaches here, and
-- the schema check would reject anything else.
--
-- name: MarkContactMessageFailed :exec
UPDATE contact_messages
   SET delivery_status   = sqlc.arg(delivery_status),
       delivery_attempts = delivery_attempts + 1,
       last_error        = sqlc.arg(last_error)
 WHERE id = sqlc.arg(id);
