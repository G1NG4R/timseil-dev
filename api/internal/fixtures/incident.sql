-- Thirty days of measurement on top of the empty grid, with one outage that has
-- a post-mortem and one degraded day that does not.
--
-- What this set is for: invariant 4 (no notch without a post-mortem), invariant 5
-- (the system behind a notch cannot be deleted), and all four day states in one
-- database — `nodata` for the 61 days before measurement started, then `ok`,
-- `degraded` and `outage`.
--
-- The raw checks and the daily roll-up are both written, and they agree by
-- construction: down_sec is the number of failed probes times the probe interval.
-- That is on purpose — C4 computes ops_days FROM ops_checks, and a fixture whose
-- aggregate contradicts its raw data cannot tell a correct aggregation from a
-- wrong one. The states here are stated, not derived: deriving them is the job of
-- the code this fixture exists to test.
--
-- Every timestamp is anchored to midnight UTC, because ops_days.day is a UTC
-- date. Using `current_date` would read the session's time zone and put the
-- checks of a day into the cell of the day before on any machine not set to UTC.
--
-- Nothing in here is real. These numbers describe a system that did not exist,
-- and they never leave a test database: no command can reach this package, and
-- boundary_test.go fails if one ever does. Invented operational data in the seed
-- would be the exact lie this project is built against — docs/runbooks/seed.md.

-- A probe every 30 minutes for the last 30 days, all answering.
INSERT INTO ops_checks (system_id, observed_at, up, latency_ms, origin)
SELECT s.id,
       (((now() AT TIME ZONE 'UTC')::date - 29)::timestamp AT TIME ZONE 'UTC')
           + (n || ' minutes')::interval,
       true,
       118,
       'probe'
  FROM systems s
  CROSS JOIN generate_series(0, 30 * 24 * 60 - 30, 30) AS n
 WHERE s.slug = 'timseil-dev';

-- One hour down, 15 days ago: two consecutive probes fail. latency_ms has to go
-- to NULL and the reason has to appear — the schema refuses a latency on a failed
-- check and a reason on a successful one.
UPDATE ops_checks
   SET up = false, latency_ms = NULL, reason = 'connection refused'
 WHERE observed_at >= (((now() AT TIME ZONE 'UTC')::date - 15)::timestamp AT TIME ZONE 'UTC')
                      + interval '14 hours'
   AND observed_at <  (((now() AT TIME ZONE 'UTC')::date - 15)::timestamp AT TIME ZONE 'UTC')
                      + interval '15 hours';

-- Half an hour degraded, 8 days ago: a single failed probe, and deliberately no
-- incident. A bad day is not automatically a notch — the post-mortem obligation
-- hangs on incidents, and the day is aggregated either way.
UPDATE ops_checks
   SET up = false, latency_ms = NULL, reason = 'gateway timeout'
 WHERE observed_at >= (((now() AT TIME ZONE 'UTC')::date - 8)::timestamp AT TIME ZONE 'UTC')
                      + interval '3 hours'
   AND observed_at <  (((now() AT TIME ZONE 'UTC')::date - 8)::timestamp AT TIME ZONE 'UTC')
                      + interval '3 hours 30 minutes';

-- The notch. cause, fix and post_slug are NOT NULL and non-blank by schema rule,
-- so an incident without an explanation cannot be written at all.
--
-- post_slug names an MDX file in web/content/posts/ that does not exist, and
-- deliberately says so in its name: the CI job that checks slug against file
-- (stage E) has to skip fixtures, or it would demand a post-mortem for an outage
-- that never happened.
INSERT INTO incidents (id, system_id, started_at, duration_sec, cause, fix, post_slug)
SELECT 'INC-001', s.id,
       (((now() AT TIME ZONE 'UTC')::date - 15)::timestamp AT TIME ZONE 'UTC')
           + interval '14 hours',
       3600,
       'the migration held a lock the api was already waiting on',
       'lock_timeout on the migration role, and the deploy rolled back',
       '001-fixture-outage'
  FROM systems s
 WHERE s.slug = 'timseil-dev';

-- The roll-up. Upserts, because day-one.sql already wrote all 91 days as nodata.
-- Two failed probes read as an outage, one as degraded: that split is this
-- fixture's own convention, stated here so a test can rely on it, and it is not
-- the rule C4 has to invent.
INSERT INTO ops_days (system_id, day, state, down_sec, checks_total, checks_up, incident_id)
SELECT c.system_id,
       (c.observed_at AT TIME ZONE 'UTC')::date,
       CASE count(*) FILTER (WHERE NOT c.up)
            WHEN 0 THEN 'ok'
            WHEN 1 THEN 'degraded'
            ELSE 'outage'
       END,
       count(*) FILTER (WHERE NOT c.up) * 1800,
       count(*),
       count(*) FILTER (WHERE c.up),
       CASE WHEN count(*) FILTER (WHERE NOT c.up) >= 2 THEN 'INC-001' END
  FROM ops_checks c
 GROUP BY 1, 2
    ON CONFLICT (system_id, day) DO UPDATE SET
       state        = EXCLUDED.state,
       down_sec     = EXCLUDED.down_sec,
       checks_total = EXCLUDED.checks_total,
       checks_up    = EXCLUDED.checks_up,
       incident_id  = EXCLUDED.incident_id;

-- Two deploys, and the pair tells the story the grid shows: a release, then the
-- rollback that ended the outage. duration_sec is what a pipeline reports, never
-- an estimate — here it is simply part of the fixture's fiction.
INSERT INTO deploys (system_id, sha, duration_sec, result, deployed_at)
SELECT s.id, d.sha, d.duration_sec, d.result,
       (((now() AT TIME ZONE 'UTC')::date - 15)::timestamp AT TIME ZONE 'UTC') + d.after_midnight
  FROM systems s
  CROSS JOIN (VALUES
        ('a41f9c2', 42, 'ok',       interval '13 hours 40 minutes'),
        ('b7d0e15', 38, 'rollback', interval '15 hours 2 minutes')
       ) AS d (sha, duration_sec, result, after_midnight)
 WHERE s.slug = 'timseil-dev';
