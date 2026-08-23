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

# rejects, plus the reason. `rejects` alone is satisfied by any non-zero exit,
# and a script that is missing, unreadable or broken exits non-zero too — so a
# guard that was deleted can leave its own test green. Where that is a plausible
# way to be wrong, the expected message is named as well.
refuses() { # refuses <desc> <pattern> <command...>
  desc=$1; pattern=$2; shift 2
  out=$("$@" 2>&1) && { no "$desc (accepted, should reject)"; return; }
  case $out in
    *"$pattern"*) ok "$desc" ;;
    *) no "$desc (rejected, but not for '$pattern')" ;;
  esac
}
accepts() { desc=$1; shift; if "$@" >/dev/null 2>&1; then ok "$desc"; else no "$desc (rejected, should accept)"; fi; }

# says compares stdout, and prints what it got. `accepts` would only say that a
# command failed, and for a computed version number the interesting part is
# always which number came out instead.
# NOT called `says`: tools/version.sh's own block further down defines one with
# a different signature, and the later definition is the one in force by the
# time these cases run. The first version of this collided silently and every
# case reported `dev` — version.sh's fallback — instead of a version.
emits() { # emits <desc> <expected> <command...>
  desc=$1; want=$2; shift 2
  got=$("$@" 2>/dev/null || true)
  if [ "$got" = "$want" ]; then ok "$desc"; else no "$desc (want '"'"'$want'"'"', got '"'"'$got'"'"')"; fi
}

mkdir -p "$tmp/tools" "$tmp/.githooks"
cp "$root/tools/check-repo.sh" "$root/tools/check-todo.sh" "$root/tools/check-node.sh" \
   "$root/tools/check-compose.sh" "$root/tools/check-contract.sh" \
   "$root/tools/check-migrations.sh" "$root/tools/check-stack.sh" \
   "$root/tools/check-lint.sh" "$root/tools/check-versions.sh" \
   "$root/tools/check-tidy.sh" "$root/tools/check-env.sh" \
   "$root/tools/check-adrs.sh" "$root/tools/check-readme.sh" \
   "$root/tools/check-probe-cadence.sh" \
   "$root/tools/version.sh" \
   "$root/tools/check-dockerfiles.sh" "$root/tools/verify-supply-chain.sh" \
   "$root/tools/check-pins.sh" "$root/tools/check-secrets.sh" "$root/tools/sbom.sh" \
   "$root/tools/deploy-env.sh" "$root/tools/report-deploy.sh" \
   "$root/tools/verify-deploy.sh" "$root/tools/deploy-gate.sh" \
   "$root/tools/check-deployed.sh" "$root/tools/registry.sh" \
   "$root/tools/prune-registry.sh" "$root/tools/witness.sh" \
   "$root/tools/rollout.sh" "$root/tools/release.sh" \
   "$root/tools/check-rollout.sh" "$tmp/tools/"
cp "$root/.cosign-image" "$tmp/"
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

# The private half of the backlog, and the reason it gets a check instead of a
# convention: .gitignore stops mattering the second somebody types `git add -f`.
# The file holds what a stranger could use against the host.
accepts "no backlog.local.md is fine"        tools/check-repo.sh
printf 'the panel is at …\n' > backlog.local.md
accepts "an untracked backlog.local.md is fine" tools/check-repo.sh
git add -f backlog.local.md
refuses "a tracked backlog.local.md rejected" "must not be public" tools/check-repo.sh
git rm -q --cached backlog.local.md && rm -f backlog.local.md

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
    image: postgres:18.6-alpine@sha256:1111111111111111111111111111111111111111111111111111111111111111
    expose:
      - "5432"
'
accepts "db behind expose accepted" tools/check-compose.sh

write_dev 'services:
  db:
    image: postgres:18.6-alpine@sha256:1111111111111111111111111111111111111111111111111111111111111111
    ports:
      - "5432:5432"
'
rejects "published db port rejected" tools/check-compose.sh

write_dev 'services:
  db:
    image: postgres:18.6-alpine@sha256:1111111111111111111111111111111111111111111111111111111111111111
    labels:
      - "traefik.enable=true"
'
rejects "traefik label on db rejected" tools/check-compose.sh

write_dev 'services:
  db:
    image: postgres:18.6-alpine@sha256:1111111111111111111111111111111111111111111111111111111111111111
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

# The six rules D2 added and the five D3 added, which apply to the production
# file only. Each one is a sentence an ADR asserts, and an asserted rule nobody
# can break on purpose is a rule nobody has tested.
#
# Three pieces build the fixtures, and a case names the one it leaves out:
# `limited` is the memory limit, `routed` is everything Traefik needs, and the
# network block below is what rule 12 asks about.
#
# Rule 12 asks about the top-level networks: block, so every production fixture
# carries one. A second argument replaces it — that is how the rule 12 cases
# break exactly that and nothing else.
netblock='networks:
  dokploy-network:
    external: true
'
write_prod() { printf '%s' "$1" > compose.yaml; printf '%s' "${2-$netblock}" >> compose.yaml; }

limited='    deploy:
      resources:
        limits:
          memory: 256M
'

# What D3 requires of a service Traefik carries. Appended to the api fixtures so
# that a case named after rule 4 or rule 6 does not also trip rules 9 to 13 —
# each case still fails for exactly the reason it is named after. db and migrate
# fixtures deliberately do NOT get this: for them the same labels are the
# violation.
routed='    labels:
      - traefik.enable=true
      - traefik.docker.network=dokploy-network
      - traefik.http.routers.timseil-api.rule=Host(`timseil.dev`)
      - traefik.http.routers.timseil-api.priority=100
      - traefik.http.services.timseil-api.loadbalancer.server.port=8080
    networks: [default, dokploy-network]
    expose:
      - "8080"
'

write_prod "services:
  api:
    image: ghcr.io/g1ng4r/timseil-api:\${IMAGE_TAG}
$routed$limited"
accepts "a pinned, limited production service accepted" tools/check-compose.sh

write_prod "services:
  api:
    image: ghcr.io/g1ng4r/timseil-api:\${IMAGE_TAG}
$routed"
rejects "production service without a memory limit rejected" tools/check-compose.sh

write_prod "services:
  api:
    image: ghcr.io/g1ng4r/timseil-api:latest
$routed$limited"
rejects "floating ghcr tag rejected" tools/check-compose.sh

write_prod "services:
  api:
    image: ghcr.io/g1ng4r/timseil-api:\${IMAGE_TAG}
    env_file: .env.prod
$routed$limited"
rejects "env_file in the production compose rejected" tools/check-compose.sh

