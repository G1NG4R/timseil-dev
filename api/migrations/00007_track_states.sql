-- v_track_states — the derivation. Invariant 2, ADR 0003, build plan phase B3.
--
-- This is the hole that 00003_training.sql left open on purpose. A track has no
-- state column; its state is counted from the systems that prove it, here, once,
-- in SQL. Neither Go nor TypeScript recomputes it — `docs/design/code/tokens.ts`
-- carries a `skillState()` for rendering, and track_states_db_test.go holds the
-- two against each other over a thousand generated evidence constellations.
--
-- Four decisions worth the reading time:
--
--   LEFT JOIN, twice. With an inner join a track without evidence would not be
--   `queued` — it would be ABSENT. Nine of the twenty-two tracks are self-study
--   at launch, and dropping them would make the log look fuller than it is by
--   hiding the honest rows. The contract calls the empty evidence array "the
--   honest case"; this is where it either survives or does not.
--
--   security_invoker. Without it a view runs with the rights of its owner, and
--   the owner here is timseil_migrate — the role that may do anything. The app
--   role would then read the base tables through this view with borrowed
--   privileges, which is a door around ADR 0011. It changes nothing today
--   (timseil_app may read all three tables anyway) and everything on the day
--   somebody narrows those grants.
--
--   COUNT(DISTINCT s.id) is redundant right now: track_evidence_unique_pair
--   already forbids two rows for the same pair. It stays because ADR 0003 spells
--   it that way and because it survives the removal of that constraint.
--
--   No materialised view. ADR 0003, "Was das kostet": a materialised view needs
--   a named refresh time, and without one it is a claim with an expiry date. At
--   22 tracks and two systems the recomputation is not measurable.
--
-- The counters are part of the view, not a by-product. They let the test check
-- the counting separately from the CASE — a miscounted FILTER that happens to
-- land on the right state would otherwise pass — and they let C3 print
-- "1 live system" without doing the arithmetic a second time.

-- +goose Up

CREATE VIEW v_track_states WITH (security_invoker = true) AS
SELECT
    t.id AS track_id,
    COUNT(DISTINCT s.id) FILTER (WHERE s.state = 'live')     AS live_systems,
    COUNT(DISTINCT s.id) FILTER (WHERE s.state = 'in_build') AS building_systems,
    CASE
        WHEN COUNT(DISTINCT s.id) FILTER (WHERE s.state = 'live')     >= 2 THEN 'core'
        WHEN COUNT(DISTINCT s.id) FILTER (WHERE s.state = 'live')      = 1 THEN 'applied'
        WHEN COUNT(DISTINCT s.id) FILTER (WHERE s.state = 'in_build')  > 0 THEN 'learning'
        ELSE 'queued'
    END AS state
FROM tracks t
LEFT JOIN track_evidence e ON e.track_id = t.id
LEFT JOIN systems s        ON s.id = e.system_id
GROUP BY t.id;

COMMENT ON VIEW v_track_states IS
    'Derived track states. There is no tracks.state column, by design (ADR 0003).';

-- +goose Down

DROP VIEW v_track_states;
