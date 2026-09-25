-- The curated content of this site: two systems, six modules, 14 tracks and the
-- 19 evidence rows that back them. Handbook ch. 10 and 11, build plan B4, and
-- the reseed of stage U3 around talos-prod (ADR 0079).
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

-- ----------------------------------------------------------- training tree

-- The tree is emptied FIRST, before the one system that goes away. Not for its
-- own sake: it leaves `vat-check` provably unreferenced by track_evidence, so
-- the DELETE below can only fail on an operational table. That failure is the
-- one worth having — see the comment on it.
DELETE FROM track_evidence;
DELETE FROM tracks;
DELETE FROM modules;

-- ------------------------------------------------------------------ systems

-- U3 retires `vat-check`: specified, never written, and for two stages the site
-- carried it as system 01. `system_no` is NOT NULL UNIQUE and not deferrable, so
-- '01' cannot move to talos-prod while the old row still holds it — the delete
-- has to come before the upsert, not after.
--
-- Every remaining reference to it is ON DELETE RESTRICT, and that is deliberate
-- here rather than something to work around: if a measurement ever landed
-- against this slug, the whole transaction rolls back and the operational record
-- survives. A seed that quietly dropped one would be the exact failure the rest
-- of this file argues against. Invariant 5.
DELETE FROM systems WHERE slug = 'vat-check';

WITH declared (slug, system_no, name, state, source_access, source_url, source_reason) AS (
    VALUES
        -- 01 · in_build, not live: nothing public runs on the cluster yet, so the
        -- probe measures nothing, and invariant 3 gives metrics only to `live`.
        -- A `live` without a series would be the first invented number on this
        -- site. The repository is private, so the source axis carries a reason
        -- rather than a URL that answers 404 — and there is no case study, which
        -- is why /work/talos-prod is a 404 too. ADR 0079.
        ('talos-prod',  '01', 'talos-prod',  'in_build', 'private',
         NULL, 'internal'),
        ('timseil-dev', '02', 'timseil.dev', 'live',     'public',
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

-- ------------------------------------------------------- modules and tracks

-- Six modules along what the cluster actually does, replacing the five that
-- described a curriculum. The old tree carried 22 tracks and nine of them had no
-- evidence at all; `queued` was not a stage, it was a plan. ADR 0079 §5.
INSERT INTO modules (module_no, title) VALUES
    ('01', 'Platform'),
    ('02', 'Network'),
    ('03', 'Delivery'),
    ('04', 'Observability'),
    ('05', 'Data & backup'),
    ('06', 'Workflow');

-- sort_order is the order of the design sheet. Without it the API would sort by
-- name and rebuild the log into something the sheet never showed.
--
-- The names stay at component level on purpose. `Cluster networking` is not a
-- softer way of saying something more specific: ADR 0079 rules out the network
-- layout itself, in every sentence and every stage of U, and a track name is a
-- sentence on a public page. Unsure counts as yes.
INSERT INTO tracks (module_id, name, sort_order)
SELECT m.id, d.name, d.sort_order
  FROM (VALUES
        ('01', 'Kubernetes (Talos)',                    1),

        ('02', 'Cluster networking',                    1),
        ('02', 'Load balancing',                        2),
        ('02', 'Ingress & TLS',                         3),
        ('02', 'Edge tunnel',                           4),

        ('03', 'GitOps (Flux)',                         1),
        ('03', 'Secrets (SOPS)',                        2),
        ('03', 'CI (GitHub Actions)',                   3),
        ('03', 'Containers (Docker)',                   4),

        ('04', 'Metrics & alerts',                      1),
        ('04', 'Logs',                                  2),

        ('05', 'PostgreSQL',                            1),
        ('05', 'Backups',                               2),

        ('06', 'AI-assisted engineering (Claude Code)', 1)
       ) AS d (module_no, name, sort_order)
  JOIN modules m ON m.module_no = d.module_no;

-- The 19 evidence rows, across BOTH systems, so the header of the log now reads
-- EVIDENCE: 02 SYSTEMS. `detail` is lowercase because the API is lowercase and
-- the interface uppercases (handbook ch. 14).
--
-- Every line here has to be true of something that runs, and every line is a
-- component name. What a detail must never become is a description of how the
-- cluster is reached or cut up — that belongs in backlog.local.md and nowhere
-- near a page. ADR 0079.
--
-- What comes out of v_track_states from these rows, with talos-prod `in_build`
-- and timseil.dev `live`: six tracks LEARNING (the ones only the cluster backs),
-- eight APPLIED, none CORE. CORE needs two live systems under one track, and
-- that is what the cutover in U9 is for.
INSERT INTO track_evidence (track_id, system_id, detail)
SELECT t.id, s.id, d.detail
  FROM (VALUES
        ('01', 'Kubernetes (Talos)',  'talos-prod',  'bare metal'),

        ('02', 'Cluster networking',  'talos-prod',  NULL),
        ('02', 'Load balancing',      'talos-prod',  'metallb'),
        ('02', 'Ingress & TLS',       'talos-prod',  'traefik, cert-manager'),
        ('02', 'Ingress & TLS',       'timseil-dev', 'traefik'),
        ('02', 'Edge tunnel',         'talos-prod',  'cloudflare tunnel'),

        ('03', 'GitOps (Flux)',       'talos-prod',  NULL),
        ('03', 'Secrets (SOPS)',      'talos-prod',  'sops + age'),
        ('03', 'CI (GitHub Actions)', 'timseil-dev', 'build + deploy'),
        ('03', 'Containers (Docker)', 'timseil-dev', 'compose via dokploy'),

        ('04', 'Metrics & alerts',    'talos-prod',  'kube-prometheus-stack'),
        ('04', 'Metrics & alerts',    'timseil-dev', 'prometheus, grafana'),
        ('04', 'Logs',                'timseil-dev', 'loki, alloy'),

        ('05', 'PostgreSQL',          'talos-prod',  'cloudnativepg'),
        ('05', 'PostgreSQL',          'timseil-dev', 'systems, training, ops data'),
        ('05', 'Backups',             'talos-prod',  'velero, etcd snapshots'),
        ('05', 'Backups',             'timseil-dev', 's3'),

        ('06', 'AI-assisted engineering (Claude Code)', 'timseil-dev', 'claude.md, invariants, ci gates'),
        ('06', 'AI-assisted engineering (Claude Code)', 'talos-prod',  'claude as tutor')
       ) AS d (module_no, track_name, system_slug, detail)
  JOIN modules m ON m.module_no = d.module_no
  JOIN tracks  t ON t.module_id = m.id AND t.name = d.track_name
  JOIN systems s ON s.slug = d.system_slug;