# Rule 7 is about a SECOND copy of a probe the image already carries...
write_prod "services:
  api:
    image: ghcr.io/g1ng4r/timseil-api:\${IMAGE_TAG}
    healthcheck:
      test: [\"CMD\", \"/api\", \"-healthcheck\"]
$routed$limited"
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
    image: postgres:18.6-alpine@sha256:1111111111111111111111111111111111111111111111111111111111111111
    volumes:
      - db-data:/var/lib/postgresql
$limited"
accepts "named volume accepted" tools/check-compose.sh

write_prod "services:
  db:
    image: postgres:18.6-alpine@sha256:1111111111111111111111111111111111111111111111111111111111111111
    volumes:
      - ./data:/var/lib/postgresql
$limited"
rejects "bind-mounted database directory rejected" tools/check-compose.sh

write_prod "services:
  api:
    image: ghcr.io/g1ng4r/timseil-api:\${IMAGE_TAG}
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
$routed$limited"
rejects "bind-mounted docker socket rejected" tools/check-compose.sh

# The F2 exception, and its three answers rather than one. Rule 3 lets alloy
# hold the docker socket read-only because the daemon owns the stdout streams a
# collector exists to read (ADR 0039 §3). An exception that only ever gets its
# accepting case tested is an exception nobody has measured the edges of, so the
# two ways to widen it by accident are here as well: the same socket on another
# service, and a writable one on alloy.
write_prod "services:
  alloy:
    image: grafana/alloy:v1.18.1@sha256:1111111111111111111111111111111111111111111111111111111111111111
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
$limited"
accepts "read-only docker socket on alloy accepted" tools/check-compose.sh

write_prod "services:
  alloy:
    image: grafana/alloy:v1.18.1@sha256:1111111111111111111111111111111111111111111111111111111111111111
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
$limited"
rejects "writable docker socket on alloy rejected" tools/check-compose.sh

write_prod "services:
  seed:
    image: ghcr.io/g1ng4r/timseil-api:\${IMAGE_TAG}
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
$limited"
rejects "read-only docker socket on another service rejected" tools/check-compose.sh

write_prod "services:
  db:
    image: postgres:18.6-alpine@sha256:1111111111111111111111111111111111111111111111111111111111111111
    volumes:
      - ./ops/postgres/initdb:/docker-entrypoint-initdb.d
$limited"
rejects "writable ops bind mount rejected" tools/check-compose.sh

write_prod "services:
  db:
    image: postgres:18.6-alpine@sha256:1111111111111111111111111111111111111111111111111111111111111111
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
$routed$limited"
accepts "tmpfs path not mistaken for a bind mount accepted" tools/check-compose.sh

# Rule 8. stack.yaml reads the production tag and puts it on a page, so the two
# files disagreeing means the page shows a version nothing runs.
write_prod "services:
  db:
    image: postgres:18.6-alpine@sha256:1111111111111111111111111111111111111111111111111111111111111111
$limited"
write_dev 'services:
  db:
    image: postgres:18.6-alpine@sha256:1111111111111111111111111111111111111111111111111111111111111111
'
accepts "both compose files on the same postgres accepted" tools/check-compose.sh

write_dev 'services:
  db:
    image: postgres:18.5-alpine
'
rejects "postgres drift between the two compose files rejected" tools/check-compose.sh

# E2, rule 8b. postgres was the last image in the system on a movable tag, and
# it was there because the resolver read the digest as the version. Now that it
# does not, a bare tag here is the same defect a bare FROM is in a Dockerfile.
write_dev 'services:
  db:
    image: postgres:18.6-alpine
    expose:
      - "5432"
'
rejects "foreign image on a bare tag rejected" tools/check-compose.sh

write_dev 'services:
  db:
    image: postgres:18.6-alpine@sha256:1111111111111111111111111111111111111111111111111111111111111111
    expose:
      - "5432"
'
accepts "foreign image pinned by digest accepted" tools/check-compose.sh


# The five rules D3 added. Every one of them is a way for the proxy and the
# stack to lose each other while the stack still comes up green, which is why
# they are gates and not a paragraph in a runbook.
#
# The dev file goes first: rule 8 compares the two, and the drift case above
# left a deliberately mismatched one behind. Without this the accepts case below
# would fail for that instead of proving what it is named after.
rm -f compose.dev.yaml

api_head='services:
  api:
    image: ghcr.io/g1ng4r/timseil-api:${IMAGE_TAG}
'

# Rule 9. The whole label set, or none of the routing works and nothing says so.
write_prod "$api_head$limited"
rejects "routed service with no traefik labels rejected" tools/check-compose.sh

no_docker_net='    labels:
      - traefik.enable=true
      - traefik.http.routers.timseil-api.rule=Host(`timseil.dev`)
      - traefik.http.routers.timseil-api.priority=100
      - traefik.http.services.timseil-api.loadbalancer.server.port=8080
    networks: [default, dokploy-network]
    expose:
      - "8080"
'
write_prod "$api_head$no_docker_net$limited"
rejects "traefik.enable without traefik.docker.network rejected" tools/check-compose.sh

no_rule='    labels:
      - traefik.enable=true
      - traefik.docker.network=dokploy-network
      - traefik.http.services.timseil-api.loadbalancer.server.port=8080
    networks: [default, dokploy-network]
    expose:
      - "8080"
'
write_prod "$api_head$no_rule$limited"
rejects "traefik labels with no router rule rejected" tools/check-compose.sh

no_port='    labels:
      - traefik.enable=true
      - traefik.docker.network=dokploy-network
      - traefik.http.routers.timseil-api.rule=Host(`timseil.dev`)
      - traefik.http.routers.timseil-api.priority=100
    networks: [default, dokploy-network]
    expose:
      - "8080"
'
write_prod "$api_head$no_port$limited"
rejects "router without a loadbalancer port rejected" tools/check-compose.sh

# Rule 10. The design sheet's second Dokploy pitfall: with more than one port
# open Traefik guesses, and the symptom is a timeout rather than an error.
wrong_port='    labels:
      - traefik.enable=true
      - traefik.docker.network=dokploy-network
      - traefik.http.routers.timseil-api.rule=Host(`timseil.dev`)
      - traefik.http.routers.timseil-api.priority=100
      - traefik.http.services.timseil-api.loadbalancer.server.port=3000
    networks: [default, dokploy-network]
    expose:
      - "8080"
'
write_prod "$api_head$wrong_port$limited"
rejects "loadbalancer port that expose: does not name rejected" tools/check-compose.sh

# Rule 11, both halves. A service naming networks: joins ONLY those, so the
# first of these takes the database away from the api — and reads like an
# outage rather than like a typo.
proxy_only='    labels:
      - traefik.enable=true
      - traefik.docker.network=dokploy-network
      - traefik.http.routers.timseil-api.rule=Host(`timseil.dev`)
      - traefik.http.routers.timseil-api.priority=100
      - traefik.http.services.timseil-api.loadbalancer.server.port=8080
    networks: [dokploy-network]
    expose:
      - "8080"
'
write_prod "$api_head$proxy_only$limited"
rejects "routed service on the proxy network alone rejected" tools/check-compose.sh

default_only='    labels:
      - traefik.enable=true
      - traefik.docker.network=dokploy-network
      - traefik.http.routers.timseil-api.rule=Host(`timseil.dev`)
      - traefik.http.routers.timseil-api.priority=100
      - traefik.http.services.timseil-api.loadbalancer.server.port=8080
    networks: [default]
    expose:
      - "8080"
'
write_prod "$api_head$default_only$limited"
rejects "routed service on the default network alone rejected" tools/check-compose.sh

write_prod "services:
  db:
    image: postgres:18.6-alpine@sha256:1111111111111111111111111111111111111111111111111111111111111111
    networks: [default, dokploy-network]
$limited"
rejects "db in the proxy network rejected" tools/check-compose.sh

write_prod "services:
  db:
    image: postgres:18.6-alpine@sha256:1111111111111111111111111111111111111111111111111111111111111111
$limited"
accepts "db with no networks key accepted" tools/check-compose.sh

# Rule 12. Without external: true compose does not fail — it creates its own
# network, the stack goes green, and traefik is on neither of them.
write_prod "$api_head$routed$limited" ''
rejects "proxy network used but never declared rejected" tools/check-compose.sh

write_prod "$api_head$routed$limited" 'networks:
  dokploy-network:
    driver: bridge
'
rejects "proxy network declared without external: true rejected" tools/check-compose.sh

# Rule 13. Traefik orders by rule length when nobody says otherwise, so this
# file would route correctly today and silently stop the day somebody rewords a
# rule — Next.js answering /api/* with its own 404 page.
no_priority='    labels:
      - traefik.enable=true
      - traefik.docker.network=dokploy-network
      - traefik.http.routers.timseil-api.rule=Host(`timseil.dev`)
      - traefik.http.services.timseil-api.loadbalancer.server.port=8080
    networks: [default, dokploy-network]
    expose:
      - "8080"
'
write_prod "$api_head$no_priority$limited"
rejects "router rule without an explicit priority rejected" tools/check-compose.sh

# Rule 14. `log` in the production file is the failure that looks like success:
# every submission answered 202, nothing delivered, nothing red anywhere. The
# accepted case is the passthrough, and `smtp` is refused alongside `log`
# because the default belongs to internal/config and nowhere else.
passthrough='    environment:
      MAIL_TRANSPORT: ${MAIL_TRANSPORT:-}
'
write_prod "$api_head$passthrough$routed$limited"
accepts "MAIL_TRANSPORT passed through accepted" tools/check-compose.sh

pinned_log='    environment:
      MAIL_TRANSPORT: ${MAIL_TRANSPORT:-log}
'
write_prod "$api_head$pinned_log$routed$limited"
rejects "MAIL_TRANSPORT pinned to log in the production compose rejected" tools/check-compose.sh

pinned_smtp='    environment:
      MAIL_TRANSPORT: smtp
'
write_prod "$api_head$pinned_smtp$routed$limited"
rejects "MAIL_TRANSPORT pinned to smtp in the production compose rejected" tools/check-compose.sh

# The dev file pins `log` on purpose — a dev stack must not send as the
# production account — so the rule must not reach into it.
write_dev 'services:
  api:
    environment:
      MAIL_TRANSPORT: ${MAIL_TRANSPORT:-log}
'
rm -f compose.yaml
accepts "MAIL_TRANSPORT pinned in the dev compose accepted" tools/check-compose.sh

rm -f compose.dev.yaml compose.yaml

# Rule 14b. A service that names a middleware defines it.
#
# The failure this catches does not go red anywhere: every container is healthy,
# Traefik has a router in error, and the path answers 404. It cost a production
# deploy on 2026-08-22 to find, so it gets its broken cases here.
#
# The second service is `edge`, not `web`: rule 9 demands the complete label set
# from `api` and `web` BY NAME, and a case that also tripped that one would stop
# failing for the reason it is named after.
mw_def='      - traefik.http.middlewares.timseil-www.redirectregex.regex=^https://www\.x\.dev/(.*)
      - traefik.http.middlewares.timseil-www.redirectregex.permanent=true
'

write_prod "services:
  api:
    image: ghcr.io/g1ng4r/timseil-api:\${IMAGE_TAG}
$routed      - traefik.http.routers.timseil-api.middlewares=timseil-www@docker
$mw_def$limited"
accepts "a service that defines the middleware it names accepted" tools/check-compose.sh

# The state compose.yaml was in until E5b: the api router named timseil-www and
# only web defined it. Green everywhere, 404 whenever web is not up.
write_prod "services:
  api:
    image: ghcr.io/g1ng4r/timseil-api:\${IMAGE_TAG}
$routed      - traefik.http.routers.timseil-api.middlewares=timseil-www@docker
$limited"
refuses "a router naming a middleware its service does not define rejected" \
  "does not define it" tools/check-compose.sh

# The worse one. Two services, one name, two bodies — Traefik logs `defined
# multiple times with different configurations` and then discards BOTH, so the
# router disappears rather than picking a side.
write_prod "services:
  api:
    image: ghcr.io/g1ng4r/timseil-api:\${IMAGE_TAG}
$routed      - traefik.http.routers.timseil-api.middlewares=timseil-www@docker
$mw_def$limited  edge:
    image: ghcr.io/g1ng4r/timseil-web:\${IMAGE_TAG}
    labels:
      - traefik.http.middlewares.timseil-www.redirectregex.regex=^https://www\.OTHER\.dev/(.*)
      - traefik.http.middlewares.timseil-www.redirectregex.permanent=true
$limited"
refuses "two services disagreeing about one middleware rejected" \
  "two versions of" tools/check-compose.sh

# Word for word at both, which is what compose.yaml now does on purpose.
write_prod "services:
  api:
    image: ghcr.io/g1ng4r/timseil-api:\${IMAGE_TAG}
$routed      - traefik.http.routers.timseil-api.middlewares=timseil-www@docker
$mw_def$limited  edge:
    image: ghcr.io/g1ng4r/timseil-web:\${IMAGE_TAG}
    labels:
      - traefik.http.routers.timseil-edge.middlewares=timseil-www@docker
$mw_def$limited"
accepts "the same middleware at two services, word for word, accepted" tools/check-compose.sh

# Another provider's middleware. It belongs to Dokploy's own configuration,
# which this repository does not version, so requiring a definition here would
# be requiring something that cannot exist.
write_prod "services:
  api:
    image: ghcr.io/g1ng4r/timseil-api:\${IMAGE_TAG}
$routed      - traefik.http.routers.timseil-api.middlewares=redirect-to-https@file
$limited"
accepts "a middleware from another provider accepted" tools/check-compose.sh

rm -f compose.yaml

# Rule 15. The twins may extend and do nothing else.
#
# A twin that has drifted from its original is the worst shape available here:
# it carries a stale router, real visitors are load-balanced onto it during
# every rollout, and nothing goes red. So the file is allowed one shape and the
# broken case is any second line.
write_rollout() { printf '%s' "$1" > compose.rollout.yaml; }

write_rollout 'services:
  api2:
    extends:
      file: compose.yaml
      service: api
'
accepts "a twin that only extends accepted" tools/check-compose.sh

write_rollout 'services:
  api2:
    extends:
      file: compose.yaml
      service: api
    image: ghcr.io/g1ng4r/timseil-api:${IMAGE_TAG}
'
rejects "a twin with an image of its own rejected" tools/check-compose.sh

# The one that would actually happen: somebody edits a router on api and not on
# its twin, and half the requests during a deploy meet last week's rule.
write_rollout 'services:
  web2:
    extends:
      file: compose.yaml
      service: web
    labels:
      - traefik.http.routers.timseil-web.priority=10
'
rejects "a twin with a label of its own rejected" tools/check-compose.sh
rm -f compose.rollout.yaml

# Rule 16. stop_grace_period is written in compose.yaml and restated in Go,
# because the process cannot read the file it runs under. Two copies of one
# number and no runtime that notices when only one of them moves.
mkdir -p api/internal/config
write_go_grace() { printf 'const (\n\tstopGracePeriod = %s * time.Second\n)\n' "$1" > api/internal/config/config.go; }

write_prod "$api_head$routed$limited    stop_grace_period: 30s
"
write_go_grace 30
accepts "stop_grace_period agreeing on both sides accepted" tools/check-compose.sh

write_go_grace 45
rejects "stop_grace_period disagreeing rejected" tools/check-compose.sh

# The failure that a check reading only one side would report as success: the
# constant renamed away, so the parser finds nothing and has nothing to compare.
printf 'const ()\n' > api/internal/config/config.go
refuses "stop_grace_period unreadable in Go rejected" "could not read" tools/check-compose.sh
rm -rf api compose.yaml

accepts "absent compose files skip" tools/check-compose.sh

printf 'dockerfiles\n'
# Five rules, and every one of them is invisible until it matters: a moved tag,
# a rotated secret still readable in `docker history`, a container that turned
# out to be root, a layer nobody needed, a published image nothing links back
# to a commit. Each gets its broken case.
digest='@sha256:0000000000000000000000000000000000000000000000000000000000000000'

mkdir -p api web

# The writers append the source label, so a fixture written to break rule 1 is
# rejected BY rule 1 and not incidentally by rule 5. The one case that has to
# arrive without the label writes its file directly.
srclabel='LABEL org.opencontainers.image.source="https://example.test/repo"'
write_api() { { printf '%s' "$1"; printf '%s\n' "$srclabel"; } > api/Dockerfile; }
write_web() { { printf '%s' "$1"; printf '%s\n' "$srclabel"; } > web/Dockerfile; }

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

# 5 — no source label. E3 signs these images and E4 pushes them; an image
# nothing links back to a commit starts the provenance chain one link short.
# Written directly, because the writer above would add the very line under test.
write_web "FROM node:24-alpine$digest
USER node
"
printf 'FROM gcr.io/distroless/static:nonroot%s\nUSER nonroot:nonroot\n' "$digest" > api/Dockerfile
rejects "production image without image.source rejected" tools/check-dockerfiles.sh

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

printf 'lint\n'
# Five things, and two of them are about a check reporting success for work it
# never did.
#
# A fake linter, so the assertions do not depend on whether this machine has the
# real one. It answers a version and an exit code, which is all check-lint.sh
# reads out of it.
mkdir -p api fakebin
printf 'module example.test/api\n\ngo 1.26.0\n' > api/go.mod
printf '#!/bin/sh\necho "golangci-lint has version 2.13.1 built with go1.26"\nexit 0\n' > fakebin/lint-ok  && chmod +x fakebin/lint-ok
printf '#!/bin/sh\necho "golangci-lint has version 2.13.1 built with go1.26"\nexit 1\n' > fakebin/lint-bad && chmod +x fakebin/lint-bad
printf '#!/bin/sh\necho "golangci-lint has version 2.9.0 built with go1.26"\nexit 0\n'  > fakebin/lint-old && chmod +x fakebin/lint-old
printf 'version: "2"\n' > .golangci.yml
printf 'v2.13.1\n' > .golangci-lint-version

lint_check() { CHECK_LINT_BIN="$1" tools/check-lint.sh "$tmp"; }

accepts "clean lint run accepted"     lint_check "$tmp/fakebin/lint-ok"
rejects "a finding is rejected"       lint_check "$tmp/fakebin/lint-bad"

# Without the config the linter would run its own default ruleset, which is not
# the one CI blocks on. A check that silently measures something else is worse
# than one that is missing.
mv .golangci.yml .golangci.yml.away
rejects "missing .golangci.yml rejected" lint_check "$tmp/fakebin/lint-ok"
mv .golangci.yml.away .golangci.yml

# One version, one place. CI hands the same file to the action that installs the
# binary, so a laptop running something else is linting against another ruleset
# than the one that blocks the merge — the drift .nvmrc exists to prevent, one
# tool over.
rejects "linter version that disagrees with the file rejected" lint_check "$tmp/fakebin/lint-old"

mv .golangci-lint-version .golangci-lint-version.away
rejects "missing .golangci-lint-version rejected" lint_check "$tmp/fakebin/lint-ok"
mv .golangci-lint-version.away .golangci-lint-version

# The floor under the skip, and the case E1 paid for: check-node.sh skipped
# itself on a runner with no node, and the job went green having checked
# nothing. Off a runner the skip is a convenience; on one it is a lie.
accepts "absent linter skips locally"    env -u CI CHECK_LINT_BIN="$tmp/fakebin/not-here" tools/check-lint.sh "$tmp"
rejects "absent linter rejected under CI" env CI=1 CHECK_LINT_BIN="$tmp/fakebin/not-here" tools/check-lint.sh "$tmp"

rm -rf api fakebin .golangci.yml .golangci-lint-version

printf 'versions\n'
# Two files naming the same runtime, and nothing comparing them — the shape
# that cost 21 reachable standard-library vulnerabilities on the day this was
# written. Both directions get their broken case, because both happened: the go
# one from a stale `go` directive, the node one from a Dependabot pull request
# offering a major CLAUDE.md refuses.
mkdir -p api web
printf '24\n' > .nvmrc
printf 'module example.test/api\n\ngo 1.26.6\n' > api/go.mod
printf 'FROM golang:1.26-alpine\n' > api/Dockerfile
printf 'FROM node:24-alpine\n'     > web/Dockerfile

accepts "matching runtime versions accepted" tools/check-versions.sh "$tmp"

printf 'FROM node:26-alpine\n' > web/Dockerfile
rejects "a node major the .nvmrc does not declare rejected" tools/check-versions.sh "$tmp"
printf 'FROM node:24-alpine\n' > web/Dockerfile

printf 'FROM golang:1.27-alpine\n' > api/Dockerfile
rejects "a go line the go.mod does not declare rejected" tools/check-versions.sh "$tmp"

# The patch level is deliberately NOT compared: the tag pins a line and wants
# its newest patch, so go.mod 1.26.6 against golang:1.26-alpine has to pass.
# A check that failed here would go red on every upstream release.
printf 'FROM golang:1.26-alpine\n' > api/Dockerfile
printf 'module example.test/api\n\ngo 1.26.0\n' > api/go.mod
accepts "a patch difference inside the same line accepted" tools/check-versions.sh "$tmp"

# The digest is cut off before the tag is read; whether it IS one is rule 1 of
# check-dockerfiles, not this check's business.
printf 'ARG NODE_IMAGE=node:24-alpine@sha256:1111111111111111111111111111111111111111111111111111111111111111\nFROM ${NODE_IMAGE}\n' > web/Dockerfile
accepts "a digest-pinned image still reads its tag" tools/check-versions.sh "$tmp"

printf '\n' > .nvmrc
rejects "an empty .nvmrc rejected" tools/check-versions.sh "$tmp"

rm -rf api web .nvmrc

printf 'tidy\n'
# A module with no dependencies at all, so `go mod tidy -diff` needs neither
# the network nor a warm module cache to have an opinion: with an empty go.sum
# it has nothing to say, and with a line in it that nothing requires it wants
# that line gone.
#
# go.mod was untidy here from B2 until B3 and nothing noticed; go.sum was short
# 49 checksums until the commit that added this check. Both are the shape this
# holds against.
mkdir -p tidymod
printf 'module example.test/tidy\n\ngo 1.26.6\n' > tidymod/go.mod
printf 'package tidy\n\nfunc Nothing() {}\n'      > tidymod/tidy.go
: > tidymod/go.sum

accepts "a tidy module accepted" env CHECK_TIDY_DIR="$tmp/tidymod" tools/check-tidy.sh

printf 'example.test/ghost v1.0.0/go.mod h1:0000000000000000000000000000000000000000000=\n' > tidymod/go.sum
rejects "a go.sum line nothing requires rejected" env CHECK_TIDY_DIR="$tmp/tidymod" tools/check-tidy.sh

accepts "absent module skips" env CHECK_TIDY_DIR="$tmp/no-such-module" tools/check-tidy.sh
rm -rf tidymod

printf 'env\n'
# Adding one variable means editing six files, and ADR 0023 records that the
# bill was paid three times: C5 with GITHUB_TOKEN, C6 with five at once, C7
# with two, and something was missed on the first pass every time.
mkdir -p envtree/api/internal/config envtree/docs/runbooks
write_env() {
  printf 'const (\n\tEnvDatabaseURL = "DATABASE_URL"\n\tEnvLogLevel    = "LOG_LEVEL"\n)\n' \
    > envtree/api/internal/config/config.go
  printf '%s' "$1" > envtree/.env.example
  printf '%s' "$2" > envtree/docs/runbooks/api.md
  printf '%s' "$3" > envtree/compose.dev.yaml
}
good_example='DATABASE_URL=x\nLOG_LEVEL=info\n'
good_runbook='| `DATABASE_URL` | — |\n| `LOG_LEVEL` | info |\n'
good_compose='services:\n  api:\n    environment:\n      DATABASE_URL: x\n      LOG_LEVEL: info\n'
env_check() { tools/check-env.sh "$tmp/envtree"; }

write_env "$(printf "$good_example")" "$(printf "$good_runbook")" "$(printf "$good_compose")"
accepts "every variable in all three places accepted" env_check

write_env "$(printf 'DATABASE_URL=x\n')" "$(printf "$good_runbook")" "$(printf "$good_compose")"
rejects "a variable missing from .env.example rejected" env_check

write_env "$(printf "$good_example")" "$(printf '| `DATABASE_URL` | — |\n')" "$(printf "$good_compose")"
rejects "a variable missing from the runbook rejected" env_check

write_env "$(printf "$good_example")" "$(printf "$good_runbook")" "$(printf 'services:\n  api:\n    environment:\n      DATABASE_URL: x\n')"
rejects "a variable missing from compose.dev.yaml rejected" env_check

# The prefix ships the VALUE to a browser at build time and cannot be taken
# back once a build has gone out.
write_env "$(printf "$good_example")NEXT_PUBLIC_SMTP_PASSWORD=hunter2\n" "$(printf "$good_runbook")" "$(printf "$good_compose")"
rejects "a secret behind NEXT_PUBLIC_ rejected" env_check

# A const block the parser no longer recognises would make this check read
# nothing and report success on everything — the failure mode that matters most.
write_env "$(printf "$good_example")" "$(printf "$good_runbook")" "$(printf "$good_compose")"
printf 'package config\n' > envtree/api/internal/config/config.go
rejects "a config.go with no Env constants rejected" env_check

rm -rf envtree

printf 'adrs\n'
# A comment can carry a paragraph of reasoning and point it at a decision
# nobody wrote. The busiest number in this repository is referenced 64 times,
# so a dangling one is a lot of prose aimed at nothing.
#
# The number that must NOT resolve is assembled with printf at runtime. Written
# out, it would be a finding about the example — tools/check-adrs.sh scans this
# file too, exactly as check-secrets.sh scans its own planted key.
mkdir -p adrtree/docs/adr adrtree/tools
adr_check() { tools/check-adrs.sh "$tmp/adrtree"; }
ghost=9999

: > adrtree/docs/adr/0001-first.md
: > adrtree/docs/adr/0002-second.md
printf 'see ADR 0002 for the reasoning\n' > adrtree/tools/note.sh
accepts "references that resolve accepted" adr_check

printf 'see ADR %s for the reasoning\n' "$ghost" > adrtree/tools/note.sh
rejects "a reference to a decision nobody wrote rejected" adr_check
printf 'see ADR 0002 for the reasoning\n' > adrtree/tools/note.sh

# A missing number looks the same from outside as one that was never written.
mv adrtree/docs/adr/0002-second.md adrtree/docs/adr/0003-third.md
printf 'see ADR 0003 for the reasoning\n' > adrtree/tools/note.sh
rejects "a gap in the sequence rejected" adr_check
mv adrtree/docs/adr/0003-third.md adrtree/docs/adr/0002-second.md
printf 'see ADR 0002 for the reasoning\n' > adrtree/tools/note.sh

: > adrtree/docs/adr/0002-second-take.md
rejects "two files claiming one number rejected" adr_check
rm -f adrtree/docs/adr/0002-second-take.md

accepts "back to a consistent tree" adr_check
rm -rf adrtree

printf 'readme\n'
# The quickstart is the first thing a stranger runs, and a renamed target turns
# it into a lie that nobody who already has the repo would ever notice.
# The Makefile in this throwaway tree is the real one, copied at the top.
write_readme() { printf '%s' "$1" > README.md; }

write_readme '# x

## Quickstart

```bash
make check
make images && make check-images
```
'
accepts "quickstart naming real targets accepted" tools/check-readme.sh "$tmp"

write_readme '# x

## Quickstart

```bash
make check
make check-everything-twice
```
'
rejects "a quickstart target the Makefile lacks rejected" tools/check-readme.sh "$tmp"

# A renamed heading would leave the extractor with an empty string, and a check
# that reads nothing passes on everything.
write_readme '# x

## Getting started

```bash
make check
```
'
rejects "a renamed Quickstart heading rejected" tools/check-readme.sh "$tmp"

write_readme '# x

## Quickstart

```bash
git clone https://example.test/x
```
'
rejects "a quickstart with no make target at all rejected" tools/check-readme.sh "$tmp"

# --print is what the CI job executes, so it has to hand back the block itself
# rather than a description of it.
write_readme '# x

## Quickstart

```bash
make check
```
'
if [ "$(tools/check-readme.sh --print "$tmp")" = "make check" ]; then
  ok "--print returns the block the job runs"
else
  no "--print returns the block the job runs"
fi
rm -f README.md

printf 'version\n'
# The expression this replaces named a backup tag as the project's version, on
# the public /api/health, for as long as the image built from it ran (#112).
# The rule is that only a release tag counts; these are the shapes that rule has
# to survive.
#
# A repository with one commit is enough, so none of this touches the network.
mkdir -p vermod
(
  cd vermod
  git init -q -b main .
  git config user.email selftest@localhost
  git config user.name selftest
  git config commit.gpgsign false
  : > a.txt && git add a.txt && git commit -qm "one"
) >/dev/null 2>&1

ver() { CHECK_VERSION_DIR="$tmp/vermod" tools/version.sh; }
short() { git -C "$tmp/vermod" rev-parse --short=7 HEAD; }
says() { # says <expected> <description>
  if [ "$(ver)" = "$1" ]; then ok "$2"; else no "$2 (got $(ver), want $1)"; fi
}

says "$(short)" "no tags at all answers the short sha"

# THE case. This is the tree that produced the wrong version.
git -C "$tmp/vermod" tag backup/pre-rewrite-2026-08-17 >/dev/null 2>&1
says "$(short)" "a backup tag does not name a version"

git -C "$tmp/vermod" tag v1.2.3 >/dev/null 2>&1
says "v1.2.3" "a release tag does, even beside a backup tag"

(cd vermod && : > b.txt && git add b.txt && git commit -qm "two") >/dev/null 2>&1
(cd vermod && : > c.txt && git add c.txt && git commit -qm "three") >/dev/null 2>&1
says "v1.2.3-2-g$(git -C "$tmp/vermod" rev-parse --short HEAD)" "commits after a release tag are counted"

# A build that is not the commit it names has to say so out loud.
printf 'uncommitted\n' > vermod/dirty.txt
(cd vermod && git add dirty.txt) >/dev/null 2>&1
case "$(ver)" in *-dirty) ok "a dirty tree is named as dirty" ;;
                 *) no "a dirty tree is named as dirty (got $(ver))" ;; esac

