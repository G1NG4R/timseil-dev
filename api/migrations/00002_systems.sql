-- systems — the core table. Handbook ch. 10, "systems".
--
-- Two independent axes, and keeping them apart is the whole point. `state`
-- describes operation, `source_access` describes who may read the code. A
-- system can be open and not running, or running and closed; squeezing both
-- into one field is the classic modelling mistake, and you notice it when the
-- first NDA client arrives.
--
-- State values are text with a CHECK rather than a Postgres enum. The contract
-- is the single truth about these values (ADR 0010): an enum type would make
-- sqlc generate a second Go type for the same set, and tools/check-migrations.sh
-- holds the CHECK lists against contract/openapi.yaml so the two cannot drift.

-- +goose Up

CREATE TABLE systems (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- The public identifier. Every /api/systems/{slug} call arrives with this,
    -- and the pattern is the contract's Slug parameter, character for character.
    slug          text        NOT NULL UNIQUE
                  CONSTRAINT systems_slug_shape_ck CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),

    -- Two digits, zero padded, and stored as text on purpose: as an integer the
    -- leading zero would have to be reconstructed in Go, which makes formatting
    -- code a second source of truth about how a system is named.
    system_no     text        NOT NULL UNIQUE
                  CONSTRAINT systems_no_shape_ck CHECK (system_no ~ '^[0-9]{2}$'),

    name          text        NOT NULL
                  CONSTRAINT systems_name_present_ck CHECK (btrim(name) <> ''),

    state         text        NOT NULL
                  CONSTRAINT systems_state_ck CHECK (state IN ('live', 'in_build', 'queued')),

    source_access text        NOT NULL
                  CONSTRAINT systems_source_access_ck CHECK (source_access IN ('public', 'private')),
    source_url    text
                  CONSTRAINT systems_source_url_shape_ck CHECK (source_url IS NULL OR source_url ~ '^https://'),
    source_reason text
                  CONSTRAINT systems_source_reason_ck CHECK (source_reason IS NULL OR source_reason IN ('nda', 'internal')),

    -- text[], not jsonb. The handbook, build plan ch. 12.3 and the frozen
    -- contract all say string[]; drift protection lives in stack.yaml plus the
    -- CI comparison against go.mod and package.json (B4), not in the column
    -- shape. An empty string in here would render as a nameless entry.
    stack         text[]      NOT NULL DEFAULT '{}'
                  CONSTRAINT systems_stack_no_blanks_ck CHECK (NOT ('' = ANY (stack))),

    created_at    timestamptz NOT NULL DEFAULT now(),

    -- The source axis, stricter than the handbook sketch: that one only requires
    -- the matching field to be present, this one also forbids the other. It
    -- mirrors the contract's oneOf exactly and keeps the URL of a closed system
    -- from being stored at all. "<> PRIVATE · NDA" is an honest statement;
    -- "<> PRIVATE" with no reason would be an excuse, so the schema refuses it.
    CONSTRAINT systems_source_axis_ck CHECK (
           (source_access = 'public'  AND source_url    IS NOT NULL AND source_reason IS NULL)
        OR (source_access = 'private' AND source_reason IS NOT NULL AND source_url    IS NULL)
    )
);

-- Deliberately absent: uptime_90d, p95_ms, error_rate. Metrics are a time
-- series and live in metric_snapshots; C2 reads the most recent row per system.
-- A metric column here would be a value with no measurement time, which is the
-- one thing invariant 1 forbids.
COMMENT ON TABLE systems IS
    'One row per system this site tracks. No metric columns: see metric_snapshots.';

-- No hand-written index. slug and system_no each carry a unique constraint, and
-- those indexes serve every lookup the contract has:
--   SELECT ... FROM systems WHERE slug = $1              -- GET /api/systems/{slug}
--   SELECT ... FROM systems ORDER BY system_no           -- GET /api/systems
-- The ordering scan over two rows is a seq scan and correctly so.

-- +goose Down

DROP TABLE systems;
