-- The queries behind GET /api/health.
--
-- Three of them rather than one clever join, and that is a decision. A single
-- LEFT JOIN would save two round trips on an endpoint whose answer is cached
-- for sixty seconds — and it would hand sqlc a set of columns whose nullability
-- it cannot infer: `deploys.sha` is NOT NULL in the table, so a left-joined
-- `sha` is generated as a plain string, and the first health check on a database
-- with no deploys would fail scanning NULL into it. The generator would be
-- right about the schema and wrong about the query.
--
-- Split, every column carries the nullability it has in its own table, and
-- "there is no row" arrives as pgx.ErrNoRows — which is the honest shape for
-- "nothing has been measured yet". Invariant 1 has somewhere to point.

-- HealthCounts always returns exactly one row, including on an empty database:
-- count() over no rows is zero, not no row. These two numbers are the only part
-- of the health answer that is never null, which is why they are the part that
-- decides between an answer and a 500.
--
-- name: HealthCounts :one
SELECT
    (SELECT count(*) FROM systems WHERE state = 'live')::int AS systems_live,
    (SELECT count(*) FROM systems)::int                      AS systems_total;

-- SelfState is its own query rather than a scalar subquery on the one above.
-- As a subquery it would be NULL for a slug that does not exist, and sqlc reads
-- the nullability off systems.state, which is NOT NULL — so it would generate a
-- plain string and the scan would fail on exactly the case the query exists to
-- detect. Separate, "no such system" is pgx.ErrNoRows, which is a shape the
-- caller can act on.
--
-- name: SelfState :one
SELECT state FROM systems WHERE slug = $1;

-- LatestMetrics carries invariant 3 in its WHERE clause: metrics exist only for
-- a system that is live. Written here rather than in Go, so that a system
-- leaving 'live' empties its own metrics without anyone remembering to.
--
-- Reads backwards along metric_snapshots_unique_instant (system_id,
-- measured_at) — the shape 00005_metrics.sql measured that index against.
--
-- name: LatestMetrics :one
SELECT m.uptime_90d, m.p95_ms, m.error_rate, m.measured_at
  FROM metric_snapshots m
  JOIN systems s ON s.id = m.system_id
 WHERE s.slug = $1
   AND s.state = 'live'
 ORDER BY m.measured_at DESC
 LIMIT 1;

-- LastDeploy serves OpsSummary.lastDeploy. deploys_by_system_time_idx exists
-- for exactly this query; its comment in 00004_operations.sql says so.
--
-- name: LastDeploy :one
SELECT d.sha, d.duration_sec, d.result, d.deployed_at
  FROM deploys d
  JOIN systems s ON s.id = d.system_id
 WHERE s.slug = $1
 ORDER BY d.deployed_at DESC
 LIMIT 1;
