-- The queries behind GET /api/systems and GET /api/systems/{slug}.
--
-- Same discipline as health.sql: one query per question, so that every column
-- keeps the nullability it has in its own table and "there is no row" arrives as
-- pgx.ErrNoRows rather than as a scan failure (ADR 0016). The two exceptions
-- below are joins, and both carry a note saying why they earn it.
--
-- Today is (now() AT TIME ZONE 'UTC')::date everywhere in this file, never
-- current_date. current_date reads the session timezone, so the same request
-- would cover a different span depending on how the connection was configured —
-- and day-one.sql builds its grid in UTC. Two definitions of "today" is one too
-- many for a site whose whole claim is that the numbers can be recounted.

-- ListSystems is the one place a join is right, and the shape is not a guess:
-- the comment in 00005_metrics.sql measured it. LEFT JOIN LATERAL reads
-- backwards along metric_snapshots_unique_instant (system_id, measured_at) at
-- 0.23 ms and stays flat as the table grows; the DISTINCT ON alternative was
-- 8.7 ms over 10 002 snapshots and linear. This table gains a row every five
-- minutes forever, so that difference is not cosmetic.
--
-- Invariant 3 sits inside the lateral, not in Go: `AND s.state = 'live'` means
-- a system leaving 'live' empties its own metrics without anyone remembering to.
-- The golden test in internal/systems is the other half of the same rule.
--
-- Left-joining is safe for exactly these four columns and it is worth saying why,
-- because ADR 0016 warns about the opposite case: the three metrics are nullable
-- in their own table and come out as *float64, and measured_at, though NOT NULL
-- there, arrives as pgtype.Timestamptz — which carries its own .Valid and scans
-- a NULL without complaint. A NOT NULL text or integer column pulled through
-- this join would not, and would need the COALESCE-and-cast treatment used by
-- OpsDaysForSystem below.
--
-- name: ListSystems :many
SELECT s.slug, s.system_no, s.name, s.state,
       s.source_access, s.source_url, s.source_reason, s.stack,
       m.uptime_90d, m.p95_ms, m.error_rate, m.measured_at
  FROM systems s
  LEFT JOIN LATERAL (
      SELECT uptime_90d, p95_ms, error_rate, measured_at
        FROM metric_snapshots
       WHERE system_id = s.id
         AND s.state = 'live'
       ORDER BY measured_at DESC
       LIMIT 1
  ) m ON true
 ORDER BY s.system_no;

-- GetSystemBySlug answers the first question the detail endpoint has: does this
-- system exist at all. No join — "no such system" has to be pgx.ErrNoRows so the
-- handler can turn it into a 404 rather than into an empty grid that looks like
-- a system with nothing measured.
--
-- It returns id as well, so the three ops queries below take a bigint instead of
-- resolving the slug again three times.
--
-- name: GetSystemBySlug :one
SELECT id, slug, system_no, name, state,
       source_access, source_url, source_reason, stack
  FROM systems
 WHERE slug = $1;

-- OpsDaysForSystem builds the window in SQL rather than reading rows and filling
-- the gaps in Go, and that is invariant 6 made structural: a day without a
-- measurement is 'nodata', never 'ok'. generate_series produces every cell the
-- window has, the LEFT JOIN supplies the ones that were measured, and COALESCE
-- names the rest. A Go loop over the returned rows would do the same thing right
-- up until somebody edits it.
--
-- The two casts are load-bearing, not decoration. ops_days.state and
-- ops_days.down_sec are NOT NULL in their table, so sqlc generates plain string
-- and int32 for them — and a left-joined NULL then fails to scan on exactly the
-- day this query exists to produce (ADR 0016). COALESCE(...)::text gives the
-- generator the nullability the query really has, the same trick health.sql uses
-- for its two counts. incident_id stays nullable, because the contract's
-- incidentId is optional: most days do not carry a notch.
--
-- name: OpsDaysForSystem :many
WITH window_days AS (
    SELECT (now() AT TIME ZONE 'UTC')::date AS today,
           sqlc.arg(window_size)::int            AS span
)
SELECT g.day::date                       AS day,
       COALESCE(o.state, 'nodata')::text  AS state,
       COALESCE(o.down_sec, 0)::int       AS down_sec,
       o.incident_id
  FROM window_days w
  CROSS JOIN generate_series(w.today - (w.span - 1), w.today, interval '1 day') AS g(day)
  LEFT JOIN ops_days o
         ON o.system_id = sqlc.arg(system_id)::bigint
        AND o.day = g.day::date
 ORDER BY g.day;

-- IncidentsForSystem is bounded by the same window as the grid, computed the
-- same way, so the notches and the cells they belong to cannot cover different
-- spans. incidents_by_system_time_idx (system_id, started_at DESC) exists for
-- this exact shape; its comment in 00004_operations.sql says so.
--
-- Every column here is NOT NULL, and that is invariant 4 rather than luck: no
-- incident without cause, fix and post_slug. A red cell without an explanation
-- cannot be stored, so it cannot be served.
--
-- name: IncidentsForSystem :many
SELECT id, started_at, duration_sec, cause, fix, post_slug
  FROM incidents
 WHERE system_id = sqlc.arg(system_id)::bigint
   AND started_at >= ((now() AT TIME ZONE 'UTC')::date - (sqlc.arg(window_size)::int - 1))
 ORDER BY started_at DESC;

-- DeploysForSystem is window-bounded for the reason the contract gives: uptime,
-- MTTR and rollback rate are computed by the caller from days and deploys. Two
-- arrays covering different spans would produce a rollback rate that disagrees
-- with the grid a reader can count.
--
-- deploys_by_system_time_idx (system_id, deployed_at DESC) serves it; the
-- migration comment names C2 as a consumer.
--
-- name: DeploysForSystem :many
SELECT sha, duration_sec, result, deployed_at
  FROM deploys
 WHERE system_id = sqlc.arg(system_id)::bigint
   AND deployed_at >= ((now() AT TIME ZONE 'UTC')::date - (sqlc.arg(window_size)::int - 1))
 ORDER BY deployed_at DESC;
