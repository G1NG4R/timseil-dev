-- incidents, ops_days, ops_checks, deploys — the operations grid.
-- Handbook ch. 8 (external outage log) and ch. 13 (the grid).
--
-- Raw data and aggregate are separate tables on purpose: ops_checks collects
-- single measurements, ops_days is the daily roll-up the grid renders from.
--
-- Order matters here. incidents is created first because ops_days references
-- it; the Down drops them the other way round.

-- +goose Up

CREATE TABLE incidents (
    -- Natural key. The contract hands out exactly this string as Incident.id,
    -- OpsDay.incidentId points at it, and a notch on the grid links a published
    -- post-mortem — so the identifier is immutable by construction and a
    -- surrogate would only add a join.
    id           text        PRIMARY KEY
                 CONSTRAINT incidents_id_shape_ck CHECK (id ~ '^INC-[0-9]{3}$'),

    system_id    bigint      NOT NULL REFERENCES systems (id) ON DELETE RESTRICT,
    started_at   timestamptz NOT NULL,
    duration_sec integer     NOT NULL
                 CONSTRAINT incidents_duration_ck CHECK (duration_sec > 0),

    -- Invariant 4, "no notch without a post-mortem", as a schema rule. NOT NULL
    -- alone does not carry it: an empty string satisfies NOT NULL and would put
    -- a red cell on the grid with nothing behind it. The rule is about text
    -- being there, not about a column being there.
    cause        text        NOT NULL
                 CONSTRAINT incidents_cause_present_ck CHECK (btrim(cause) <> ''),
    fix          text        NOT NULL
                 CONSTRAINT incidents_fix_present_ck CHECK (btrim(fix) <> ''),

    -- Points at an MDX entry in web/content/posts/. A foreign key is impossible
    -- across that boundary; checking that the file exists is a CI job (stage E).
    post_slug    text        NOT NULL
                 CONSTRAINT incidents_post_slug_shape_ck CHECK (post_slug ~ '^[0-9]{3}-[a-z0-9]+(-[a-z0-9]+)*$'),

    created_at   timestamptz NOT NULL DEFAULT now()
);

-- Serves SystemDetail.incidents:
--   SELECT id, started_at, duration_sec, cause, fix, post_slug FROM incidents
--    WHERE system_id = $1 AND started_at >= $2 ORDER BY started_at DESC
-- The primary key is a text identifier and orders alphabetically, not by time.
CREATE INDEX incidents_by_system_time_idx ON incidents (system_id, started_at DESC);

COMMENT ON INDEX incidents_by_system_time_idx IS
    'C4: SELECT ... FROM incidents WHERE system_id = $1 AND started_at >= $2 ORDER BY started_at DESC';

CREATE TABLE ops_days (
    system_id    bigint  NOT NULL REFERENCES systems (id) ON DELETE RESTRICT,
    day          date    NOT NULL,

    state        text    NOT NULL
                 CONSTRAINT ops_days_state_ck CHECK (state IN ('ok', 'degraded', 'outage', 'nodata')),

    -- Capped at a full day. The day boundary is UTC, so there is no 23- or
    -- 25-hour day to argue about at a clock change.
    down_sec     integer NOT NULL DEFAULT 0
                 CONSTRAINT ops_days_down_sec_ck CHECK (down_sec BETWEEN 0 AND 86400),

    -- Not in the contract. These two are the evidence behind `state`: without
    -- them the daily state would be an unbacked assertion sitting in an
    -- aggregate table, which is the thing this site objects to elsewhere. With
    -- them, invariant 6 becomes an equivalence the database enforces.
    checks_total integer NOT NULL DEFAULT 0
                 CONSTRAINT ops_days_checks_total_ck CHECK (checks_total >= 0),
    checks_up    integer NOT NULL DEFAULT 0
                 CONSTRAINT ops_days_checks_up_ck CHECK (checks_up >= 0 AND checks_up <= checks_total),

    incident_id  text    REFERENCES incidents (id) ON DELETE RESTRICT,
    computed_at  timestamptz NOT NULL DEFAULT now(),

    PRIMARY KEY (system_id, day),

    -- Invariant 6, both directions at once: a day with no measurement is
    -- `nodata`, and `nodata` is only ever a day with no measurement. Day one of
    -- the whole grid is nodata, and it can never quietly become `ok`.
    CONSTRAINT ops_days_nodata_iff_unmeasured_ck CHECK ((checks_total = 0) = (state = 'nodata')),
    CONSTRAINT ops_days_nodata_has_no_downtime_ck CHECK (state <> 'nodata' OR down_sec = 0)
);

