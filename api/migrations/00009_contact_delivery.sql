-- Two indexes for the two queries C6 puts on contact_messages. No new column
-- and no new constraint: B2 designed the delivery state (00006_contact.sql) and
-- this migration only makes the reads that drive it affordable.
--
-- 00006 said the received_at index would arrive "with the job, not before it".
-- Two jobs have now arrived. The first is the rate-limit floor, which is the
-- reason this file is not simply deferred like the ops_checks index in C4:
-- unlike that one, this query runs in the request path of the only write
-- endpoint on the site, and the size of the table it scans is decided by
-- whoever is submitting forms. A sequential scan that an attacker can lengthen
-- is a different proposition from one that grows with our own measurements, and
-- the cheapest moment to say so is before the endpoint is public.

-- +goose Up

-- The rate-limit floor. The in-memory token bucket forgets on restart and does
-- not know what a second instance has seen; this is the half of the 3-per-IP-
-- per-10-minutes rule that survives both. min(received_at) comes back with the
-- count so that Retry-After is measured rather than guessed.
--
--   SELECT count(*), min(received_at) FROM contact_messages
--    WHERE ip_hash = $1 AND received_at > now() - interval '10 minutes'
--
-- Leading on ip_hash because that is the equality; received_at second so the
-- window is a range scan inside it rather than a filter over the whole bucket.
-- DESC costs nothing here and serves a later "the last message from this
-- address" lookup from the runbook.
CREATE INDEX contact_messages_ip_window_idx
    ON contact_messages (ip_hash, received_at DESC);

COMMENT ON INDEX contact_messages_ip_window_idx IS
    'C6 rate-limit floor: count and oldest submission from one address in the last ten minutes';

-- The dispatcher's queue. Partial, because everything it never wants is the
-- overwhelming majority of the table: a healthy relay leaves rows in 'sent' and
-- the index then holds nothing at all.
--
--   SELECT id, ... FROM contact_messages
--    WHERE delivery_status = 'queued' AND delivery_attempts < $1
--    ORDER BY received_at
--
-- delivery_attempts is deliberately not in the key. It is compared, not sorted
-- on, and a partial index over a handful of rows has nothing to gain from a
-- second column while every UPDATE of the attempt counter would have to
-- maintain it.
CREATE INDEX contact_messages_queued_idx
    ON contact_messages (received_at)
    WHERE delivery_status = 'queued';

COMMENT ON INDEX contact_messages_queued_idx IS
    'C6 dispatcher: the messages the relay has not taken yet, oldest first';

-- +goose Down

DROP INDEX contact_messages_queued_idx;
DROP INDEX contact_messages_ip_window_idx;
