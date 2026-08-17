-- The curated content of this site: two systems, five modules, 22 tracks and
-- the 13 evidence rows that back them. Handbook ch. 10 and 11, build plan B4.
--
-- What is NOT here is the point of the file. No ops_checks, no ops_days, no
-- incidents, no deploys, no metric_snapshots. Those are measurements, and a
-- measurement that a seed writes is an invented number — invariant 1. timseil.dev
-- is `live` and still shows `— NO DATA` in every tile on day one, because on day
-- one nothing has been measured yet. The probe fills them (C7, F4).
--
-- Two different update strategies, and the difference is deliberate:
--
--   systems are UPSERTED. Their ids are referenced by ops_checks, ops_days,
--   incidents, deploys and metric_snapshots with ON DELETE RESTRICT. Replacing
--   a row would either fail or throw away the operational record.
--
--   the training tree is REPLACED wholesale. Nothing outside it references its
--   ids — the contract exposes no track id, and track_evidence cascades from
--   tracks. So delete-then-insert lets the content be declared exactly once.
--   The alternative, an upsert plus a "delete what is no longer declared" list,
--   states every track twice and drifts the day someone edits one copy.
--
-- systems.stack is not set here. api/internal/seed injects it from
-- stack.gen.json, so no version number is ever typed into this file either.

-- ------------------------------------------------------------------ systems

WITH declared (slug, system_no, name, state, source_access, source_url, source_reason) AS (
    VALUES
        -- 01 · queued: specified, not written. No repository yet, so the source
        -- axis is private with a reason rather than a URL that answers 404.
        ('vat-check',   '01', 'VAT Check API', 'queued', 'private',
         NULL, 'internal'),
        ('timseil-dev', '02', 'timseil.dev',   'live',   'public',
         'https://github.com/G1NG4R/timseil-dev', NULL)
)
INSERT INTO systems (slug, system_no, name, state, source_access, source_url, source_reason)
SELECT slug, system_no, name, state, source_access, source_url, source_reason
  FROM declared
ON CONFLICT (slug) DO UPDATE SET
    system_no     = EXCLUDED.system_no,
    name          = EXCLUDED.name,
    state         = EXCLUDED.state,
    source_access = EXCLUDED.source_access,
    source_url    = EXCLUDED.source_url,
    source_reason = EXCLUDED.source_reason;

-- ----------------------------------------------------------- training tree

DELETE FROM track_evidence;
DELETE FROM tracks;
DELETE FROM modules;

INSERT INTO modules (module_no, title) VALUES
    ('01', 'Languages'),
    ('02', 'Backend'),
    ('03', 'Data'),
    ('04', 'DevOps'),
    ('05', 'Foundations');

-- sort_order is the order of the design sheet. Without it the API would sort by
-- name and rebuild the log into something the sheet never showed.
INSERT INTO tracks (module_id, name, sort_order)
SELECT m.id, d.name, d.sort_order
  FROM (VALUES
        ('01', 'Go',                                1),
        ('01', 'TypeScript',                        2),
        ('01', 'Python',                            3),
        ('01', 'SQL',                               4),
        ('01', 'C',                                 5),

        ('02', 'HTTP servers & JSON APIs (Go/TS)',  1),
        ('02', 'Auth (JWT)',                        2),
        ('02', 'Webhooks',                          3),
        ('02', 'Pub/sub (RabbitMQ)',                4),
        ('02', 'Cryptography fundamentals',         5),

        ('03', 'PostgreSQL',                        1),
        ('03', 'SQLite',                            2),
        ('03', 'Caching',                           3),

        ('04', 'Linux',                             1),
        ('04', 'Docker',                            2),
        ('04', 'Kubernetes',                        3),
        ('04', 'CI/CD (GitHub Actions)',            4),
        ('04', 'AWS (S3 + CloudFront)',             5),
        ('04', 'Logging & observability',           6),

        ('05', 'Git',                               1),
        ('05', 'Data structures & algorithms',      2),
        ('05', 'OOP & functional programming',      3)
       ) AS d (module_no, name, sort_order)
  JOIN modules m ON m.module_no = d.module_no;

-- The 13 evidence rows. All of them point at 02 timseil.dev, so the header of
-- the log reads EVIDENCE: 01 SYSTEM — one system, and the log says so instead of
-- rounding it up. `detail` is lowercase because the API is lowercase and the
-- interface uppercases (handbook ch. 14).
--
-- Every line here has to be true of something that runs. The design sheet had a
-- 14th shape, `SQLite → (OPS METRICS AGGREGATE)`, left over from the draft that
-- predates ADR 0005 and 0007: this site stores its metrics in Postgres and has
-- no SQLite anywhere. Caching carries that evidence instead, and SQLite moved to
-- the tracks without a system, where it is honest.
INSERT INTO track_evidence (track_id, system_id, detail)
SELECT t.id, s.id, d.detail
  FROM (VALUES
        ('01', 'Go',                               'timseil-dev', 'api, health endpoint'),
        ('01', 'TypeScript',                       'timseil-dev', 'frontend'),
        ('01', 'SQL',                              'timseil-dev', 'schema, views, migrations'),

        ('02', 'HTTP servers & JSON APIs (Go/TS)', 'timseil-dev', '/api/health, /api/contact'),
        ('02', 'Webhooks',                         'timseil-dev', 'deploy on push'),

        ('03', 'PostgreSQL',                       'timseil-dev', 'systems, training, ops data'),
        ('03', 'Caching',                          'timseil-dev', 'http cache headers, contribution cache'),

        ('04', 'Linux',                            'timseil-dev', 'vps, all services'),
        ('04', 'Docker',                           'timseil-dev', 'compose via dokploy'),
        ('04', 'CI/CD (GitHub Actions)',           'timseil-dev', 'build + deploy'),
        ('04', 'AWS (S3 + CloudFront)',            'timseil-dev', 's3 backups only, no cdn'),
        ('04', 'Logging & observability',          'timseil-dev', 'alloy, prometheus, loki, grafana'),

        ('05', 'Git',                              'timseil-dev', 'one repo')
       ) AS d (module_no, track_name, system_slug, detail)
  JOIN modules m ON m.module_no = d.module_no
  JOIN tracks  t ON t.module_id = m.id AND t.name = d.track_name
  JOIN systems s ON s.slug = d.system_slug;
