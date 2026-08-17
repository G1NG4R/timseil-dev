# timseil.dev

A backend and DevOps portfolio that runs on the stack it describes and measures
itself by the rules it explains. The site is its own reference system.

<!--
Live badges (build plan 12.4) read https://timseil.dev/api/badge/* — endpoints
that do not exist yet and a domain that is not live yet. Enabling them now would
put three broken images at the top of a repository whose entire argument is that
claims are checkable. They get switched on in phase M6, tracked by the issue
"docs: enable the live badges in the README".

![uptime](https://img.shields.io/endpoint?url=https://timseil.dev/api/badge/uptime)
![version](https://img.shields.io/endpoint?url=https://timseil.dev/api/badge/version)
![systems](https://img.shields.io/endpoint?url=https://timseil.dev/api/badge/systems)
-->

> **Status:** in build — stage B of 13, phase B2. Nothing is deployed yet.
> There is no running site behind this repository today, and this line will say
> so until there is. See [the build plan](docs/build-plan.md) (German).

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
make check                            # every check that applies today
cp .env.example .env                  # local values, none of them secret
make dev                              # postgres + migrations + seed + api + web
make design                           # design handoff on http://localhost:4000
```

`make dev` applies the schema and the content before the API starts, so a cold
clone comes up with a working database in one command. To run either on its own,
`make migrate` and `make seed`; `make migrate-status` says what is applied.

`make dev` gives you three containers and two URLs:

| URL | What |
|---|---|
| <http://localhost:3000> | the web app, `next dev` |
| <http://localhost:8080/healthz> | the API is alive |
| <http://localhost:8080/readyz> | the API can reach Postgres — `503` when it cannot |
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
stage H. That is deliberate: a quickstart
that lies is the failure mode this project is built to avoid, and CI will run
these commands from stage E5 onwards to keep this section honest.

`make design` needs network access — the design sheets load React and fonts from
a CDN at runtime. **A black page means no network, not a broken sheet.**

## Repository

| Path | Reader |
|---|---|
| `README.md` | you, right now |
| `CONTRIBUTING.md` · `SECURITY.md` | anyone who wants to file something |
| `compose.dev.yaml` · `.env.example` | anyone running it locally |
| `stack.yaml` | the curated stack — names and source pointers, no versions |
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

Every ADR names what the decision **costs**. One without a price tag is an
advertisement.

## Contact

Security reports: see [SECURITY.md](SECURITY.md). Everything else:
[open an issue](https://github.com/G1NG4R/timseil-dev/issues).
