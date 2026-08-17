-- Nothing left. Every set starts here, so loading one is independent of whatever
-- the test before it did.
--
-- DELETE, not TRUNCATE: timseil_app may do the first and not the second, and the
-- fixtures run as the same role as the application. A fixture that needed more
-- privileges than the code under test would be testing a different program.
--
-- The order is the foreign keys read backwards. ops_days points at both systems
-- and incidents, so it goes before both; everything points at systems, so
-- systems goes last. All of these are ON DELETE RESTRICT — getting the order
-- wrong fails loudly here rather than hiding behind a CASCADE.

DELETE FROM ops_days;
DELETE FROM incidents;
DELETE FROM ops_checks;
DELETE FROM deploys;
DELETE FROM metric_snapshots;
DELETE FROM track_evidence;
DELETE FROM tracks;
DELETE FROM modules;
DELETE FROM systems;

-- Stands alone, and is the only table here holding personal data. A fixture
-- never writes a row into it; emptying it is so that a test which does cannot
-- leak into the next one.
DELETE FROM contact_messages;