accepts "somewhere that is not a repository answers dev" \
  sh -c "[ \"\$(CHECK_VERSION_DIR=$tmp/not-a-repo tools/version.sh)\" = dev ]"

rm -rf vermod

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

# The supply-chain check reads its cosign pin from .cosign-image, and a pin that
# is empty or not a digest makes docker answer "invalid reference format" —
# which the check would otherwise report as "no valid signature". A gate that
# names the wrong cause sends the reader to the wrong place, so the guard is
# held here. It runs before any docker or network call, which is why this stays
# inside the docker-free chain.
printf 'supply-chain pin\n'
accepts "the shipped pin is a digest"          grep -q "@sha256:" .cosign-image
cp .cosign-image cosign-image.good
printf '# only a comment\n' > .cosign-image
rejects "an empty cosign pin is rejected"     tools/verify-supply-chain.sh sha-nothing
printf 'ghcr.io/sigstore/cosign/cosign:v3\n' > .cosign-image
rejects "a tag-pinned cosign image is rejected" tools/verify-supply-chain.sh sha-nothing
cp cosign-image.good .cosign-image && rm cosign-image.good

# --------------------------------------------------------------------- pins
#
# The four tools no ecosystem lifts. check-secrets.sh and sbom.sh are copied
# into this throwaway repository for no other reason than this section: they are
# where two of the four pins live, and a check that finds its inputs by shape
# has to be tested against a tree that actually contains them.
#
# .golangci-lint-version is written here rather than copied, because the lint
# section above deletes it when it is done — and a fixture that depends on
# another section not having tidied up is a test that fails for a reason that
# has nothing to do with what it checks.
printf 'pins\n'
printf 'v2.13.1\n' > .golangci-lint-version
accepts "four pinned tools with digests and versions accepted" tools/check-pins.sh .

