# timseil.dev

A backend and DevOps portfolio that runs on the stack it describes and measures
itself by the rules it explains. The site is its own reference system.

[![ci](https://github.com/G1NG4R/timseil-dev/actions/workflows/ci.yml/badge.svg)](https://github.com/G1NG4R/timseil-dev/actions/workflows/ci.yml)

<!--
Live badges (build plan 12.4) read https://timseil.dev/api/badge/*. Since C7 the
three endpoints exist and answer, and since the first deploy the domain
resolves — so both of the original reasons to keep them off are gone. What is
left is a sequencing one: uptime is measured by the probe in F4, and a badge
reading 91 days of nothing is worse than no badge. They get switched on in
phase M6, tracked by the issue "docs: enable the live badges in the README".

The ci badge above is a different kind: it reports this repository's own
pipeline, it is true from the first run, and it needs nothing that is not built
yet.

![uptime](https://img.shields.io/endpoint?url=https://timseil.dev/api/badge/uptime)
![version](https://img.shields.io/endpoint?url=https://timseil.dev/api/badge/version)
![systems](https://img.shields.io/endpoint?url=https://timseil.dev/api/badge/systems)
-->

> **Status:** in build — stage E of 13, phase E2. The site is deployed and
> answering at [timseil.dev](https://timseil.dev); `/api/health` is the shortest
> way to check that for yourself. The pipeline that gets code there is being
> built now: every gate in `make check` runs on every pull request, alongside
> static analysis, dependency and secret scanning — the push to the registry
> does not yet. See [the build plan](docs/build-plan.md) (German).

## The one rule

**Every claim is tied to evidence, and the evidence is a running system.**

That rule has teeth, because the boring cases are where portfolios lie:

- No invented numbers. `*float64` in Go, `number | null` in TypeScript.
  `null` renders as `— NO DATA`, never as `0`.
- Metrics exist only for systems in state `live`.
- Skill states are **derived in SQL**, never stored. Two live systems make a
  skill `core`, one makes it `applied`. There is no column to set by hand.
- A day without a measurement is `nodata` — not 100 %.
- No incident notch without a post-mortem. Cause, fix and post are `NOT NULL`.

At launch that means the site shows **zero** `core` skills, because only one
system will be live. That is the point, not a defect.

## Checkable from the outside

The read API is public and documented ([ADR 0004](docs/adr/0004-public-read-api.md)).
Once it is live, this returns the same numbers the pages render:

```bash
curl https://timseil.dev/api/systems
```

If a number on the site is not in that response, it is an invention — and anyone
can tell. That is the whole thesis, and it is why the API is not behind a key.

The contract itself is readable at **`/api/docs`**, rendered from
`contract/openapi.yaml`. It is served from the API binary, so opening it pulls
nothing from a CDN — the same rule the privacy page states applies to the
documentation page.

## One contract, generated types

`contract/openapi.yaml` is the only place an API type is written down:

```
openapi.yaml ─┬→ oapi-codegen        → api/internal/httpx/gen.go
              ├→ openapi-typescript  → web/lib/api/schema.d.ts
              └→ redocly bundle      → contract/openapi.public.yaml → /api/docs
```

`make gen` writes all three and `make check` fails if the committed result differs,
so the contract and the code cannot drift apart quietly. **Never hand-write a type
that lives in the contract** — if it does not fit, the contract is wrong.

Two details worth knowing before editing it:

- Every metric is `number | null` in TypeScript and `*float64` in Go. That is one
  statement in two languages: the value can be missing, and you have to handle it.
  With `strictNullChecks` the compiler enforces it, and the empty case renders
  `— NO DATA` rather than a zero.
- Operations marked `x-internal: true` are stripped from the document `/api/docs`
  serves. They stay in the contract so their types are generated and so the router
  parity check can see them — but adding one **without** the marker publishes it.

## Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 16.3 LTS · React 19.2 · TypeScript strict · Tailwind 4.3 |
| Backend | Go 1.26 stdlib · pgx v5 · sqlc · goose · OpenTelemetry |
| Data | PostgreSQL 18.6 |
| Contract | OpenAPI 3.1 — types are generated, never hand-written |
| Infra | Docker Compose · Traefik via Dokploy · one OVH VPS · Node 24 LTS |
| CI/CD | GitHub Actions · GHCR |
| Observability | Grafana Alloy · Prometheus 3.13 LTS · Loki 3.7 · Grafana |

No CDN, no WAF, no tracker, no CMS, no Kubernetes, no Redis. Each omission has a
reason written down — that is what `docs/adr/` is for.

## Architecture

- [C4 context](docs/architecture/c4-context.md) — who talks to this system
- [C4 container](docs/architecture/c4-container.md) — what runs on the host, and
  what is reachable from outside

Short version: Traefik terminates TLS, Next.js renders, **Go owns the database,
the contract and every derivation**, Postgres stores it. Prometheus measures,
Postgres serves — so the site keeps showing the last valid value with its age
when the metrics stack is down, instead of inventing a zero.

## Quickstart

Requires Node 24 (see `.nvmrc`), Go 1.26, Docker with Compose, GNU Make and a
POSIX shell.

```bash
git clone https://github.com/G1NG4R/timseil-dev.git
cd timseil-dev
git config core.hooksPath .githooks   # arms the commit and push hooks
make deps                             # web dependencies; make check needs them
make check                            # every check that applies today
cp .env.example .env                  # local values, none of them secret
make env-secrets                      # three throwaway values the api requires
make dev                              # postgres + migrations + seed + api + web
make design                           # design handoff on http://localhost:4000
make images && make check-images      # the two images that actually ship
make check-topology                   # the production compose, from an empty volume
```

`make dev` applies the schema and the content before the API starts, so a cold
clone comes up with a working database in one command. To run either on its own,
`make migrate` and `make seed`; `make migrate-status` says what is applied.

`make dev` gives you five containers — two of which run once and exit — and two
URLs:

| URL | What |
|---|---|
| <http://localhost:3000> | the web app, `next dev` |
| <http://localhost:8080/healthz> | the API is alive |
| <http://localhost:8080/readyz> | the API can reach Postgres — `503` when it cannot |
| <http://localhost:8080/api/health> | build identity and operational numbers |
| <http://localhost:8080/api/systems> | every tracked system, its source and its metrics |
| <http://localhost:8080/api/systems/timseil-dev> | one system with its 91-day operation grid |
| <http://localhost:8080/api/training> | the training log, with every track state derived from evidence |
| <http://localhost:8080/api/docs> | the API contract, rendered |

Both ports are bound to `127.0.0.1`. **Postgres publishes no port at all**: it is
reachable inside the docker network and nowhere else, which is the same rule that
applies in production. To get a shell on it:

```bash
docker compose -f compose.dev.yaml exec db psql -U timseil_boot -d timseil
```

`make dev-down` stops the stack, `make dev-reset` also drops the database volume
so the next start is a cold one.

**Postgres runs with two roles, not one.** `timseil_migrate` owns the schema and
is the only role allowed to run DDL; `timseil_app` — the one the API connects
with — may only read and write rows. An SQL injection in a handler therefore
cannot drop a table ([ADR 0011](docs/adr/0011-postgres-roles-bootstrap-and-privileges.md)).
Both roles are created when the database volume is first initialised, which means
**an existing volume needs `make dev-reset` once** or `make migrate` will report
that the role does not exist.

`make check-db` proves that: it cycles the migrations up, down and up three
times against a throwaway database and feeds every constraint the value it is
supposed to refuse. It needs Docker, so it is not part of `make check`.

**Skill states are counted, not stored.** There is no `tracks.state` column; a
track is `core` when two systems that prove it are live, `applied` at one,
`learning` while one is still being built, and `queued` otherwise — derived in
the view `v_track_states` ([ADR 0003](docs/adr/0003-track-states-as-sql-view.md)).
`make check-db` generates a thousand evidence constellations and checks every one
of them against the design handoff's own reference implementation, so the
database and the page cannot come to different conclusions about the same
person.

**The seed carries content, never measurements.** `make seed` writes two systems,
five modules, 22 tracks and the 13 evidence rows that back them — and not one row
of operational data. So `timseil.dev` is `live` from the first run and still reads
`— NO DATA` in every metric tile, because on day one nothing has been measured.
Counting it out: 13 tracks `applied`, 9 `queued`, none `core`. None `core` is the
strict reading and the intended one — building something once means getting it to
run once, and running it twice is a different claim
([ADR 0013](docs/adr/0013-seed-is-content-not-measurement.md)).

**No version number is typed onto a page.** `stack.yaml` names what is worth
showing and points at the file that declares each version; `make gen` reads them
out of `go.mod`, `package.json` and the compose file. Two guards, and they say
different things: `make check-stack` names the entry that stopped resolving, and
`make check` names the generated file that went stale — so bumping a dependency
without regenerating is a red check rather than a page showing last week's version
([ADR 0012](docs/adr/0012-stack-manifest-resolved-at-gen-time.md)).

`make help` lists all targets. **Targets that belong to a later phase say so and
exit instead of pretending they checked something** — `make e2e` arrives before
stage H. That is deliberate: a quickstart that lies is the failure mode this
project is built to avoid, so since stage E2 two checks keep this section
honest. `make check-readme` asserts that every target named above exists, on
every pull request; `make quickstart` clones the repository and runs the block
above for real on every push to `main` and once a week, then fetches every URL
listed below it.

**What ships is not what you develop against.** `make dev` builds two
convenience containers — air around a bind mount, `next dev`. `make images`
builds the two that get deployed, and they share nothing with those:

| | API | web |
|---|---|---|
| base | `distroless/static:nonroot` | `node:24-alpine` |
| user | `nonroot` (65532) | `node` (1000) |
| size | ~16 MiB | Next.js standalone output, no `node_modules` |
| shell | **none** | busybox |

Both base images are pinned by digest rather than by tag, because a tag can be
moved by whoever owns the registry entry. `make check-dockerfiles` refuses a bare
tag, a build arg whose name reads like a secret, a last stage that would run as
root, and the `go mod download` layer that would drag the code-generation tools
into an image the binary never reads them from. `make check-images` checks the
built artefact instead of the recipe: the size ceiling, both users, that the API
image really has no shell, and that the web image carries `public/` **and**
`.next/static` — Next.js leaves both out of its standalone output, and a
container missing them serves every page without a stylesheet
([ADR 0026](docs/adr/0026-produktions-images-digest-pins-kein-modul-cache-und-ein-healthcheck-im-binary.md)).

**The API image answers its own healthcheck.** There is no shell in it to run
`wget` in, so `/api -healthcheck` dials the `/readyz` of the server the same
binary is running and exits 0 or 1. It reads no configuration and opens no pool —
a missing credential must never be able to make a serving container look dead.

**One binary carries three programs.** `api` serves, `api migrate up` applies the
schema, `api seed` writes the curated content — and the last two run as init
containers from the same image, ahead of the server. They were three separate
commands until the production image needed all three: Go shares nothing between
binaries, so three of them measured 32 MiB against a 20 MiB ceiling, while one
carrying all three measures 15. The role split that keeps the API from being able
to run DDL is unaffected — it was never the file the code sat in, it is the
connection string each service is handed
([ADR 0027](docs/adr/0027-compose-topologie-ein-binary-fuenf-dienste-und-die-grenzen-in-zahlen.md)).

**The production topology is a file you can run.** `compose.yaml` is what Dokploy
will run on the VPS; `make check-topology` runs the same file here, against the
same images, and that is the only reason its acceptance means anything:

```
db (pg_isready) → migrate → seed → api (healthcheck) → web
```

It comes up from an empty volume with no manual step, twice in a row, and a
deliberately broken migration leaves the API never started rather than serving
against a schema that was never applied. `make check-compose` refuses a `build:`,
a published Postgres port, a bind mount that is not the read-only role bootstrap,
a service without a memory limit, an `env_file:`, a floating `ghcr.io` tag, and a
healthcheck restated where the image already carries one. Every one of those
rules has its broken case in `tools/selftest.sh`.

**Traefik belongs to Dokploy, and the routing is five more of those rules.** The
site and the API share one hostname — `/api` goes to Go, everything else to
Next.js — so `api` and `web` carry Traefik labels and sit in two networks: the
proxy's, and the internal one where the database is. A service that names
`networks:` joins only those, so the check refuses a router that has left the
default network, a load-balancer port the service does not expose, a router
without an explicit priority, a `dokploy-network` that is not declared external,
and the database anywhere near the proxy network. Every one of them is a way for
the proxy and the stack to lose each other while the stack still comes up green
([ADR 0028](docs/adr/0028-dokploy-anbindung-zwei-netze-zwei-router-und-die-platte.md)).

**The version on `/api/health` comes from the linker.** `make images` passes
`git describe` and the short SHA as build args, and they are the only two build
args either image takes: a build arg lands in the image layers and survives the
rotation of whatever it carried, so every secret is runtime environment and
nothing else.

**The contact form's mail is measured, not assumed.** The domain publishes one
`v=spf1`, a DKIM key that OVH delegates by CNAME rather than publishing as TXT,
and DMARC at `p=none` while the reports accumulate. Every one of those was read
back out of the zone over two independent resolvers before it was written down,
which is how the phase learned that three of the four records it planned to
create already existed — and how it caught the fourth landing under a doubled
name that resolved cleanly and that nobody queries
([ADR 0029](docs/adr/0029-mail-und-dns-ueber-ovh-die-zone-der-selektor-und-das-relay.md)).

`make design` needs network access — the design sheets load React and fonts from
a CDN at runtime. **A black page means no network, not a broken sheet.**

## Repository

| Path | Reader |
|---|---|
| `README.md` | you, right now |
| `CONTRIBUTING.md` · `SECURITY.md` | anyone who wants to file something |
| `compose.dev.yaml` · `.env.example` | anyone running it locally |
| `compose.yaml` | the production topology — what Dokploy runs, and what `make check-topology` runs here |
| `stack.yaml` | the curated stack — names and source pointers, no versions |
| `ops/` | what runs on the host: the Postgres role bootstrap, and the weekly disk reclaim with its systemd timer |
| `api/Dockerfile` · `web/Dockerfile` | the two images that ship — `.dev` next to each builds the local one |
| `api/` | Go: handlers thin, logic in `internal/`, SQL in `internal/store/` |
| `web/` | Next.js App Router, Server Components by default |
| `docs/build-plan.md` | the author, every session (German) |
| `docs/adr/` | the author in six months, asking "why did I do that?" |
| `docs/architecture/` | anyone who wants the shape before the code |
| `docs/runbooks/` | the author at three in the morning |
| `docs/design/` | **read-only** imported design handoff, 29 sheets |
| `contract/openapi.yaml` | the single source of truth for API types |
| `backlog.md` | the notepad between sessions |

Branch `ops-data` is machine-written and has no shared history with `main`: it
carries the uptime log committed by the probe workflow, so an outage is recorded
**outside** the infrastructure that went down.

## Decisions

| ADR | Decision |
|---|---|
| [0001](docs/adr/0001-nextjs-app-router.md) | Next.js 16 App Router, not React Router 7 |
| [0002](docs/adr/0002-mdx-blog-in-repo.md) | Blog as MDX in the repository, no CMS |
| [0003](docs/adr/0003-track-states-as-sql-view.md) | Skill states derived in SQL, never stored |
| [0004](docs/adr/0004-public-read-api.md) | The read API is public |
| [0005](docs/adr/0005-container-split-api-owns-postgres.md) | Go owns the data, Next.js renders |
| [0006](docs/adr/0006-no-cdn.md) | No CDN, no third party in the request path |
| [0007](docs/adr/0007-prometheus-instead-of-log-parsing.md) | Prometheus measures, Postgres serves |
| [0008](docs/adr/0008-single-host-at-launch.md) | One host at launch, outage log kept outside |
| [0009](docs/adr/0009-contract-problem-details-caching-public-bundle.md) | Problem Details everywhere, internal paths filtered from the published contract |
| [0010](docs/adr/0010-enum-values-as-text-and-check.md) | State values as `text` + `CHECK`, not Postgres enums |
| [0011](docs/adr/0011-postgres-roles-bootstrap-and-privileges.md) | Roles from initdb, privileges from the migration |
| [0012](docs/adr/0012-stack-manifest-resolved-at-gen-time.md) | The stack manifest is resolved at `make gen` and embedded |
| [0013](docs/adr/0013-seed-is-content-not-measurement.md) | The seed carries content, never measurements |
| [0014](docs/adr/0014-server-lifecycle-pool-and-shutdown.md) | Lifecycle: configuration, pool size, the timeout cascade, graceful shutdown |
| [0015](docs/adr/0015-middleware-chain-proxy-trust-cors-rate-limit.md) | The middleware chain, the trust boundary at the proxy, a hand-written rate limit |
| [0016](docs/adr/0016-sqlc-and-mounting-only-built-operations.md) | sqlc for data access, and the router mounts only what exists |
| [0017](docs/adr/0017-systems-endpoints-window-grid-gaps-and-error-mapping.md) | The systems endpoints: window, grid gaps and error mapping |
| [0018](docs/adr/0018-training-endpoint-query-split-and-header-count.md) | The training endpoint: query split and counting the header from what is served |
| [0019](docs/adr/0019-ops-rollup-in-sql-schwelle-und-die-aggregationsschleife.md) | The ops roll-up in SQL, the outage threshold and the loop that drives it |
| [0020](docs/adr/0020-contributions-cache-in-postgres-breaker-und-der-siebte-problem-typ.md) | The contribution calendar: cached in Postgres, a breaker in front of GitHub, a seventh problem type |
| [0021](docs/adr/0021-contact-endpoint-inline-send-dispatcher-and-the-fifth-answer.md) | The contact form: one send attempt in the request, a dispatcher behind it, and a fifth answer that is a 202 |
| [0022](docs/adr/0022-badges-and-the-response-the-contract-was-missing.md) | The three badges: a missing measurement is `— NO DATA`, an unreachable database is a 500, and the contract now says so |
| [0023](docs/adr/0023-internal-endpoints-two-tokens-and-a-comparison-that-does-not-branch.md) | The internal endpoints: two tokens, a comparison that does not branch on length, and every database CHECK taken in advance |
| [0024](docs/adr/0024-router-parity-instead-of-the-generated-router.md) | The generated router is not mounted after all; a parity check proves the hand-written one is complete in both directions |
| [0025](docs/adr/0025-the-shape-of-a-handler-package.md) | The shape every handler package took during stage C, and why two thirds of it outlived the reason it was given |
| [0026](docs/adr/0026-produktions-images-digest-pins-kein-modul-cache-und-ein-healthcheck-im-binary.md) | The production images: base images pinned by digest, no module-cache layer, and a healthcheck the binary answers itself |
| [0027](docs/adr/0027-compose-topologie-ein-binary-fuenf-dienste-und-die-grenzen-in-zahlen.md) | The compose topology: one binary carrying three programs, five services rather than four, and every resource limit with the arithmetic behind it |
| [0028](docs/adr/0028-dokploy-anbindung-zwei-netze-zwei-router-und-die-platte.md) | Traefik is Dokploy's: two networks, two routers with explicit priorities, and a disk that needs a weekly prune more than it needs logs rotated |
| [0029](docs/adr/0029-mail-und-dns-ueber-ovh-die-zone-der-selektor-und-das-relay.md) | Mail and DNS over OVH: a zone that mostly already stood, a DKIM key delegated by CNAME rather than published as TXT, and a relay whose name survives because it is a proxy |

Every ADR names what the decision **costs**. One without a price tag is an
advertisement.

## Contact

Security reports: see [SECURITY.md](SECURITY.md). Everything else:
[open an issue](https://github.com/G1NG4R/timseil-dev/issues).
