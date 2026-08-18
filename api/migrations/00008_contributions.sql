-- contributions_cache — the last good GitHub contribution calendar, and the one
-- table in this schema that holds data we did not produce. Handbook ch. 15.
--
-- Everything else here is a measurement or a curated fact, and losing a row of
-- it would lose something. This table is a cache: truncate it and the next tick
-- of the refresher builds it again. No foreign key points at it and it points at
-- nothing, so invariant 5 has no work to do here.
--
-- Why it is in Postgres at all, rather than a map in the process: the promise of
-- GET /api/contributions is that an unreachable GitHub gets answered with the
-- last good calendar and its age, not with an error. A process-local cache is
-- empty after every deploy, which is exactly the moment a visitor is most likely
-- to arrive — and two instances (E5) would answer the same URL with two
-- different ETags. ADR 0020.

-- +goose Up

CREATE TABLE contributions_cache (
    -- The GitHub login the calendar belongs to, and the whole key. One row per
    -- login, and in practice one row: GITHUB_LOGIN names it. Changing that
    -- variable leaves the old row behind — harmless, and written down in
    -- docs/runbooks/api.md so nobody hunts for a leak.
    login               text        PRIMARY KEY
                        CONSTRAINT contributions_cache_login_present_ck CHECK (btrim(login) <> ''),

    total_contributions integer     NOT NULL
                        CONSTRAINT contributions_cache_total_ck CHECK (total_contributions >= 0),

    -- The weeks array in the shape of the contract, not in GitHub's: the steps
    -- are l0..l4, never NONE..FOURTH_QUARTILE, and no GitHub colour value is
    -- carried at all. The translation happens once, in Go, at the moment the
    -- value is learned; the read path is a pass-through.
    --
    -- No CHECK on the contents. The coupling to components/schemas/
    -- ContributionLevel lives in the Go contract test, where it can read the
    -- served document — a CHECK list here would be a second copy of the enum
    -- with nothing holding the two together, which is the drift ADR 0010 pays
    -- to avoid rather than the drift it accepts.
    weeks               jsonb       NOT NULL
                        CONSTRAINT contributions_cache_weeks_shape_ck
                            CHECK (jsonb_typeof(weeks) = 'array' AND jsonb_array_length(weeks) > 0),

    -- Postgres's clock, never the Go process's. cacheAgeSec is derived from this
    -- on every read, and with two instances this is the only clock both of them
    -- can agree on. An empty calendar never reaches this table (see the CHECK
    -- above and the refuse-empty rule in internal/contributions), so a row here
    -- is always a calendar somebody could honestly show.
    fetched_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE contributions_cache IS
    'The last good GitHub calendar. The only table here that may be truncated without loss.';

-- No index beyond the primary key. The only query is a lookup by login against a
-- table with one row; anything more would be machinery for a sequential scan of
-- a single tuple.

-- +goose Down

DROP TABLE contributions_cache;