cp tools/sbom.sh sbom.good
sed -i 's/^# syft v[0-9.]*$/# syft/' tools/sbom.sh
refuses "a pin with no readable version rejected" "no readable version" tools/check-pins.sh .
cp sbom.good tools/sbom.sh

sed -i 's/@sha256:678bfa565b60f747aac0f8e964fe5588a24445b8d0a480e91f6efd70020dfbb0/@sha256:678bfa565b60f747aac0f8e964fe5588a/' tools/sbom.sh
refuses "a truncated digest rejected" "not 64" tools/check-pins.sh .
cp sbom.good tools/sbom.sh

# The failure mode a green log hides: the scan stopped finding things. Without
# this the check would pass loudly on a tree where three of the four pins had
# moved somewhere it does not look.
mv tools/sbom.sh sbom.hidden
refuses "a scan that lost a pin rejected" "expected at least the four" tools/check-pins.sh .
mv sbom.hidden tools/sbom.sh
rm -f sbom.good

accepts "back to four pins" tools/check-pins.sh .

# ------------------------------------------------------------------- deploy
#
# The guards that stand between a merge and production, tested where they can be
# tested: on their arguments and on their input, with no Dokploy, no network and
# no site.
#
# What is NOT here is the sixty-second timeout and the rollback that follows it.
# Both need a running deploy to fail, and a selftest that could fake one would be
# testing the fake. They are the drill in docs/runbooks/dokploy.md, run against
# production on purpose — the build plan's wording for E4 is "einmal wirklich
# provozieren", and that is a different instrument than this file.
printf 'deploy\n'

