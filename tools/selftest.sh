#!/bin/sh
# Tests the checks and hooks against broken input — a gate that only ever sees
# good input is not known to be a gate.
#
# Runs in a throwaway repository so nothing here can touch the real tree.
set -eu

root=$(git rev-parse --show-toplevel)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT INT TERM

fail=0
ok() { printf '  ✓ %s\n' "$1"; }
no() { printf '  ✗ %s\n' "$1"; fail=1; }

# Expect a command to fail (the broken case) or to succeed (the good case).
rejects() { desc=$1; shift; if "$@" >/dev/null 2>&1; then no "$desc (accepted, should reject)"; else ok "$desc"; fi; }
accepts() { desc=$1; shift; if "$@" >/dev/null 2>&1; then ok "$desc"; else no "$desc (rejected, should accept)"; fi; }

mkdir -p "$tmp/tools" "$tmp/.githooks"
cp "$root/tools/check-repo.sh" "$root/tools/check-todo.sh" "$root/tools/check-node.sh" \
   "$root/tools/check-compose.sh" "$root/tools/check-contract.sh" \
   "$root/tools/check-migrations.sh" "$root/tools/check-stack.sh" \
   "$root/tools/check-dockerfiles.sh" "$tmp/tools/"
cp "$root/.githooks/pre-commit" "$root/.githooks/commit-msg" "$root/.githooks/pre-push" "$tmp/.githooks/"
cp "$root/Makefile" "$tmp/"

cd "$tmp"
git init -q -b main .
git config user.email selftest@localhost
git config user.name selftest
git config commit.gpgsign false
git config core.hooksPath .githooks
git add -A >/dev/null

printf 'hygiene\n'
printf 'clean line\n' > clean.txt
git add clean.txt
accepts "clean file passes" tools/check-repo.sh --staged

printf 'trailing space \n' > ws.txt
git add ws.txt
rejects "trailing whitespace rejected" tools/check-repo.sh --staged
git rm -q --cached ws.txt && rm ws.txt

printf 'crlf line\r\n' > crlf.txt
git add crlf.txt
rejects "CRLF rejected" tools/check-repo.sh --staged
git rm -q --cached crlf.txt && rm crlf.txt

printf 'no newline' > eof.txt
git add eof.txt
rejects "missing final newline rejected" tools/check-repo.sh --staged
git rm -q --cached eof.txt && rm eof.txt

# Markdown keeps trailing spaces on purpose (hard line break).
printf 'line with break  \n' > doc.md
git add doc.md
accepts "markdown keeps its trailing spaces" tools/check-repo.sh --staged
git rm -q --cached doc.md && rm doc.md

# The imported handoff is exempt from hygiene, INDEX.md is not — we write that
# one. An exemption nobody tests is an exemption that silently widens.
mkdir -p docs/design
printf '<html>\r\n' > "docs/design/Sheet - timseil.dev.dc.html"
git add "docs/design/Sheet - timseil.dev.dc.html"
accepts "imported design sheet skipped despite CRLF" tools/check-repo.sh --staged
git rm -q --cached "docs/design/Sheet - timseil.dev.dc.html"

printf 'no newline' > docs/design/INDEX.md
git add docs/design/INDEX.md
rejects "docs/design/INDEX.md still checked" tools/check-repo.sh --staged
git rm -q --cached docs/design/INDEX.md
rm -rf docs

git config --unset core.hooksPath
rejects "unset core.hooksPath rejected" tools/check-repo.sh --staged
git config core.hooksPath .githooks

printf 'markers\n'
printf 'x = 1  # %s: later\n' "TO""DO" > bare.py
git add bare.py
rejects "bare marker rejected" tools/check-todo.sh
git rm -q --cached bare.py && rm bare.py

printf 'x = 1  # %s(#42): tracked\n' "TO""DO" > tracked.py
git add tracked.py
accepts "marker with issue accepted" tools/check-todo.sh
git rm -q --cached tracked.py && rm tracked.py

printf 'the rule says no %ss without an issue\n' "TO""DO" > prose.txt
git add prose.txt
accepts "prose naming the rule accepted" tools/check-todo.sh
git rm -q --cached prose.txt && rm prose.txt

