-- Launch day: the grid exists and is empty. 91 cells, all `nodata`.
--
-- This is the state the site actually ships in, and the one most likely to be
-- got wrong in a hurry: a day without a measurement is `nodata`, never `ok` and
-- never 100 % (invariant 6). The schema already enforces the equivalence in both
-- directions — `(checks_total = 0) = (state = 'nodata')` — so this fixture is
-- what a correct empty grid looks like, and C4 has something to render against.
--
-- 91 and not 90: seven rows hold multiples of seven, 13 × 7 = 91. At 90 the last
-- column would have a hole that looks like a bug. The number has to stay
-- countable, so it is written as generate_series(0, 90) rather than as a literal.
--
-- Only for `live` systems. A queued system has no operational record to show,
-- and giving it an empty grid instead of no grid would be a different claim.
--
-- The day is the UTC date, not `current_date`, and incident.sql builds its
-- timestamps the same way. ops_days says the boundary is UTC so that there is no
-- 23- or 25-hour day to argue about at a clock change; a fixture that read the
-- session's time zone instead would line up on this machine and shift by one cell
-- on a machine set to anything else.

INSERT INTO ops_days (system_id, day, state, down_sec, checks_total, checks_up)
SELECT s.id, (now() AT TIME ZONE 'UTC')::date - n, 'nodata', 0, 0, 0
  FROM systems s
  CROSS JOIN generate_series(0, 90) AS n
 WHERE s.state = 'live';