# The environment rewrite: the one destructive step of the phase, and the reason
# it is a separate script at all. Every case below took a live panel to reach
# while the logic still lived inside deploy.sh.
printf 'POSTGRES_PASSWORD=hunter2\nIMAGE_TAG=sha-a0872c1\nCORS=https://timseil.dev\n' > dep.env
accepts "one IMAGE_TAG line is rewritten"       tools/deploy-env.sh sha-1234abc dep.env dep.out
accepts "the previous tag is what it returns"   sh -c '[ "$(tools/deploy-env.sh sha-1234abc dep.env dep.out)" = "sha-a0872c1" ]'
accepts "the new tag is in the result"          grep -qx 'IMAGE_TAG=sha-1234abc' dep.out
accepts "the other lines are untouched"         grep -qx 'POSTGRES_PASSWORD=hunter2' dep.out

printf 'A=1\n' > dep-none.env
refuses "an environment with no IMAGE_TAG rejected" "0 IMAGE_TAG lines" tools/deploy-env.sh sha-1234abc dep-none.env dep.out
printf 'IMAGE_TAG=sha-aaaaaaa\nIMAGE_TAG=sha-bbbbbbb\n' > dep-two.env
refuses "two IMAGE_TAG lines rejected"          "2 IMAGE_TAG lines" tools/deploy-env.sh sha-1234abc dep-two.env dep.out
printf 'IMAGE_TAG=\n' > dep-empty.env
refuses "an empty IMAGE_TAG rejected"           "no rollback target" tools/deploy-env.sh sha-1234abc dep-empty.env dep.out
refuses "a missing environment file rejected"   "does not exist" tools/deploy-env.sh sha-1234abc dep-absent.env dep.out

# `latest` is the one that matters: the build plan mentions it and the rollback
# section of the runbook forbids it, because rolling back needs a name that
# cannot be repointed at other bytes.
refuses "latest rejected"                       "not a sha- tag" tools/deploy-env.sh latest dep.env dep.out
refuses "a non-hex tag rejected"                "not lowercase hexadecimal" tools/deploy-env.sh sha-abcdefg dep.env dep.out
refuses "a short tag rejected"                  "seven hex characters" tools/deploy-env.sh sha-abc12 dep.env dep.out

# The report. Every rule here restates api/internal/intake/validate.go and
# deploys_sha_shape_ck; one that drifts away from those shows up as a 400 the
# pipeline logs and nobody reads, which is a number that silently never arrived.
export INTERNAL_DEPLOY_TOKEN=selftest
refuses "an uppercase sha rejected"             "not lowercase hexadecimal" tools/report-deploy.sh ABCDEF1 10 ok
refuses "a six-character sha rejected"          "7 to 40 characters" tools/report-deploy.sh abcdef 10 ok
refuses "a negative duration rejected"          "whole number of seconds" tools/report-deploy.sh abcdef1 -1 ok
refuses "a non-numeric duration rejected"       "whole number of seconds" tools/report-deploy.sh abcdef1 ten ok
refuses "a result that is neither rejected"     "must be ok or rollback" tools/report-deploy.sh abcdef1 10 maybe
refuses "no token rejected"                     "INTERNAL_DEPLOY_TOKEN" env -u INTERNAL_DEPLOY_TOKEN tools/report-deploy.sh abcdef1 10 ok
unset INTERNAL_DEPLOY_TOKEN

# The verify gate refuses a sha it could never see. Its timeout is not exercised
# here — see the note at the top of this section.
refuses "verify refuses an uppercase sha"       "not lowercase hexadecimal" tools/verify-deploy.sh ABCDEF1
refuses "verify refuses a short sha"            "shorter than seven" tools/verify-deploy.sh abcdef

# THE NO-OP, and it needs a server rather than an argument check — this is the
# one condition that only exists as a behaviour over time. A static tree served
# on loopback is enough: /api/health is a file, / is index.html.
#
# Found on 2026-08-22 by a drill that passed in three seconds and should have
# taken sixty: dokploy answers when it has ACCEPTED the deploy, so the first
# sample is still the old process. Harmless while the sha differs, and a green
# tick over nothing when it does not — which is every redeploy of a tag that was
# republished onto new bytes.
mkdir -p noop/api
printf '{"status":"ok","sha":"1234abc","startedAt":"2026-08-22T10:00:00Z"}\n' > noop/api/health
printf 'ok\n' > noop/index.html
( cd noop && exec python3 -m http.server 8731 --bind 127.0.0.1 >/dev/null 2>&1 ) &
NOOP_PID=$!
NOOP=http://127.0.0.1:8731
for _ in 1 2 3 4 5 6 7 8 9 10; do
  curl -s -o /dev/null --max-time 1 "$NOOP/api/health" && break
  sleep 0.3
done

accepts "verify accepts a build that is up" \
  env VERIFY_BASE_URL="$NOOP" tools/verify-deploy.sh 1234abc

# The same document, and now the caller knows which process was answering before
# the deploy. Nothing restarted, so nothing may be accepted. `timeout` rather
# than the full sixty seconds: what is being proven is that it does not say yes
# on the first sample, and that is decided in the first three.
# Not `refuses` with an empty pattern: the timeout kills the script before it can
# print its closing line, so there is no message to match on and the assertion
# would collapse to "it exited non-zero" — the weakness the whole `rejects` →
# `refuses` change was about. What is asserted instead is the thing that matters:
# it never printed the sentence that means yes.
accepts "verify will not accept the process that was already answering" \
  sh -c "VERIFY_BASE_URL=$NOOP VERIFY_PREVIOUS_START=2026-08-22T10:00:00Z timeout 6 tools/verify-deploy.sh 1234abc > noop.out 2>&1; [ \$? -ne 0 ] && ! grep -q 'status ok . sha' noop.out"