printf 'compose\n'
# The security rule is one line in CLAUDE.md and one forgotten line in a YAML
# file away from being broken. Both halves get their broken case here.
write_dev() { printf '%s' "$1" > compose.dev.yaml; }

write_dev 'services:
  db:
    image: postgres:18.6-alpine
    expose:
      - "5432"
'
accepts "db behind expose accepted" tools/check-compose.sh

write_dev 'services:
  db:
    image: postgres:18.6-alpine
    ports:
      - "5432:5432"
'
rejects "published db port rejected" tools/check-compose.sh

write_dev 'services:
  db:
    image: postgres:18.6-alpine
    labels:
      - "traefik.enable=true"
'
rejects "traefik label on db rejected" tools/check-compose.sh

write_dev 'services:
  db:
    image: postgres:18.6-alpine
    expose:
      - "5432"
'
printf 'services:\n  api:\n    build:\n      context: ./api\n' > compose.yaml
rejects "build: in the production compose rejected" tools/check-compose.sh
rm -f compose.yaml

# compose.dev.yaml is the one file allowed to build.
write_dev 'services:
  api:
    build:
      context: ./api
'
accepts "build: in the dev compose accepted" tools/check-compose.sh
rm -f compose.dev.yaml

rm -f compose.dev.yaml compose.yaml

# The six rules D2 added, which apply to the production file only. Each one is a
# sentence ADR 0027 asserts, and an asserted rule nobody can break on purpose is
# a rule nobody has tested.
#
# `limited` is the smallest production service that satisfies every other rule,
# so each case below fails for exactly the reason it is named after.
write_prod() { printf '%s' "$1" > compose.yaml; }

limited='    deploy:
      resources:
        limits:
          memory: 256M
'

write_prod "services:
  api:
    image: ghcr.io/g1ng4r/timseil-api:\${IMAGE_TAG}
$limited"
accepts "a pinned, limited production service accepted" tools/check-compose.sh

write_prod "services:
  api:
    image: ghcr.io/g1ng4r/timseil-api:\${IMAGE_TAG}
"
rejects "production service without a memory limit rejected" tools/check-compose.sh

write_prod "services:
  api:
    image: ghcr.io/g1ng4r/timseil-api:latest
$limited"
rejects "floating ghcr tag rejected" tools/check-compose.sh

write_prod "services:
  api:
    image: ghcr.io/g1ng4r/timseil-api:\${IMAGE_TAG}
    env_file: .env.prod
$limited"
rejects "env_file in the production compose rejected" tools/check-compose.sh

