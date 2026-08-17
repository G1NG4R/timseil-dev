-- metric_snapshots — the numbers, pulled from Prometheus every five minutes.
-- Handbook ch. 7 ("Prometheus misst, Postgres serviert") and ch. 12.
--
-- Separate from ops_days because the two have a different origin and a
-- different lifetime: ops_days is aggregated from our own probes, this is a
-- copy of somebody else's time series, taken so the site never queries
-- Prometheus on a page load and keeps working when Prometheus does not.

-- +goose Up

CREATE TABLE metric_snapshots (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    system_id   bigint           NOT NULL REFERENCES systems (id) ON DELETE RESTRICT,

    -- NOT NULL, unlike the three values below: the row exists BECAUSE a
    -- measurement was taken. A null measuredAt in the contract comes from there
    -- being no row at all, never from an empty column. A value without its age
    -- cannot be told apart from a fresh one.
    measured_at timestamptz      NOT NULL,

    -- All three nullable, and that is invariant 1 rather than sloppiness.
    -- double precision because the handbook writes *float64 in Go and
    -- number | null in TypeScript; the B1 finding about oapi-codegen emitting
    -- *float32 sits on the other side of the same rule.
    --
    -- 0 is a real measurement. An error rate of 0 is an excellent value, a
    -- missing error rate is no value at all, and rendering them the same way
    -- would be the most elegant way to lie without noticing.
    uptime_90d  double precision
                CONSTRAINT metric_snapshots_uptime_range_ck CHECK (uptime_90d IS NULL OR uptime_90d BETWEEN 0 AND 100),
    p95_ms      double precision
                CONSTRAINT metric_snapshots_p95_range_ck CHECK (p95_ms IS NULL OR p95_ms >= 0),
    error_rate  double precision
                CONSTRAINT metric_snapshots_error_rate_range_ck CHECK (error_rate IS NULL OR error_rate BETWEEN 0 AND 1),

    recorded_at timestamptz      NOT NULL DEFAULT now(),

    CONSTRAINT metric_snapshots_unique_instant UNIQUE (system_id, measured_at)
);

-- A snapshot with all three values NULL is ALLOWED and is not a bug. It records
-- "we asked Prometheus and got nothing back", which is a different fact from
-- "we never asked" — and telling those two apart is the entire reason the
-- columns are nullable in the first place.
--
-- Invariant 3 ("metrics only for live systems") is NOT enforced here. It would
-- need a trigger against systems.state, and state changes: a system moving from
-- live to in_build would retroactively invalidate its own measurement history,
-- or force it to be deleted. Deleting measurements because a status changed is
-- the opposite of what this site claims to do. Invariant 3 is a delivery rule —
-- the read path in C2 filters WHERE s.state = 'live', and C2's golden test
-- ("every system with state != 'live' has null in every metric field") is where
-- it is enforced.
COMMENT ON TABLE metric_snapshots IS
    'Nullable by design (invariant 1). Invariant 3 is enforced on the read path in C2.';

-- No hand-written index: the unique constraint (system_id, measured_at) already
-- has the right columns. What it does NOT survive is the wrong query shape, and
-- that was measured rather than assumed. Against 10 002 snapshots:
--
--   SELECT DISTINCT ON (system_id) ... ORDER BY system_id, measured_at DESC
--     -> Seq Scan + Sort over every row, 8.7 ms, and linear in table size
--
--   SELECT ... FROM systems s LEFT JOIN LATERAL (
--       SELECT ... FROM metric_snapshots WHERE system_id = s.id
--        ORDER BY measured_at DESC LIMIT 1) m ON true
--     -> Index Scan Backward using metric_snapshots_unique_instant, 0.23 ms,
--        and flat as the table grows
--
-- This table gains a row every five minutes forever, so the difference is not
-- cosmetic. C2 takes the lateral form; the index stays as it is.

-- +goose Down

DROP TABLE metric_snapshots;
