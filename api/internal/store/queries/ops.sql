-- The aggregation behind the operations grid: ops_checks -> ops_days.
--
-- One statement, and the whole of C4's arithmetic is in it. ADR 0017 put the
-- 91-day window in SQL so the read path could not invent an `ok`; this is the
-- other half of the same decision. The write path cannot invent one either,
-- because a day with no check never reaches the INSERT at all.
--
-- Today is (now() AT TIME ZONE 'UTC')::date everywhere in this file, never
-- current_date, for the reason systems.sql gives at the top: ops_days.day is a
-- UTC date, day-one.sql builds its grid in UTC, and two definitions of "today"
-- is one too many for a site whose whole claim is that the numbers can be
-- recounted.

-- RollUpOpsDays recomputes every day that has received a raw check recently.
--
-- Two parameters and no defaults, so the caller states the outage threshold and
-- the scan bound. The db test can therefore replay the Incident fixture's own
-- convention (2 checks) and get its stated histogram back; a rule baked into
-- this file would make that test a tautology.
--
-- THERE IS NO CADENCE PARAMETER ANY MORE, and that is issue #180. down_sec used
-- to be failed checks TIMES a declared interval, and the interval was declared
-- rather than driven: counted over 2026-08-24, the probe ran 41 times in 23.66
-- hours where its cron promises 284 — a real interval of about 35 minutes
-- against a constant of five. Every outage duration on the public grid was
-- therefore understated by roughly that factor, and it flattered us. A duration
-- derived from a cadence that does not happen is an invented number wearing an
-- operations hat, which is invariant 1.
--
-- WHY A DAY WITHOUT A MEASUREMENT CANNOT COME OUT `ok`. `rolled` is an inner
-- join against ops_checks, so a group exists only where at least one check does.
-- The CASE has no 'nodata' branch and needs none: an unmeasured day produces no
-- row here in any state. The gap is made by the read path — generate_series plus
-- COALESCE(o.state, 'nodata') in OpsDaysForSystem — not remembered by this one.
-- That is invariant 6 as a property of the shape rather than as a rule somebody
-- has to keep. ops_days_nodata_iff_unmeasured_ck (00004_operations.sql) stays as
-- the guard against a later edit of the CASE above; it is tested directly in
-- migrations/invariants_db_test.go and is not this query's business.
--
-- TWO WINDOWS, TWO COLUMNS. `touched` is bounded on recorded_at — what the
-- database has newly learned — and `rolled` groups on observed_at — which day it
-- happened. That is exactly the pair 00004_operations.sql describes, and it is
-- what makes the F4 backfill free: a line replayed from uptime-log.txt carries a
-- months-old observed_at and a recorded_at of now(), so it is inside the scan
-- however old the observation is.
--
-- `rolled` re-reads the FULL day, not only the rows the scan just found. A
-- roll-up over a slice of a day would undercount checks_total and put a wrong
-- number underneath a correct-looking colour.
--
-- HOW LONG A FAILED CHECK VOUCHES FOR, now that no constant answers it.
--
-- A check at T states one thing: the site was down at T. It says nothing about
-- T plus a second. What the timestamps DO give is the pair — the check after it.
-- So a failed check carries the span to its successor, and the sum of those
-- spans over a day is down_sec. Nothing is multiplied by anything, and a stated
-- duration can be recounted from the two instants that produced it, which is
-- what #180 asks for.
--
-- THE SUCCESSOR HAS TO BE ON THE SAME DAY, or the span is dropped rather than
-- shortened. That is the rule that keeps this arithmetic from replacing an
-- understatement with a much louder overstatement, and the case that forced it
-- is small: one failed check at 00:00 on a day nothing else measured. Its next
-- check is the following midnight. Clipping the span to the day boundary would
-- put 86 400 seconds of outage on a cell whose own checks_total reads 1 — a
-- full day of downtime derived from a single glance. Dropping it says the true
-- thing instead: we looked once, it was down, and we cannot say for how long.
--
-- The direction of the remaining error is stated rather than hidden. It always
-- UNDERSTATES, never flatters twice: an outage running past midnight loses its
-- last span, and an outage that is still open contributes nothing at all, which
-- is the same refusal internal/uptime/expand.go already makes for a trailing
-- `down` — counting up to now() would put a number on the page that no probe
-- produced. The replay pays it too: five instants replayed with no live check
-- after them are four spans, not five.
--
-- It reproduces the numbers the Incident fixture declares, and that is the
-- evidence for the shape rather than an argument for it. Two consecutive failed
-- probes half an hour apart with the next one answering: 1800 + 1800 = 3600,
-- and INC-001 independently says 3600. One failed probe with the next
-- answering: 1800. Both agreements survive the change — which is also why the
-- fixture tests alone cannot catch a regression here. The case that separates
-- the two arithmetics is one whose cadence differs from the old constant, and
-- ops_down_sec_db_test.go is that case.
--
-- The second stage is a LATERAL and the predicate is a half-open range on
-- observed_at, and both halves of that were measured rather than assumed.
--
-- The range, first: (observed_at AT TIME ZONE 'UTC')::date = t.day is not
-- sargable and throws away ops_checks_unique_observation. The range is the shape
-- 00004_operations.sql names as "what the aggregation reads", and one day out of
-- 52 416 rows comes back through the index in 0.27 ms.
--
-- The LATERAL, second, and it is the same lesson ListSystems learned in C2. As a
-- plain join the planner merge-joins on system_id alone and drops 4.7 million
-- rows by filter — 1.63 s for 182 days. The LATERAL forces one index lookup per
-- touched day instead, and the same work takes 51 ms. The measurement is in
-- docs/runbooks/migrations.md; it was never the index, it was the question.
--
-- The window function reads the SAME rows the counts read, and that was checked
-- in the plan rather than assumed: `Index Searches: 182` with it and without it,
-- and NO Sort node — WindowAgg sits straight on the index scan, because
-- ops_checks_unique_observation already returns the day in observed_at order.
-- Measured 30.08.2026 on 52 416 rows over 182 days: the everyday case (one day)
-- goes 0.36 ms -> 0.72 ms, the whole window 420 ms -> 518 ms, and the peak
-- window storage is 17 kB per day. docs/runbooks/migrations.md carries the table.
--
-- That is the other reason the successor is bounded to the day: a sentinel row
-- from the next day would have cost a second index search per touched day to buy
-- a span this file has just refused to claim.
--
-- ORDER BY before ON CONFLICT is not cosmetic. E5 runs two instances of this
-- binary at once during a deploy, and two upserts touching the same rows in
-- different orders is the textbook deadlock.
--
-- LEAST is now unreachable from this statement and stays. Every span ends at a
-- check inside the same day, so the sum cannot exceed a day by construction —
-- but ops_days_down_sec_ck aborts the whole statement rather than clamping one
-- cell, and a belt that costs one function call is the cheap side of that trade.
-- floor(), not a round, because a fractional second rounded up is a duration
-- nobody measured.
--
-- incident_id is deliberately absent from the DO UPDATE list. The notch is
-- human-curated — 00004_operations.sql says C4 aggregates the outage and a
-- person writes the post-mortem afterwards — so recomputing a day must not
-- touch it.
--
-- name: RollUpOpsDays :execrows
WITH touched AS (
    SELECT DISTINCT
           c.system_id,
           (c.observed_at AT TIME ZONE 'UTC')::date AS day
      FROM ops_checks c
     WHERE c.recorded_at >= now() - (sqlc.arg(lookback_sec)::int * interval '1 second')
),
rolled AS (
    SELECT t.system_id,
           t.day,
           a.checks_total,
           a.checks_up,
           a.checks_down,
           a.down_sec
      FROM touched t
      CROSS JOIN LATERAL (
          SELECT count(*)                         AS checks_total,
                 count(*) FILTER (WHERE s.up)     AS checks_up,
                 count(*) FILTER (WHERE NOT s.up) AS checks_down,
                 COALESCE(
                     sum(EXTRACT(EPOCH FROM (s.next_at - s.observed_at)))
                         FILTER (WHERE NOT s.up AND s.next_at IS NOT NULL),
                     0
                 )                                AS down_sec
            FROM (
                SELECT c.up,
                       c.observed_at,
                       lead(c.observed_at) OVER (ORDER BY c.observed_at) AS next_at
                  FROM ops_checks c
                 WHERE c.system_id = t.system_id
                   AND c.observed_at >= (t.day::timestamp AT TIME ZONE 'UTC')
                   AND c.observed_at <  ((t.day + 1)::timestamp AT TIME ZONE 'UTC')
            ) s
      ) a
)
INSERT INTO ops_days (system_id, day, state, down_sec, checks_total, checks_up, computed_at)
SELECT system_id,
       day,
       CASE
           WHEN checks_down = 0                            THEN 'ok'
           WHEN checks_down < sqlc.arg(outage_checks)::int THEN 'degraded'
           ELSE                                                 'outage'
       END,
       LEAST(floor(down_sec), 86400)::int,
       checks_total,
       checks_up,
       now()
  FROM rolled
 ORDER BY system_id, day
    ON CONFLICT (system_id, day) DO UPDATE SET
       state        = EXCLUDED.state,
       down_sec     = EXCLUDED.down_sec,
       checks_total = EXCLUDED.checks_total,
       checks_up    = EXCLUDED.checks_up,
       computed_at  = EXCLUDED.computed_at;

