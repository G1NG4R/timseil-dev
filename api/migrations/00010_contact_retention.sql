-- The index 00006 deferred, and the job it was waiting for.
--
-- 00006_contact.sql closed with "No index on received_at. The query that wants
-- it is the retention purge from L7 (DELETE ... WHERE received_at < now() -
-- interval '...'), and that job does not exist yet. It arrives with the job,
-- not before it." H12 brings the job forward out of L7, so the index arrives
-- with it.
--
-- WHY THE JOB MOVED. The privacy page is written in H12, and the build plan
-- gives that phase one sentence: it must agree with what the code does, not the
-- other way round. A page that names no retention period is weak under Art.
-- 5(1)(e); a page that names one no loop keeps is the thing the handbook calls
-- an untruth with legal consequences. Building the loop first is the only
-- ordering under which the page can be written at all.

-- +goose Up

-- The purge, oldest first:
--
--   DELETE FROM contact_messages
--    WHERE received_at < $1 AND delivery_status <> 'queued'
--
-- Plain and not partial. The predicate the purge adds is an inequality against
-- the one status it must NOT touch, so a partial index over "not queued" would
-- cover nearly every row in the table and buy nothing a plain btree does not
-- already give: rows arrive in received_at order, so the window the purge wants
-- is the left edge of the index and reads as a range scan.
--
-- It does not serve the rate-limit floor, which leads on ip_hash and has its own
-- index next door (contact_messages_ip_window_idx). Two queries, two orders, two
-- indexes.
CREATE INDEX contact_messages_received_at_idx
    ON contact_messages (received_at);

COMMENT ON INDEX contact_messages_received_at_idx IS
    'H12 retention purge: the settled messages older than the retention window';

-- +goose Down

DROP INDEX contact_messages_received_at_idx;
