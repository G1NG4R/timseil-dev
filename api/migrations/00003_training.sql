-- modules, tracks, track_evidence — the training log. Handbook ch. 10.
--
-- 22 tracks in five modules. The interesting thing about this file is what is
-- NOT in it.
--
-- tracks HAS NO STATE COLUMN. The state of a track is derived from its evidence
-- by the view v_track_states (B3, ADR 0003): >= 2 live systems is `core`, one is
-- `applied`, an in_build system is `learning`, nothing is `queued`. A column
-- here would be a claim; a derivation is a measurement, and this site's one rule
-- is that every claim is bound to a piece of evidence. Adding the column later
-- means having misread the design — CLAUDE.md says so, ADR 0003 says why, and
-- tools/check-migrations.sh refuses the patch.

-- +goose Up

CREATE TABLE modules (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    module_no  text        NOT NULL UNIQUE
               CONSTRAINT modules_no_shape_ck CHECK (module_no ~ '^[0-9]{2}$'),
    title      text        NOT NULL
               CONSTRAINT modules_title_present_ck CHECK (btrim(title) <> ''),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tracks (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    module_id  bigint      NOT NULL REFERENCES modules (id) ON DELETE RESTRICT,
    name       text        NOT NULL
               CONSTRAINT tracks_name_present_ck CHECK (btrim(name) <> ''),

    -- Display order inside the module. Without it the API would have to sort by
    -- name and would rebuild the order of the design sheet into something else.
    sort_order smallint    NOT NULL
               CONSTRAINT tracks_sort_order_ck CHECK (sort_order > 0),

    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT tracks_name_unique_per_module UNIQUE (module_id, name),

    -- DEFERRABLE so that B4 can renumber a module inside one transaction.
    -- Without it, swapping two positions collides on the first UPDATE.
    CONSTRAINT tracks_order_unique_per_module UNIQUE (module_id, sort_order)
               DEFERRABLE INITIALLY DEFERRED
);

COMMENT ON TABLE tracks IS
    'No state column, by design. States are derived in v_track_states (B3, ADR 0003).';

CREATE TABLE track_evidence (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- CASCADE towards the track: the evidence line belongs to the track, and a
    -- track that goes away takes its own lines with it.
    track_id   bigint      NOT NULL REFERENCES tracks (id) ON DELETE CASCADE,

    -- RESTRICT towards the system, and this asymmetry is invariant 5. A deleted
    -- system that leaves a track state standing is exactly the lie this
    -- construction exists to prevent, so the database refuses the delete.
    system_id  bigint      NOT NULL REFERENCES systems (id) ON DELETE RESTRICT,

    -- The parenthesis in "SHIPPED IN -> 02 TIMSEIL.DEV (BUILD + DEPLOY)".
    -- Optional per the contract; an empty string would render an empty pair of
    -- brackets, so it is either absent or it says something.
    detail     text
               CONSTRAINT track_evidence_detail_present_ck CHECK (detail IS NULL OR btrim(detail) <> ''),

    created_at timestamptz NOT NULL DEFAULT now(),

    -- One line per pair. COUNT(DISTINCT s.id) in the view would not notice a
    -- duplicate, but C3 would render the same system twice under one track.
    CONSTRAINT track_evidence_unique_pair UNIQUE (track_id, system_id)
);

-- No index on track_evidence.system_id, and that is a decision rather than an
-- omission. Postgres does not index the referencing side of a foreign key, so
-- the ON DELETE RESTRICT check above scans this table — over 13 rows that is
-- the right plan. The queries that would want it are
--   SELECT ... FROM track_evidence WHERE system_id = $1        -- C3 header count
--   SELECT ... FROM tracks LEFT JOIN track_evidence ...        -- B3 view
-- and both are seq scans at this size. Revisit when a third system lands.

-- +goose Down

DROP TABLE track_evidence;
DROP TABLE tracks;
DROP TABLE modules;