accepts "and it says which process it is waiting past" \
  grep -q 'did not start at 2026-08-22T10:00:00Z' noop.out
rm -f noop.out

accepts "verify accepts once the process is a new one" \
  env VERIFY_BASE_URL="$NOOP" VERIFY_PREVIOUS_START=2026-08-22T09:00:00Z \
      tools/verify-deploy.sh 1234abc

# And it says which of the two it is doing, because a condition that silently
# was not made is the failure this whole phase is about.
accepts "verify names the process it will not accept" \
  sh -c "VERIFY_BASE_URL=$NOOP VERIFY_PREVIOUS_START=2026-08-22T09:00:00Z tools/verify-deploy.sh 1234abc | grep -q 'did not start at'"
accepts "verify warns when it cannot tell a no-op apart" \
  sh -c "VERIFY_BASE_URL=$NOOP tools/verify-deploy.sh 1234abc | grep -q 'no previous startedAt'"

accepts "--started reads the instant back out" \
  sh -c "[ \"\$(VERIFY_BASE_URL=$NOOP tools/verify-deploy.sh --started)\" = 2026-08-22T10:00:00Z ]"
accepts "--started is empty and calm when nothing answers" \
  sh -c "[ -z \"\$(VERIFY_BASE_URL=http://127.0.0.1:1 tools/verify-deploy.sh --started)\" ]"

# THE WITNESS. The same no-op tree serves it, and that is not laziness: a static
# file server answers 200 for a path that exists and 404 for one that does not,
# which is exactly the two answers the drill saw and the only two this script has
# to tell apart.
refuses "the witness refuses to run without an end"  "say when to stop" tools/witness.sh
refuses "the witness refuses two ends at once"       "different things" tools/witness.sh --seconds 3 --until-sha 1234abc
refuses "the witness refuses zero seconds"           "positive whole number" tools/witness.sh --seconds 0
refuses "the witness refuses an uppercase sha"       "not lowercase hexadecimal" tools/witness.sh --until-sha ABCDEF1
refuses "the witness refuses a short sha"            "shorter than seven" tools/witness.sh --until-sha abcdef
refuses "the witness refuses a path without a slash" "starts with /" tools/witness.sh --seconds 2 --path health
# Without /api/health there is nothing to read .startedAt from, and the run could
# only end at the guard rail — fifteen minutes to learn that an argument was wrong.
refuses "the witness refuses --until-sha with no health path" \
  "not in the paths" tools/witness.sh --until-sha 1234abc --path /
refuses "the witness refuses --until-restart with no health path" \
  "not in the paths" tools/witness.sh --until-restart --path /
refuses "the witness refuses three ends at once" \
  "different things" tools/witness.sh --until-restart --until-sha 1234abc

accepts "the witness accepts a site that stays 200" \
  env WITNESS_BASE_URL="$NOOP" tools/witness.sh --seconds 2 --path / --path /api/health

# The reason this file exists. A witness that counted only 5xx would call this
# green, and every visitor in that window read "this page does not exist".
accepts "the witness fails on a 404, not only on a 5xx" \
  sh -c "! WITNESS_BASE_URL=$NOOP tools/witness.sh --seconds 2 --path /does-not-exist > w.out 2>&1; grep -q '2.404' w.out"
accepts "and nothing answering at all counts as well" \
  sh -c "! WITNESS_BASE_URL=http://127.0.0.1:1 tools/witness.sh --seconds 2 --path / > w.out 2>&1; grep -q 'no connection' w.out"

# A run that never saw the build it was told to watch has measured some other
# window. Green over that would be a tick above a measurement that did not take
# place — the lie deploy-gate.sh refuses about a rollback, one instrument along.
accepts "the witness refuses a window that never carried the sha" \
  sh -c "! WITNESS_BASE_URL=$NOOP WITNESS_TAIL_SEC=1 WITNESS_MAX_SEC=2 tools/witness.sh --until-sha 9999999 > w.out 2>&1; grep -q 'never answered' w.out"

# AND THE OTHER DIRECTION, which cost a real measurement on 2026-08-22. Started
# after the swap, /api/health answers the target sha on the very first sample and
# nothing ever restarts. The sha condition alone said yes to that. This document
# is static, so it IS that case, exactly.
accepts "the witness refuses a window that began after the swap" \
  sh -c "! WITNESS_BASE_URL=$NOOP WITNESS_TAIL_SEC=1 WITNESS_MAX_SEC=2 tools/witness.sh --until-sha 1234abc > w.out 2>&1; grep -q 'already answering' w.out"
accepts "and it says what to do instead" \
  grep -q -- '--until-restart' w.out
accepts "the same window is refused without a sha at all" \
  sh -c "! WITNESS_BASE_URL=$NOOP WITNESS_TAIL_SEC=1 WITNESS_MAX_SEC=2 tools/witness.sh --until-restart > w.out 2>&1; grep -q 'no new process' w.out"

# The accept path needs a process that actually changes, so the document has to
# change under the witness. A fixture that could only ever say no would leave the
# yes untested — and a condition nothing can satisfy is the failure one door down
# from a condition everything satisfies.
( sleep 3; printf '{"status":"ok","sha":"1234abc","startedAt":"2026-08-22T11:00:00Z"}\n' > noop/api/health ) &
accepts "the witness accepts a window in which the process restarted" \
  env WITNESS_BASE_URL="$NOOP" WITNESS_TAIL_SEC=1 WITNESS_MAX_SEC=20 tools/witness.sh --until-restart
printf '{"status":"ok","sha":"1234abc","startedAt":"2026-08-22T10:00:00Z"}\n' > noop/api/health
rm -f w.out

kill "$NOOP_PID" 2>/dev/null
rm -rf noop

# The gate's third argument has no default anywhere, and these two are what keep
# it that way: a duration measured from a clock the pipeline started itself would
# describe the last two steps while claiming all seven.
refuses "the gate refuses a non-numeric start"  "must be epoch seconds" tools/deploy-gate.sh sha-1234abc 1234abc now
refuses "the gate refuses a missing start"      "started-at-epoch" tools/deploy-gate.sh sha-1234abc 1234abc

# The drill, in both directions. Neither half is a lie the gate may tell by
# itself: a tag and a sha that disagree without the flag is two typos deploying
# one build and verifying another, and the flag without a disagreement is a
# leftover environment variable swallowing the report of a real deploy. Both
# refuse before the tunnel, before the prune window, before anything is sent.
refuses "a mismatched tag and sha need the drill flag" "DEPLOY_DRILL=1" \
  tools/deploy-gate.sh sha-1234abc 7654321 1700000000
refuses "the drill flag without a mismatch rejected"   "not a drill" \
  env DEPLOY_DRILL=1 tools/deploy-gate.sh sha-1234abc 1234abc 1700000000

rm -f dep.env dep.out dep-none.env dep-two.env dep-empty.env

# ----------------------------------------------------------------- deployed
#
# What is provable with no network: everything before the first request. Given a
# sha on the command line the script never asks GitHub what main is, and that is
# the seam every case below uses.
#
# What is NOT here, for the same reason the deploy block above gives: the
# tolerance arithmetic, the digest comparison and the rate-limit branch all need
# a health document and a registry, and a selftest that could fake those would be
# testing the fake. They are the acceptance in docs/runbooks/dokploy.md.
printf 'deployed\n'

refuses "check-deployed refuses an uppercase sha" "not lowercase hexadecimal" tools/check-deployed.sh ABCDEF1
refuses "check-deployed refuses latest"           "not lowercase hexadecimal" tools/check-deployed.sh latest
refuses "check-deployed refuses a short sha"      "seven hex characters"      tools/check-deployed.sh abcdef
refuses "check-deployed refuses a long sha"       "seven hex characters"      tools/check-deployed.sh ae939d4ab
refuses "check-deployed refuses an unknown flag"  "unknown flag"              tools/check-deployed.sh --hosts

# The claim is about the PUBLIC site. Answered over plaintext, it is answered by
# whoever is on the path.
refuses "an http base url rejected" "is not https" \
  env VERIFY_BASE_URL=http://timseil.dev tools/check-deployed.sh abcdef1

# A site that does not answer is a failure, never a skip. A green run that meant
# nothing is the entire reason this file exists.
refuses "no answer from the site is a failure" "did not answer 200" \
  env VERIFY_BASE_URL=http://127.0.0.1:1 tools/check-deployed.sh abcdef1

# And the claim that cannot be made here is announced even on the failure path.
# Dropping it quietly would leave the reader believing the digest was compared.
refuses "the unmade digest claim is announced when the run fails" "not asked here" \
  env VERIFY_BASE_URL=http://127.0.0.1:1 tools/check-deployed.sh abcdef1

# registry.sh assembles a URL out of its arguments, so nothing may be smuggled in.
refuses "registry.sh refuses an unknown subcommand" "usage"                 tools/registry.sh fetch timseil-api sha-abc1234
refuses "registry.sh refuses a foreign repository" "not timseil-api"        tools/registry.sh digest ubuntu latest
refuses "registry.sh refuses a path in a tag"      "not a valid tag"        tools/registry.sh digest timseil-api ../../etc
refuses "registry.sh refuses an empty repository"  "usage"                  tools/registry.sh digest

