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
-- Three parameters and no defaults, so the caller states the probe cadence, the
-- outage threshold and the scan bound. The db test can therefore replay the
-- Incident fixture's own convention (1800 s, 2 checks) and get its stated
-- histogram back; a rule baked into this file would make that test a tautology.
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
-- ORDER BY before ON CONFLICT is not cosmetic. E5 runs two instances of this
-- binary at once during a deploy, and two upserts touching the same rows in
-- different orders is the textbook deadlock.
--
-- LEAST is load-bearing: ops_days_down_sec_ck caps down_sec at a full day, so
-- without it a misconfigured cadence would abort the whole statement instead of
-- clamping one cell.
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
           a.checks_down
      FROM touched t
      CROSS JOIN LATERAL (
          SELECT count(*)                         AS checks_total,
                 count(*) FILTER (WHERE c.up)     AS checks_up,
                 count(*) FILTER (WHERE NOT c.up) AS checks_down
            FROM ops_checks c
           WHERE c.system_id = t.system_id
             AND c.observed_at >= (t.day::timestamp AT TIME ZONE 'UTC')
             AND c.observed_at <  ((t.day + 1)::timestamp AT TIME ZONE 'UTC')
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
       LEAST(checks_down * sqlc.arg(probe_interval_sec)::int, 86400)::int,
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