-- The write side of the grid: the two rows C7's internal endpoints append.
--
-- Neither aggregates anything. The probe adds one raw observation and the loop
-- in internal/ops finds it on the next tick — ADR 0019 already decided that,
-- and it is why C7 is small.

-- SystemIDBySlug resolves the one system both internal endpoints write against.
--
-- Separate from the two inserts below, and that is the decision worth the extra
-- round trip. Folded in as `INSERT ... SELECT id FROM systems WHERE slug = $1
-- ... ON CONFLICT DO NOTHING`, zero affected rows would mean two different
-- things — "no such system", which is a misconfiguration and a 500, and "that
-- observation is already recorded", which is a 204. One return value carrying
-- two states is the kind of economy that comes back later as a ghost.
--
-- pgx.ErrNoRows is therefore load-bearing: it is the only way the caller learns
-- that SITE_SYSTEM_SLUG names nothing.
--
-- name: SystemIDBySlug :one
SELECT id FROM systems WHERE slug = $1;

-- InsertOpsCheck records one external observation of this host.
--
-- origin is fixed to 'probe' here rather than taken from the caller. The other
-- value the CHECK allows is 'backfill', which belongs to F4's replay of
-- uptime-log.txt and carries a source_ref naming the commit; letting an HTTP
-- body choose between them would let a live probe claim to be evidence from
-- outside the infrastructure, which is the one claim this table exists to make
-- honestly.
--
-- recorded_at is NOT set, deliberately. Its default is now(), and now() is what
-- RollUpOpsDays scans on — a recorded_at supplied by the caller could put a new
-- row outside the loop's lookback window and make it invisible for ever, while
-- observed_at stays free to be as old as the observation really is.
--
-- ON CONFLICT DO NOTHING against ops_checks_unique_observation makes a retry
-- free: a prober that times out waiting for our 204 may send the same
-- observation again without producing a second one. It also means a second
-- report for the same instant is DISCARDED rather than applied, including one
-- that disagrees about `up`. That is the migration's own rule — "a backfill
-- never overwrites a live probe" — and the caller counts the affected rows so
-- the discard is at least visible in the log.
--
-- name: InsertOpsCheck :execrows
INSERT INTO ops_checks (system_id, observed_at, up, latency_ms, reason, origin)
VALUES (
    sqlc.arg(system_id),
    sqlc.arg(observed_at),
    sqlc.arg(up),
    sqlc.narg(latency_ms),
    sqlc.narg(reason),
    'probe'
)
ON CONFLICT (system_id, observed_at) DO NOTHING;