# Rule 7 is about a SECOND copy of a probe the image already carries...
write_prod "services:
  api:
    image: ghcr.io/g1ng4r/timseil-api:\${IMAGE_TAG}
    healthcheck:
      test: [\"CMD\", \"/api\", \"-healthcheck\"]
$limited"
rejects "api restating its image healthcheck rejected" tools/check-compose.sh

# ...and switching one off is not a copy of it. The init containers do this
# because a probe written for a server is meaningless for a program that exits.
write_prod "services:
  migrate:
    image: ghcr.io/g1ng4r/timseil-api:\${IMAGE_TAG}
    healthcheck:
      disable: true
$limited"
accepts "an init container disabling the probe accepted" tools/check-compose.sh

# Rule 3. A named volume is fine, a host path is not, and the one exception is
# the read-only roles script — which has to be read-only to be the exception.
write_prod "services:
  db:
    image: postgres:18.6-alpine
    volumes:
      - db-data:/var/lib/postgresql
$limited"
accepts "named volume accepted" tools/check-compose.sh

write_prod "services:
  db:
    image: postgres:18.6-alpine
    volumes:
      - ./data:/var/lib/postgresql
$limited"
rejects "bind-mounted database directory rejected" tools/check-compose.sh

write_prod "services:
  api:
    image: ghcr.io/g1ng4r/timseil-api:\${IMAGE_TAG}
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
$limited"
rejects "bind-mounted docker socket rejected" tools/check-compose.sh

write_prod "services:
  db:
    image: postgres:18.6-alpine
    volumes:
      - ./ops/postgres/initdb:/docker-entrypoint-initdb.d
$limited"
rejects "writable ops bind mount rejected" tools/check-compose.sh

write_prod "services:
  db:
    image: postgres:18.6-alpine
    volumes:
      - ./ops/postgres/initdb:/docker-entrypoint-initdb.d:ro
$limited"
accepts "read-only ops bind mount accepted" tools/check-compose.sh

# A tmpfs path is absolute and is not a bind mount. Without this distinction the
# rule would forbid the read-only rootfs it exists alongside.
write_prod "services:
  api:
    image: ghcr.io/g1ng4r/timseil-api:\${IMAGE_TAG}
    read_only: true
    tmpfs:
      - /tmp:rw,noexec,nosuid,nodev,size=16m
$limited"
accepts "tmpfs path not mistaken for a bind mount accepted" tools/check-compose.sh

# Rule 8. stack.yaml reads the production tag and puts it on a page, so the two
# files disagreeing means the page shows a version nothing runs.
write_prod "services:
  db:
    image: postgres:18.6-alpine
$limited"
write_dev 'services:
  db:
    image: postgres:18.6-alpine
'
accepts "both compose files on the same postgres accepted" tools/check-compose.sh

write_dev 'services:
  db:
    image: postgres:18.5-alpine
'
rejects "postgres drift between the two compose files rejected" tools/check-compose.sh

rm -f compose.dev.yaml compose.yaml

accepts "absent compose files skip" tools/check-compose.sh

printf 'dockerfiles\n'
# Four rules, and every one of them is invisible until it matters: a moved tag,
# a rotated secret still readable in `docker history`, a container that turned
# out to be root, a layer nobody needed. Each gets its broken case.
digest='@sha256:0000000000000000000000000000000000000000000000000000000000000000'

mkdir -p api web
write_api() { printf '%s' "$1" > api/Dockerfile; }
write_web() { printf '%s' "$1" > web/Dockerfile; }

good_api="FROM golang:1.26-alpine$digest AS build
COPY . .
RUN CGO_ENABLED=0 go build -o /out/api ./cmd/api

FROM gcr.io/distroless/static:nonroot$digest
COPY --from=build /out/api /api
USER nonroot:nonroot
ENTRYPOINT [\"/api\"]
"
write_api "$good_api"
write_web "FROM node:24-alpine$digest AS runner
USER node
CMD [\"node\", \"server.js\"]
"
accepts "pinned, non-root production images accepted" tools/check-dockerfiles.sh

# 1 — a tag instead of a digest.
write_api "FROM golang:1.26-alpine AS build
COPY . .

FROM gcr.io/distroless/static:nonroot$digest
USER nonroot:nonroot
"
rejects "unpinned FROM rejected" tools/check-dockerfiles.sh

# ...and the ARG indirection the web image uses, so the substitution is checked
# in both directions rather than assumed.
write_api "$good_api"
write_web "ARG NODE_IMAGE=node:24-alpine$digest
FROM \${NODE_IMAGE} AS runner
USER node
"
accepts "FROM through a pinned ARG accepted" tools/check-dockerfiles.sh

write_web 'ARG NODE_IMAGE=node:24-alpine
FROM ${NODE_IMAGE} AS runner
USER node
'
rejects "FROM through an unpinned ARG rejected" tools/check-dockerfiles.sh

# 2 — a secret as a build arg. It survives in the layer after the rotation.
write_web "FROM node:24-alpine$digest
USER node
"
write_api "FROM golang:1.26-alpine$digest AS build
ARG GITHUB_TOKEN
COPY . .

FROM gcr.io/distroless/static:nonroot$digest
USER nonroot:nonroot
"
rejects "a secret build arg rejected" tools/check-dockerfiles.sh

write_api "FROM golang:1.26-alpine$digest AS build

FROM gcr.io/distroless/static:nonroot$digest
ENV CONTACT_IP_PEPPER=abc
USER nonroot:nonroot
"
rejects "a secret ENV rejected" tools/check-dockerfiles.sh

# The two that are allowed, because they are public and end up on /api/health.
write_api "FROM golang:1.26-alpine$digest AS build
ARG VERSION=dev
ARG GIT_SHA=unknown

FROM gcr.io/distroless/static:nonroot$digest
USER nonroot:nonroot
"
accepts "VERSION and GIT_SHA build args accepted" tools/check-dockerfiles.sh

# The rule reaches the dev files too — the habit is the point.
write_api "$good_api"
printf 'FROM golang:1.26-alpine\nARG SMTP_PASSWORD\n' > api/Dockerfile.dev
rejects "a secret build arg in the dev image rejected" tools/check-dockerfiles.sh
printf 'FROM golang:1.26-alpine\nARG AIR_VERSION=v1.67.4\n' > api/Dockerfile.dev
accepts "an unpinned dev image accepted" tools/check-dockerfiles.sh
rm -f api/Dockerfile.dev

# 3 — no USER in the last stage. The first stage having one does not count.
write_api "FROM golang:1.26-alpine$digest AS build
USER nobody

FROM gcr.io/distroless/static:nonroot$digest
COPY --from=build /out/api /api
"
rejects "a last stage without USER rejected" tools/check-dockerfiles.sh

# 4 — the module cache layer.
write_api "FROM golang:1.26-alpine$digest AS build
COPY go.mod go.sum ./
RUN go mod download
COPY . .

FROM gcr.io/distroless/static:nonroot$digest
USER nonroot:nonroot
"
rejects "go mod download rejected" tools/check-dockerfiles.sh

# And the sentence that describes the rule is not the rule being broken.
write_api "$good_api
# no go mod download here, on purpose — see issue #58
"
accepts "a comment naming the rule accepted" tools/check-dockerfiles.sh

rm -rf api web
accepts "absent dockerfiles skip" tools/check-dockerfiles.sh

printf 'contract\n'
# The contract is public from launch. The case worth guarding is not a typo — it is
# an internal path reaching the document /api/docs serves while everything else
# stays green.
if [ ! -x "$root/web/node_modules/.bin/redocly" ]; then
  printf '  – skip: redocly is not installed (cd web && npm ci)\n'
else
  mkdir -p web contract api/internal/httpx/assets
  ln -s "$root/web/node_modules" web/node_modules
  cp "$root/redocly.yaml" .

  public_only='openapi: 3.1.0
info:
  title: selftest
  version: 1.0.0
tags:
  - name: x
paths:
  /api/ping:
    get:
      operationId: getPing
      summary: Ping
      tags: [x]
      responses:
        "200":
          description: ok
'
  with_internal="$public_only"'  /api/internal/thing:
    post:
      operationId: reportThing
      summary: Thing
      tags: [x]
      x-internal: true
      security:
        - internalToken: []
      responses:
        "204":
          description: ok
components:
  securitySchemes:
    internalToken:
      type: http
      scheme: bearer
'

  # spec, bundle, embedded copy — the three files the check compares.
  write_contract() {
    printf '%s' "$1" > contract/openapi.yaml
    printf '%s' "$2" > contract/openapi.public.yaml
    printf '%s' "$2" > api/internal/httpx/assets/openapi.yaml
  }

  write_contract "$with_internal" "$public_only"
  accepts "filtered contract accepted" tools/check-contract.sh

  # The one that matters: the bundle still carries the internal operation.
  write_contract "$with_internal" "$with_internal"
  rejects "internal path in the public bundle rejected" tools/check-contract.sh

  # Hiding an endpoint from the docs is not protecting it.
  write_contract "$(printf '%s' "$with_internal" | grep -v 'internalToken: \[\]$')" "$public_only"
  rejects "x-internal without a security scheme rejected" tools/check-contract.sh

  # go:embed cannot reach the bundle, so make gen copies it. A stale copy would
  # serve last week's contract out of a fresh binary.
  write_contract "$with_internal" "$public_only"
  printf 'openapi: 3.1.0\n' > api/internal/httpx/assets/openapi.yaml
  rejects "stale embedded document rejected" tools/check-contract.sh

  write_contract "$(printf '%s' "$public_only" | sed 's/^paths:/paths: [/')" "$public_only"
  rejects "broken YAML rejected" tools/check-contract.sh

  write_contract "$(printf '%s' "$public_only" | grep -v 'operationId:')" "$public_only"
  rejects "missing operationId rejected" tools/check-contract.sh

  rm -rf contract api web/node_modules redocly.yaml
  accepts "absent contract skips" tools/check-contract.sh
  rm -rf web
fi

printf 'migrations\n'
# The static half of the migration rules. The cycle itself needs a database and
# lives in `make check-db`; what is greppable is guarded here, and here is where
# it gets held to its broken case.
mkdir -p api/migrations

# A minimal migration that satisfies every rule, so each assertion below can
# break exactly one thing.
write_migration() { printf '%s' "$1" > api/migrations/00001_selftest.sql; }

good_migration='-- +goose Up
CREATE TABLE tracks (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
-- Serves C3: SELECT id FROM tracks WHERE name = $1
CREATE INDEX tracks_name_idx ON tracks (name);
-- +goose Down
DROP TABLE tracks;
'

write_migration "$good_migration"
accepts "well formed migration accepted" tools/check-migrations.sh

# A migration nobody can roll back is how an irreversible change gets merged.
write_migration "$(printf '%s' "$good_migration" | sed '/+goose Down/,$d')"
rejects "migration without a Down rejected" tools/check-migrations.sh

write_migration "$(printf '%s' "$good_migration" | sed 's/^DROP TABLE tracks;$/-- nothing to undo/')"
rejects "empty Down rejected" tools/check-migrations.sh

# The acceptance criterion of B2, made mechanical.
write_migration "$(printf '%s' "$good_migration" | sed 's/^-- Serves C3.*$/-- an index/')"
rejects "index without its query rejected" tools/check-migrations.sh

# DROP TYPE fails on dependent columns, which is what turns the second cycle red.
write_migration "$(printf '%s' "$good_migration" | sed "1a CREATE TYPE track_state AS ENUM ('core');")"
rejects "enum type rejected" tools/check-migrations.sh

# Roles are cluster-wide; DROP ROLE fails while a grant exists.
write_migration "$(printf '%s' "$good_migration" | sed '1a CREATE ROLE someone LOGIN;')"
rejects "role in a migration rejected" tools/check-migrations.sh

# The one that has to outlive this phase: invariant 2 and ADR 0003.
write_migration "$(printf '%s' "$good_migration" | sed 's/^    name text NOT NULL,$/    state text NOT NULL,\n    name text NOT NULL,/')"
rejects "state column on tracks rejected" tools/check-migrations.sh

write_migration "$(printf '%s' "$good_migration" | sed 's/^ALTER TABLE.*$//; $a ALTER TABLE tracks ADD COLUMN state text;')"
rejects "state column added to tracks later rejected" tools/check-migrations.sh

# Both hide a wrong drop order instead of failing on it.
write_migration "$(printf '%s' "$good_migration" | sed 's/^DROP TABLE tracks;$/DROP TABLE tracks CASCADE;/')"
rejects "DROP CASCADE rejected" tools/check-migrations.sh

write_migration "$(printf '%s' "$good_migration" | sed 's/^DROP TABLE tracks;$/DROP TABLE IF EXISTS tracks;/')"
rejects "IF EXISTS in a Down rejected" tools/check-migrations.sh

write_migration "$(printf '%s' "$good_migration" | sed 's/timestamptz/timestamp/')"
rejects "timestamp without a time zone rejected" tools/check-migrations.sh

write_migration "$(printf '%s' "$good_migration" | sed 's/bigint GENERATED ALWAYS AS IDENTITY/bigserial/')"
rejects "serial type rejected" tools/check-migrations.sh

# Comments are prose, not SQL: neither of these words is a declaration.
write_migration "$(printf '%s' "$good_migration" | sed '1a -- the timestamp is serial in spirit only')"
accepts "those words inside a comment accepted" tools/check-migrations.sh

write_migration "$good_migration"
mv api/migrations/00001_selftest.sql api/migrations/00002_selftest.sql
rejects "numbering that starts at two rejected" tools/check-migrations.sh
rm -f api/migrations/00002_selftest.sql

write_migration "$good_migration"
printf 'x\n' > api/migrations/nope.sql
rejects "misnamed migration rejected" tools/check-migrations.sh
rm -f api/migrations/nope.sql

# The price of text + CHECK over a Postgres enum (ADR 0010), and where it is paid.
# All four schemas are here because the check insists the contract side exists:
# a CHECK list it cannot compare against is not a guarded list.
mkdir -p contract
printf 'components:
  schemas:
    SystemState:
      type: string
      enum: [live, in_build, queued]
    DayState:
      type: string
      enum: [ok, degraded, outage, nodata]
    DeployResult:
      type: string
      enum: [ok, rollback]
    SourceReason:
      type: string
      enum: [nda, internal]
    TrackState:
      type: string
      enum: [core, applied, learning, queued]
' > contract/openapi.yaml

write_migration "$good_migration"
printf "ALTER TABLE systems ADD CONSTRAINT systems_state_ck CHECK (state IN ('live', 'in_build', 'queued'));\n" >> api/migrations/00001_selftest.sql
accepts "CHECK list matching the contract accepted" tools/check-migrations.sh

write_migration "$good_migration"
printf "ALTER TABLE systems ADD CONSTRAINT systems_state_ck CHECK (state IN ('live', 'planned'));\n" >> api/migrations/00001_selftest.sql
rejects "CHECK list drifting from the contract rejected" tools/check-migrations.sh

# The derivation itself (rule 7). The first argument is the literal behind the
# first THEN, which is where the drift shows up.
write_view() {
  cat > api/migrations/00002_view.sql <<SQL
-- +goose Up
CREATE VIEW v_track_states WITH (security_invoker = true) AS
SELECT t.id AS track_id,
    CASE
        WHEN count(s.id) >= 2 THEN '$1'
        WHEN count(s.id) = 1 THEN 'applied'
        WHEN count(s.id) > 0 THEN 'learning'
        ELSE 'queued'
    END AS state
FROM tracks t
GROUP BY t.id;
-- +goose Down
DROP VIEW v_track_states;
SQL
}

write_migration "$good_migration"
write_view core
accepts "derivation matching the contract accepted" tools/check-migrations.sh

write_view planned
rejects "derivation drifting from the contract rejected" tools/check-migrations.sh

write_view core
sed -i.bak 's/^CREATE VIEW/CREATE MATERIALIZED VIEW/' api/migrations/00002_view.sql && rm -f api/migrations/00002_view.sql.bak
rejects "materialised view rejected" tools/check-migrations.sh

# A Down that drops something — anything — but not the view it created. Rule 2
# is satisfied and the rollback is still a lie.
write_view core
sed -i.bak 's/^DROP VIEW v_track_states;$/DROP TABLE something_else;/' api/migrations/00002_view.sql && rm -f api/migrations/00002_view.sql.bak
rejects "derivation not dropped in its Down rejected" tools/check-migrations.sh

write_view core
cp api/migrations/00002_view.sql api/migrations/00003_view_again.sql
rejects "derivation defined twice rejected" tools/check-migrations.sh
rm -f api/migrations/00002_view.sql api/migrations/00003_view_again.sql

rm -rf api contract
accepts "absent migrations skip" tools/check-migrations.sh

printf 'stack\n'
# The manifest exists so that no version is ever typed onto a page again. The
# broken cases are therefore about typing one, and about an entry that quietly
# stops resolving — a caret range renamed, a dependency dropped. Both must be
# loud, because a stack line that goes silently missing looks like a choice.
#
# The resolver is Go, so the api module comes from the real tree while the
# manifest and its sources come from the throwaway one. Same seam idea as
# CHECK_NODE_BIN below.
mkdir -p web api
printf '{\n  "dependencies": { "next": "16.3.1" }\n}\n' > web/package.json
printf 'module example.test/api\n\ngo 1.26.0\n' > api/go.mod
printf 'services:\n  db:\n    image: postgres:18.6-alpine\n  api:\n    image: alpine\n' > compose.dev.yaml
printf '24\n' > .nvmrc

write_stack() { printf '%s' "$1" > stack.yaml; }
stack_check() { CHECK_STACK_API_DIR="$root/api" tools/check-stack.sh "$tmp"; }

write_stack 'systems:
  demo:
    - { name: "Next.js",    from: "web/package.json", key: "dependencies.next" }
    - { name: "Go",         from: "api/go.mod",       key: "go" }
    - { name: "PostgreSQL", from: "compose.dev.yaml", key: "services.db.image" }
    - { name: "Node",       from: ".nvmrc" }
    - { name: "FastAPI" }
'
accepts "resolvable manifest accepted" stack_check

# The one rule of the file.
write_stack 'systems:
  demo:
    - { name: "PostgreSQL", version: "18.6" }
'
rejects "literal version rejected" stack_check

# `form:` for `from:` would otherwise degrade the entry to a bare name, and the
# version would disappear from the page without anything going red.
write_stack 'systems:
  demo:
    - { name: "Go", form: "api/go.mod", key: "go" }
'
rejects "misspelled from rejected" stack_check

write_stack 'systems:
  demo:
    - { name: "Go", key: "go" }
'
rejects "key without from rejected" stack_check

# Tailwind arrives in G1. Naming it before its dependency exists is the drift
# this check is for.
write_stack 'systems:
  demo:
    - { name: "Tailwind", from: "web/package.json", key: "dependencies.tailwindcss" }
'
rejects "key that is not in the source rejected" stack_check

write_stack 'systems:
  demo:
    - { name: "Traefik", from: "compose.observability.yaml", key: "services.proxy.image" }
'
rejects "source file that does not exist rejected" stack_check

write_stack 'systems:
  demo:
    - { name: "Alpine", from: "compose.dev.yaml", key: "services.api.image" }
'
rejects "image without a tag rejected" stack_check

write_stack 'systems: {}
'
rejects "manifest without systems rejected" stack_check

write_stack 'systems:
  demo:
    - { name: "Go", from: "api/go.mod", key: "go" }
'
accepts "absent api module skips" env CHECK_STACK_API_DIR="$tmp/no-such-module" tools/check-stack.sh "$tmp"

rm -f stack.yaml
accepts "absent stack.yaml skips" stack_check
rm -rf web api compose.dev.yaml .nvmrc

printf 'node version\n'
# A fake interpreter, so the assertions do not depend on what this machine runs.
mkdir -p fakebin
printf '#!/bin/sh\necho v24.19.0\n' > fakebin/node24 && chmod +x fakebin/node24
printf '#!/bin/sh\necho v25.1.0\n' > fakebin/node25 && chmod +x fakebin/node25

node_check() { CHECK_NODE_BIN="$1" tools/check-node.sh "$2"; }

printf '24\n' > nv24
printf '25\n' > nv25
printf '\n'   > nv_empty

accepts "matching major accepted"        node_check "$tmp/fakebin/node24" nv24
rejects "mismatched major rejected"      node_check "$tmp/fakebin/node25" nv24
rejects "odd major in .nvmrc rejected"   node_check "$tmp/fakebin/node25" nv25
rejects "empty .nvmrc rejected"          node_check "$tmp/fakebin/node24" nv_empty
rejects "missing .nvmrc rejected"        node_check "$tmp/fakebin/node24" nv_gone
accepts "absent node skips"              node_check "$tmp/fakebin/node-not-here" nv24
rm -rf fakebin nv24 nv25 nv_empty

printf 'commit-msg\n'
write_msg() { printf '%s\n' "$1" > msg; }
write_msg "kaputte nachricht"                 && rejects "non-conventional subject rejected" .githooks/commit-msg msg
write_msg "feat: add thing"                   && accepts "conventional subject accepted"     .githooks/commit-msg msg
write_msg "feat(api)!: breaking change"       && accepts "scope and bang accepted"            .githooks/commit-msg msg
write_msg "wip: something"                    && rejects "unknown type rejected"             .githooks/commit-msg msg
write_msg "feat: $(printf 'a%.0s' $(seq 80))" && rejects "subject over 72 chars rejected"     .githooks/commit-msg msg
write_msg "Merge branch main"                 && accepts "merge commit passes through"       .githooks/commit-msg msg

printf 'pre-push\n'
push_ref() { printf 'refs/heads/%s abc refs/heads/%s def\n' "$1" "$1" | .githooks/pre-push origin url; }
rejects "push to main blocked"     push_ref main
accepts "push to phase branch ok"  push_ref phase/x1-example
accepts "push to ops-data ok"      push_ref ops-data

printf 'pre-commit hook\n'
printf 'bad \n' > hookws.txt
git add hookws.txt
rejects "pre-commit blocks dirty staged file" .githooks/pre-commit
git rm -q --cached hookws.txt && rm hookws.txt
accepts "pre-commit passes clean index" .githooks/pre-commit

if [ "$fail" -ne 0 ]; then
  printf '\n✗ selftest failed\n'
  exit 1
fi
printf '  ✓ all gates reject their broken case\n'
