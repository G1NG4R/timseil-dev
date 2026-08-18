-- The two queries behind GET /api/contributions and the refresher that feeds it.
--
-- One reads the cache, one replaces it. Nothing here decides anything: the
-- translation from GitHub's quartile names to this site's five steps happens in
-- Go, before the row is written, and the read path hands the stored array back
-- untouched.
--
-- Both of them get their time from Postgres. The age of the calendar is the one
-- number on this endpoint a visitor is asked to trust — "from cache, 3 h old" is
-- only honest if the two ends of that subtraction come off the same clock, and
-- with two instances (E5) the database is the only clock they share.

-- GetContributions returns the calendar together with its age.
--
-- cache_age_sec is computed here rather than in the handler, so internal/
-- contributions needs no injected clock at all — a departure from internal/
-- systems and internal/training, and the reason is the line above.
--
-- GREATEST(0, ...) is not decoration. fetched_at is written by now() and should
-- never be in the future, but a restored dump, a clock stepped backwards or a row
-- edited by hand all produce one, and a negative age is a number nobody measured.
-- Clamping to zero says "just fetched", which is the least wrong thing available.
--
-- The ::int cast is what keeps sqlc honest: EXTRACT returns numeric, and a
-- numeric here would arrive in Go as a pgtype the contract has no room for —
-- cacheAgeSec is an integer.
--
-- name: GetContributions :one
SELECT
       total_contributions,
       weeks,
       fetched_at,
       GREATEST(0, EXTRACT(EPOCH FROM now() - fetched_at))::int AS cache_age_sec
  FROM contributions_cache
 WHERE login = sqlc.arg(login);

-- UpsertContributions replaces the whole calendar in one statement.
--
-- There is no partial update and there is no delete. The refresher writes only
-- when it holds a complete, non-empty calendar (an empty one is refused before
-- it gets this far — invariant 1), so this statement moves the row from one good
-- state to another good state and never through a bad one. A failed fetch never
-- reaches here at all, which is what makes "GitHub is down" show the last good
-- calendar instead of an error.
--
-- fetched_at is now() and not a parameter, for the reason in the header: the
-- moment that matters is the moment this row became true, measured by the
-- database that stores it.
--
-- name: UpsertContributions :exec
INSERT INTO contributions_cache (login, total_contributions, weeks, fetched_at)
VALUES (sqlc.arg(login), sqlc.arg(total_contributions), sqlc.arg(weeks), now())
    ON CONFLICT (login) DO UPDATE
   SET total_contributions = EXCLUDED.total_contributions,
       weeks               = EXCLUDED.weeks,
       fetched_at          = EXCLUDED.fetched_at;