-- There is deliberately NO constraint forcing an incident when state = 'outage'.
-- It looks like a gap in invariant 4 and is not one: C4 aggregates the outage
-- automatically, a human writes the post-mortem afterwards. The constraint would
-- keep the outage off the grid until the text existed — the site would hide a
-- failure in order to satisfy a rule about documenting failures. The obligation
-- lives in the NOT NULL trio on incidents and in the runbook.
COMMENT ON TABLE ops_days IS
    'Daily roll-up of ops_checks. checks_total = 0 is nodata, enforced both ways.';

-- No hand-written index. The primary key (system_id, day) is the 91-day window:
--   SELECT day, state, down_sec, incident_id FROM ops_days
--    WHERE system_id = $1 AND day > current_date - 91 ORDER BY day
-- A composite primary key leading with system_id serves that range scan whole.

CREATE TABLE ops_checks (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    system_id   bigint      NOT NULL REFERENCES systems (id) ON DELETE RESTRICT,

    -- The twin that carries handbook ch. 8. observed_at is when the probe ran,
    -- recorded_at is when this database learned about it. For a live probe they
    -- are seconds apart; for a row replayed from the ops-data branch after the
    -- host came back they are hours apart, and that gap IS the statement — the
    -- record of the outage outlived the system that was supposed to record it.
    observed_at timestamptz NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT now(),

    up          boolean     NOT NULL,
    latency_ms  integer
                CONSTRAINT ops_checks_latency_ck CHECK (latency_ms IS NULL OR latency_ms >= 0),
    reason      text,

    -- Where the row came from. 'probe' is POST /api/internal/probe while the
    -- host was up; 'backfill' is a line replayed from uptime-log.txt on the
    -- ops-data branch. source_ref then names the commit, so every backfilled
    -- row is traceable to something publicly checkable.
    origin      text        NOT NULL
                CONSTRAINT ops_checks_origin_ck CHECK (origin IN ('probe', 'backfill')),
    source_ref  text,

    -- Idempotency for the replay: the API re-reads uptime-log.txt after every
    -- restart, and ON CONFLICT DO NOTHING (F4) makes that free. One row per
    -- system and instant also means a backfill never overwrites a live probe.
    CONSTRAINT ops_checks_unique_observation UNIQUE (system_id, observed_at),

    CONSTRAINT ops_checks_no_latency_when_down_ck CHECK (up OR latency_ms IS NULL),
    CONSTRAINT ops_checks_reason_only_when_down_ck CHECK (reason IS NULL OR NOT up),
    CONSTRAINT ops_checks_backfill_cites_source_ck CHECK (origin <> 'backfill' OR source_ref IS NOT NULL)
);

-- No hand-written index. The unique constraint (system_id, observed_at) is what
-- the aggregation reads:
--   SELECT up, latency_ms FROM ops_checks
--    WHERE system_id = $1 AND observed_at >= $2 AND observed_at < $3
-- and a backwards scan on the same index answers "most recent check".

CREATE TABLE deploys (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    system_id    bigint      NOT NULL REFERENCES systems (id) ON DELETE RESTRICT,

    sha          text        NOT NULL
                 CONSTRAINT deploys_sha_shape_ck CHECK (sha ~ '^[0-9a-f]{7,40}$'),

    -- Reported by the pipeline itself, never estimated.
    duration_sec integer     NOT NULL
                 CONSTRAINT deploys_duration_ck CHECK (duration_sec >= 0),
    result       text        NOT NULL
                 CONSTRAINT deploys_result_ck CHECK (result IN ('ok', 'rollback')),

    -- The contract calls this `at`; a column named `at` is unreadable in any
    -- join, so the mapping happens in the query.
    deployed_at  timestamptz NOT NULL,
    recorded_at  timestamptz NOT NULL DEFAULT now(),

    -- A retried POST /api/internal/deploy must not produce a second bar.
    CONSTRAINT deploys_unique_event UNIQUE (system_id, sha, deployed_at)
);

-- Serves OpsSummary.lastDeploy and the deploy bars on the grid:
--   SELECT sha, duration_sec, result, deployed_at FROM deploys
--    WHERE system_id = $1 ORDER BY deployed_at DESC LIMIT 1
-- The unique constraint leads with sha in second position and cannot answer
-- "latest by time" without sorting the whole set.
CREATE INDEX deploys_by_system_time_idx ON deploys (system_id, deployed_at DESC);

COMMENT ON INDEX deploys_by_system_time_idx IS
    'C2/C4: SELECT ... FROM deploys WHERE system_id = $1 ORDER BY deployed_at DESC LIMIT 1';

-- +goose Down

DROP TABLE deploys;
DROP TABLE ops_checks;
DROP TABLE ops_days;
DROP TABLE incidents;
