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
   "$root/tools/check-compose.sh" "$root/tools/check-contract.sh" "$tmp/tools/"
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

accepts "absent compose files skip" tools/check-compose.sh

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