# ---------------------------------------------------------------- retention
#
# The one file here that destroys something, so its arithmetic is exercised on
# inventories rather than on the registry. A stand-in registry.sh answers out of
# fixture files and the health document comes from disk; both are the seams the
# header of prune-registry.sh describes.
#
# The fixture is the shape measured on 2026-08-22: four signed builds, two older
# unsigned ones, and an orphan — an index for bytes no tag resolves to, left
# behind when a re-run moved sha-ae939d4 onto new bytes.
printf 'registry retention\n'

mkdir -p fake fx
cat > fake/registry.sh <<'FAKE'
#!/bin/sh
set -eu
case $1 in
  tags)   cat "$FIXTURE/tags" ;;
  digest) sed -n "s/^$3	//p" "$FIXTURE/digests" | grep . ;;
  config) printf '{"created":"%s"}\n' "$(sed -n "s/^$3	//p" "$FIXTURE/created")" ;;
  index)  sed -n "s/^$3	//p" "$FIXTURE/children" | tr ' ' '\n' ;;
esac
FAKE
chmod +x fake/registry.sh

cat > fx/tags <<'T'
sha-3890180
sha-a0872c1
sha-c738b2a
sha-8acdd53
sha-581f5c0
sha-ae939d4
sha256-cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc
sha256-8888888888888888888888888888888888888888888888888888888888888888
sha256-5555555555555555555555555555555555555555555555555555555555555555
sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
sha256-0000000000000000000000000000000000000000000000000000000000000000
T
cat > fx/digests <<'T'
sha-3890180	sha256:3333333333333333333333333333333333333333333333333333333333333333
sha-a0872c1	sha256:1111111111111111111111111111111111111111111111111111111111111111
sha-c738b2a	sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc
sha-8acdd53	sha256:8888888888888888888888888888888888888888888888888888888888888888
sha-581f5c0	sha256:5555555555555555555555555555555555555555555555555555555555555555
sha-ae939d4	sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
T
cat > fx/created <<'T'
sha-3890180	2026-08-18T10:00:00Z
sha-a0872c1	2026-08-21T10:00:00Z
sha-c738b2a	2026-08-21T12:00:00Z
sha-8acdd53	2026-08-21T14:00:00Z
sha-581f5c0	2026-08-21T16:00:00Z
sha-ae939d4	2026-08-22T12:08:59Z
T
cat > fx/children <<'T'
sha256-0000000000000000000000000000000000000000000000000000000000000000	sha256:0a sha256:0b sha256:0c
sha256-cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc	sha256:ca sha256:cb sha256:cc
T
printf '{"sha":"ae939d4"}\n' > fx/health.json

PRUNE_REGISTRY_SH="$PWD/fake/registry.sh"; export PRUNE_REGISTRY_SH
PRUNE_HEALTH_FILE="$PWD/fx/health.json";   export PRUNE_HEALTH_FILE
FIXTURE="$PWD/fx";                         export FIXTURE

# The orphan goes: its index, its three bundles, and the build manifest behind
# them — in that order, because GHCR will not remove a manifest an index names.
accepts "the orphaned index is in the plan" \
  sh -c 'tools/prune-registry.sh timseil-api | grep -q "index   sha256-0000"'
accepts "the three orphan bundles are in the plan" \
  sh -c '[ "$(tools/prune-registry.sh timseil-api | grep -c "^    bundle")" = 3 ]'
accepts "the orphaned build manifest is in the plan" \
  sh -c 'tools/prune-registry.sh timseil-api | grep -q "build   sha256:0000"'

# And nothing else. This is the assertion that matters, and it is why the rule
# cannot reason about tags: the sigstore bundles are untagged by construction, so
# "delete the untagged ones" would take every signature in the registry with it.
accepts "a kept build's index is never in the plan" \
  sh -c '! tools/prune-registry.sh timseil-api | grep -q "sha256-cccc"'
accepts "a kept build's bundles are never in the plan" \
  sh -c '! tools/prune-registry.sh timseil-api | grep -q "sha256:ca"'
accepts "six builds under a window of ten means five removals" \
  sh -c '[ "$(tools/prune-registry.sh timseil-api | grep -cE "^    (index|bundle|build) ")" = 5 ]'

# Two builds survive the window closing on them: the one production serves, and
# one the README names as evidence. Both are read from the running system and
# from the file, never maintained in the rule.
accepts "the deployed build survives a window of one" \
  sh -c '! KEEP_BUILDS=1 tools/prune-registry.sh timseil-api | grep -q "sha256:aaaa"'
accepts "a build the README names survives" \
  sh -c '! KEEP_BUILDS=1 tools/prune-registry.sh timseil-api | grep -q "sha256:1111"'

# The guards. Each one is a way a plausible run destroys something.
printf '{"status":"ok"}\n' > fx/nosha.json
refuses "no answer from production deletes nothing" "could not read what production is running" \
  env PRUNE_HEALTH_FILE="$PWD/fx/nosha.json" tools/prune-registry.sh timseil-api
printf '{"sha":"9999999"}\n' > fx/gone.json
refuses "a running build absent from the registry stops it" "the inventory is wrong" \
  env PRUNE_HEALTH_FILE="$PWD/fx/gone.json" tools/prune-registry.sh timseil-api
# A build from the signed era whose index has vanished. Either somebody has
# already pruned by hand, or GHCR stopped writing the fallback tag — and both are
# a stop, because the next step would delete signatures it can no longer find.
# The two builds that predate signing never had an index and must NOT trip it.
grep -v '^sha256-8888' fx/tags > fx/tags.noindex && mv fx/tags.noindex fx/tags
refuses "a kept build with no signature artefacts stops it" "no signature artefacts" \
  tools/prune-registry.sh timseil-api
refuses "--delete without a token rejected" "GHCR_TOKEN" \
  env -u GHCR_TOKEN tools/prune-registry.sh --delete timseil-api
refuses "an unknown argument rejected" "usage" tools/prune-registry.sh --force

unset PRUNE_REGISTRY_SH PRUNE_HEALTH_FILE FIXTURE
rm -rf fake fx

printf 'the rollout chain\n'

# THE ROUND TRIP, and it is here because it already caught a real bug.
#
# --print builds Dokploy's Command field out of the steps; --check takes such a
# field apart again. If the two disagree, --check is comparing something other
# than what --print writes, and the assertion in tools/deploy.sh passes or fails
# for the wrong reason. The first version stripped every `-f`, including the one
# inside `rm -s -f api2 web2` — which quietly turned a WRONG panel setting into
# a matching one, exactly the direction a check must never be wrong in.
accepts "a printed command checks out against its own steps" \
  sh -c 'tools/rollout.sh --print -p someapp -f compose.yaml -f compose.rollout.yaml | tools/rollout.sh --check'

# The state the panel is in before anybody sets the field, and the one a Dokploy
# upgrade puts it back into. It is the default that serves the 404s, so it has
# to be the loudest of these.
refuses "an empty command field rejected" "does not run the rollout" \
  sh -c 'printf "" | tools/rollout.sh --check'

# The pattern is the command that was FOUND, not the refusal — a message that
# only said "wrong" would send somebody to look at the repository when the thing
# to look at is the panel.
refuses "Dokploy's own default command rejected" "up -d --build --remove-orphans" \
  sh -c 'printf "compose -p app -f compose.yaml up -d --build --remove-orphans" | tools/rollout.sh --check'

# The steps, all four, in the wrong order. Every link is right on its own; the
# rollout it describes recreates api and web BEFORE the twins are up, which is
# the ten seconds of 404 with extra ceremony. A check that only counted the
# links would pass this.
refuses "the five steps in the wrong order rejected" "does not run the rollout" \
  sh -c 'printf "%s" "compose -p a -f c.yaml up -d --no-deps --wait api web && docker compose -p a -f c.yaml up -d --remove-orphans --wait api2 && docker compose -p a -f c.yaml up -d --no-deps --wait web2 && docker compose -p a -f c.yaml rm -s -f api2 web2" | tools/rollout.sh --check'

# One flag missing, and it is the one that matters: without --wait, step three
# starts recreating api while the twin meant to cover for it is still booting,
# and the gap moves rather than closing.
refuses "a step with --wait dropped rejected" "does not run the rollout" \
  sh -c 'printf "%s" "compose -p a -f c.yaml up -d --remove-orphans --wait api2 && docker compose -p a -f c.yaml up -d --no-deps --wait web2 && docker compose -p a -f c.yaml up -d --no-deps api web && docker compose -p a -f c.yaml rm -s -f api2 web2" | tools/rollout.sh --check'

# The step that removes the twins, gone. The rollout still works and still
# serves no 404 — and leaves two containers of the previous build running behind
# both routers, so /api/health starts answering two different shas and every
# check that reads it becomes a coin toss.
refuses "the chain without its cleanup step rejected" "does not run the rollout" \
  sh -c 'printf "%s" "compose -p a -f c.yaml up -d --remove-orphans --wait api2 && docker compose -p a -f c.yaml up -d --no-deps --wait web2 && docker compose -p a -f c.yaml up -d --no-deps --wait api web" | tools/rollout.sh --check'

refuses "the rollout refuses to print without a project" "needs -p" \
  tools/rollout.sh --print -f compose.yaml
refuses "the rollout refuses to print without a file" "needs at least one -f" \
  tools/rollout.sh --print -p someapp
