-- The write side of metric_snapshots, and the only one. F5.
--
-- 00005_metrics.sql created this table in B2 and nothing has written to it
-- since; the read path (health.sql, systems.sql, the uptime badge) has been
-- answering null the whole time, which was the correct answer and stops being
-- one here.
--
-- ONE STATEMENT, THREE NUMBERS, TWO ORIGINS. p95_ms and error_rate come from
-- Prometheus and arrive as arguments. uptime_90d does NOT: it is derived here,
-- from ops_days, from F4's external probe. ADR 0041 1 has the two reasons, and
-- the first one is arithmetic rather than taste -- this Prometheus keeps seven
-- days and the window is ninety-one.
--
-- Derived in SQL and not in Go, for the reason ADR 0017 and ADR 0019 both give
-- about the grid: a Go loop over ops_days would compute the same average right
-- up until somebody edits it, and "today" would then have a second definition
-- in a second timezone.

-- InsertMetricSnapshot writes one instant.
--
-- system_id and not a slug, deliberately, and the precedent is SystemIDBySlug
-- in ops.sql: folded together, zero affected rows would mean two different
-- things -- "no such system", which is a misconfiguration, and "that instant is
-- already recorded", which is ordinary. One return value carrying two states is
-- the kind of economy that comes back later as a ghost. The caller resolves the
-- slug first and learns about a bad SITE_SYSTEM_SLUG from pgx.ErrNoRows there.
--
-- THE UPTIME BRANCH IS INVARIANT 1, and both directions of it. A day with no
-- check carries checks_total = 0 and contributes nothing to either sum, so a
-- gap in the grid dilutes nothing (invariant 6). If NO day in the window was
-- ever checked, the sum is zero and the answer is NULL -- never 0, which would
-- read as "this system answered none of the time". A real 0 is impossible here
-- for a different reason: ops_days_checks_total_ck admits checks_up = 0 with
-- checks_total > 0, and that IS a measured zero, and it is stored as one.
--
-- The window is an argument rather than a literal so that systems.DefaultWindow
-- stays the one place 91 is written. Invariant 7 says the number has to remain
-- countable; two copies of it is how it stops being.
--
-- ON CONFLICT DO NOTHING against metric_snapshots_unique_instant: the loop ticks
-- every five minutes and Prometheus evaluates every fifteen seconds, so two
-- ticks can in principle land on one evaluation instant. The second one is not
-- an error and not news -- :execrows lets the caller log that it discarded one
-- rather than pretend it wrote it.
--
-- name: InsertMetricSnapshot :execrows
WITH window_days AS (
    SELECT (now() AT TIME ZONE 'UTC')::date AS today,
           sqlc.arg(window_size)::int       AS span
),
uptime AS (
    SELECT CASE
               WHEN coalesce(sum(o.checks_total), 0) = 0 THEN NULL
               ELSE sum(o.checks_up)::double precision
                    / sum(o.checks_total)::double precision * 100
           END AS pct
      FROM window_days w
      LEFT JOIN ops_days o
             ON o.system_id = sqlc.arg(system_id)::bigint
            AND o.day >= w.today - (w.span - 1)
            AND o.day <= w.today
)
INSERT INTO metric_snapshots (system_id, measured_at, uptime_90d, p95_ms, error_rate)
SELECT sqlc.arg(system_id)::bigint,
       sqlc.arg(measured_at)::timestamptz,
       u.pct,
       sqlc.narg(p95_ms)::double precision,
       sqlc.narg(error_rate)::double precision
  FROM uptime u
ON CONFLICT (system_id, measured_at) DO NOTHING;