-- BackfillOpsChecks replays the outages this host could not record about itself.
--
-- The other half of the sentence InsertOpsCheck above starts. That one is the
-- live prober and writes origin='probe'; this one is F4's replay of
-- uptime-log.txt from the ops-data branch, and every column that could carry a
-- claim is a constant here rather than an argument:
--
--   up          is false, always. The file is an OUTAGE log. "The site was up"
--               is witnessed by a live probe or by nobody at all, and a replayed
--               line must not be able to say it (ADR 0038).
--   latency_ms  is left out of the column list, so it is NULL. There is no
--               measurement to report from a request that never completed, and
--               ops_checks_no_latency_when_down_ck is satisfied by construction
--               rather than by the caller remembering.
--   origin      is 'backfill', so the grid can tell a measurement from a
--               reconstruction without asking anybody's word for it.
--
-- source_ref IS an argument, and it is the one this table's CHECK insists on:
-- the commit on ops-data the lines were read from. That is what makes a derived
-- row traceable to something a stranger can fetch and count for themselves.
--
-- ONE STATEMENT PER OUTAGE, not per instant and not per file. An outage of a day
-- is 288 rows, and 288 round trips through the pool during startup is a cost with
-- nothing to show for it; unnest turns the instants into rows in one pass. The
-- outage is also the unit that shares a reason, which is why reason is a scalar
-- here — a shape that carried one reason per row would have to promise that the
-- two arrays stay the same length, and Postgres answers a mismatch with NULLs
-- rather than with an error.
--
-- ORDER BY is not decoration. ADR 0035 runs two instances of this binary during
-- a rollout and both start their backfill; RollUpOpsDays already sorts before
-- its ON CONFLICT so that two writers take the same rows in the same order, and
-- this statement wants the same protection from the same deadlock.
--
-- ON CONFLICT DO NOTHING is what makes re-reading the file free — the loop reads
-- it again after every restart — and it is also the rule "a backfill never
-- overwrites a live probe", enforced rather than promised. The caller counts the
-- affected rows so the discarded ones are visible in the log.
--
-- name: BackfillOpsChecks :execrows
INSERT INTO ops_checks (system_id, observed_at, up, reason, origin, source_ref)
SELECT
    sqlc.arg(system_id),
    o.observed_at,
    false,
    sqlc.arg(reason),
    'backfill',
    sqlc.arg(source_ref)
FROM unnest(sqlc.arg(observed_at)::timestamptz[]) AS o (observed_at)
ORDER BY o.observed_at
ON CONFLICT (system_id, observed_at) DO NOTHING;

-- InsertDeploy records what the pipeline says its own release cost.
--
-- The unique constraint is (system_id, sha, deployed_at) and the migration says
-- why in one line: "a retried POST /api/internal/deploy must not produce a
-- second bar". Two genuinely separate deploys of the same commit — a rollback
-- and the redeploy after it — differ in deployed_at and are two rows, which is
-- correct: they are two events.
--
-- name: InsertDeploy :execrows
INSERT INTO deploys (system_id, sha, duration_sec, result, deployed_at)
VALUES (
    sqlc.arg(system_id),
    sqlc.arg(sha),
    sqlc.arg(duration_sec),
    sqlc.arg(result),
    sqlc.arg(deployed_at)
)
ON CONFLICT (system_id, sha, deployed_at) DO NOTHING;