refuses "the rollout refuses two modes at once" "one of" \
  tools/rollout.sh --steps --run
refuses "the rollout refuses no mode" "usage" tools/rollout.sh

# WHAT THE CHAIN SAYS AND WHAT COMPOSE DEFINES, held against each other.
#
# On 2026-08-23 F2 was merged, released and did not run: the Command field names
# services one by one, prometheus/loki/alloy were not among them, and nothing
# depends on them because ADR 0039 says nothing may. Green deploy, serving site,
# no collector. tools/check-rollout.sh is the gate that came out of that hour.
#
# The steps are hardcoded in rollout.sh, so the broken case has to arrive from
# the compose side — which is also the shape the real incident had: the file
# grew a service and the chain did not.
covered='services:
  db:
    image: x
  api:
    image: x
    depends_on:
      db:
        condition: service_healthy
  web:
    image: x
  prometheus:
    image: x
  loki:
    image: x
  alloy:
    image: x
'
twins='services:
  api2:
    extends:
      file: compose.yaml
      service: api
  web2:
    extends:
      file: compose.yaml
      service: web
'
printf '%s' "$covered" > compose.yaml
printf '%s' "$twins"   > compose.rollout.yaml
accepts "a rollout that starts every service accepted" tools/check-rollout.sh

# db is reached ONLY through api2 -> api -> depends_on, and only because step 1
# is the one without --no-deps. Drop the twins file and db must be reported:
# without that the green above would be luck rather than resolution.
mv compose.rollout.yaml twins.away
refuses "a twin that cannot be resolved reports its dependencies" "db" \
  tools/check-rollout.sh
mv twins.away compose.rollout.yaml

# The incident itself, in miniature.
printf '%s' "$covered" > compose.yaml
printf '  orphan:\n    image: x\n' >> compose.yaml
refuses "a service no step starts rejected" "never starts" tools/check-rollout.sh

rm -f compose.yaml compose.rollout.yaml
unset covered twins

printf 'the release version\n'

# A throwaway repository per case. The rules only mean something against a real
# `git log`, and RELEASE_DIR is the seam for pointing the script at one — the
# same shape CHECK_VERSION_DIR has in tools/version.sh.
relrepo() { # relrepo <commit subject>…
  rm -rf "$tmp/rel"
  mkdir -p "$tmp/rel"
  (
    cd "$tmp/rel"
    git init -q -b main .
    git config user.email selftest@localhost
    git config user.name selftest
    git config commit.gpgsign false
    : > f
    git add f
    for msg in "$@"; do
      printf '%s\n' "$msg" >> f
      git add f
      git commit -q -m "$msg"
    done
  )
}
reltag() { (cd "$tmp/rel" && git tag -a "$1" -m "$1" HEAD~"${2:-0}"); }
rel() { RELEASE_DIR="$tmp/rel" tools/release.sh "$@"; }

# Nothing in a branch of chores asks for a release, and saying so is a decision
# rather than a failure.
relrepo "docs: explain the thing" "chore: bump a pin"
emits "chores and docs produce no release" "" rel --next

relrepo "feat: the first feature"
emits "the first release of an untagged repository is v0.1.0" "v0.1.0" rel --next

relrepo "feat: base" "fix: a bug"
reltag v0.1.0 1
emits "a fix after a release is a patch" "v0.1.1" rel --next

relrepo "feat: base" "feat: another"
reltag v0.1.0 1
emits "a feature after a release is a minor" "v0.2.0" rel --next

# THE RULE THAT SURPRISES PEOPLE. While the major is 0, semver promises no
# stability, so a breaking change is a minor bump and NOT v1.0.0 — going to 1.0
# is the launch's statement, not a commit's.
relrepo "feat: base" "feat!: break it"
reltag v0.1.0 1
emits "a breaking change at 0.x is a minor, not v1.0.0" "v0.2.0" rel --next

relrepo "feat: base" "refactor: rework

BREAKING CHANGE: the shape moved"
reltag v0.1.0 1
emits "a BREAKING CHANGE footer counts like the bang" "v0.2.0" rel --next

# …and the same input once the promise has been made.
relrepo "feat: base" "feat!: break it"
reltag v1.0.0 1
emits "a breaking change after 1.0 is a major" "v2.0.0" rel --next

# THE ORDERING BUG, and it is here because the first version had it: a single
# running verdict let an early `fix:` lock the answer to patch, and the `feat:`
# after it changed nothing. A release that understates what is in it is worse
# than no release.
relrepo "feat: base" "fix: first" "feat: second"
reltag v0.1.0 2
emits "a fix before a feature still yields a minor" "v0.2.0" rel --next

# The backup tag from the 2026-08-17 rewrite. Reading it as a version is exactly
# what put `backup/pre-rewrite-2026-08-17-22-g3890180` on /api/health in
# production for as long as that image ran — issue #112.
relrepo "feat: base" "fix: a bug"
reltag backup/pre-rewrite-2026-08-17 1
emits "a backup tag is not a release tag" "v0.1.0" rel --next

# Not every commit in this repository's history is conventional, and one that is
# not must be ignored rather than guessed at or crashed on.
relrepo "just some words" "another line"
emits "commits without a conventional prefix produce no release" "" rel --next

# THE CASE THAT COST A PIPELINE RUN. An annotated tag carries a tagger, and
# `git tag -a` refuses to invent one — a runner with no git identity stops with
# `fatal: empty ident name`. The first real run of the publish job ended exactly
# there, before it had built anything.
#
# GIT_CONFIG_GLOBAL and GIT_CONFIG_SYSTEM point at /dev/null so the machine
# running this suite cannot lend its own identity to the case and hide the very
# thing being tested.
relrepo "feat: something"
(cd "$tmp/rel" && git config --unset user.name && git config --unset user.email)
accepts "a tag is made without any configured git identity" \
  env RELEASE_DIR="$tmp/rel" GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null \
    tools/release.sh --tag
accepts "and it is tagged by the author of the commit it names" \
  sh -c "cd $tmp/rel && git for-each-ref refs/tags/v0.1.0 --format='%(taggername)' | grep -q selftest"

relrepo "feat: something"
accepts "notes name the first release" \
  sh -c "RELEASE_DIR=$tmp/rel tools/release.sh --notes | grep -q 'The first release'"
accepts "notes list a feature under Features" \
  sh -c "RELEASE_DIR=$tmp/rel tools/release.sh --notes | grep -q '^- something'"

# THE EMPTY BULLET, and v0.1.1 shipped with one. git writes a newline after the
# last record separator, so awk sees one more record than there are commits — it
# has a field, it is just empty, which is why an `NF == 0` guard walks straight
# past it. The result reached a published release as `- ` under Everything else.
accepts "no release note carries an empty bullet" \
  sh -c "! RELEASE_DIR=$tmp/rel tools/release.sh --notes | grep -qE '^- *$'"

refuses "release.sh refuses two modes" "usage" tools/release.sh --next --notes
refuses "release.sh refuses no mode" "usage" tools/release.sh
# OUTSIDE $tmp, because $tmp is itself a repository and `git rev-parse` walks
# upwards — a directory nested in one is in one, which is git behaving normally
# and the first version of this case not accounting for it.
notrepo=$(mktemp -d)
refuses "release.sh refuses a directory that is no repository" "not a git repository" \
  env RELEASE_DIR="$notrepo" tools/release.sh --next
rmdir "$notrepo"

rm -rf "$tmp/rel"

printf 'probe cadence\n'
# The one rule in this file that guards a number nobody can see is wrong.
#
# down_sec is failed checks times ops.ProbeInterval, and the failed checks are
# however often the workflow ran. Halve one of the two and every outage on the
# site is half as long as it was — with the right number of cells, in the right
# colour, and no error anywhere. docs/runbooks/ops.md has asked for this check
# since C7; these are its broken cases.
mkdir -p .github/workflows api/internal/ops

write_cadence() {
  printf 'on:\n  schedule:\n    - cron: "%s"\n' "$1" > .github/workflows/probe.yml
  printf 'package ops\n\nconst (\n\tProbeInterval = %s\n)\n' "$2" > api/internal/ops/ops.go
}

cadence_check() { write_cadence "$1" "$2" && tools/check-probe-cadence.sh "$tmp"; }

accepts "matching cadence accepted"          cadence_check '3-58/5 * * * *' '5 * time.Minute'
accepts "the plain star form accepted"       cadence_check '*/5 * * * *'    '5 * time.Minute'
accepts "seconds and minutes compared"       cadence_check '*/1 * * * *'    '60 * time.Second'
rejects "a cron twice the constant rejected" cadence_check '*/10 * * * *'   '5 * time.Minute'
rejects "a constant twice the cron rejected" cadence_check '*/5 * * * *'    '10 * time.Minute'
# A probe that only runs on Mondays keeps the right step and leaves six sevenths
# of the grid empty, so the step alone is not the whole rule.
rejects "a cron that skips days rejected"    cadence_check '*/5 * * * 1'    '5 * time.Minute'
rejects "a cron without a step rejected"     cadence_check '17 * * * *'     '5 * time.Minute'
rejects "an unreadable constant rejected"    cadence_check '*/5 * * * *'    'probeEvery'
rm -rf .github api/internal/ops

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
