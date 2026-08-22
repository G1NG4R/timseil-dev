#!/bin/sh
# The sixth step: point the running stack at a build and start it.
#
#   deploy.sh <sha-tag>
#
# Prints the PREVIOUS tag on stdout and nothing else. Everything a person reads
# goes to stderr, because the caller needs the rollback target as a value:
#
#   prev=$(tools/deploy.sh sha-abc1234)
#
# WHY THIS TALKS TO DOKPLOY AND NOT TO DOCKER
#
# Dokploy owns this deploy. It holds the environment, it holds the checkout, and
# it writes the .env that compose interpolates `${IMAGE_TAG}` from. A pipeline
# that ran `docker compose up` on the host directly would leave Dokploy's copy
# saying something else, and the next person who pressed Deploy in the panel
# would perform a silent rollback without knowing it. ADR 0030 already refused a
# second path into the same database for the same reason. ADR 0033 carries this
# one.
#
# WHY THROUGH A TUNNEL
#
# DOKPLOY_URL defaults to 127.0.0.1 because the panel is not on the internet and
# must not be: build plan L3 and system handbook chapter 27 both say the port is
# closed and the only way in is `ssh -L 3000:localhost:3000`. The pipeline uses
# the same door a person uses, so L3 has nothing to tear down later. The key
# that opens it can open that one forward and run no command — the runbook has
# the authorized_keys line and the counter-test.
#
# THE PRICE, SAID OUT LOUD
#
# Dokploy replaces the environment as a whole, so changing one line means
# reading all of them — every production secret — into this process. They are
# never printed, never written outside a 0600 file in a private temp directory,
# and that directory is removed on every exit path. This is the one unpleasant
# property of this route; ADR 0033 states it rather than burying it. If a later
# Dokploy version grows a partial update, this script gets shorter and the
# property goes away.
set -eu

# ---------------------------------------------------------------- the API
#
# MEASURED against the running panel on 2026-08-22, Dokploy v0.30.0, and read
# out of Dokploy's own source rather than inferred from behaviour — with one
# line of that sentence weaker than the other two, so it is said here:
#
#   compose.one              exercised live, 200, and the answer carries `env`
#                            with exactly one IMAGE_TAG line
#   compose.saveEnvironment  exercised live, 200, by writing the environment
#                            back UNCHANGED — a no-op that proves the path
#   compose.deploy           from Dokploy's source and its published API
#                            reference only. Not exercised, because exercising
#                            it IS a deploy. The first real deploy is its test.
#
# `compose.saveEnvironment`, NOT `compose.update`. Both reach the same column,
# and the narrower one is the right one: its input schema is exactly
# `{composeId, env}` (packages/server/src/db/schema/compose.ts,
# apiSaveEnvironmentVariablesCompose) and its permission check is
# `envVars: ["write"]`, where `compose.update` asks for `service: ["create"]`.
# A deploy has no business holding a permission that can create services.
#
# The write is partial either way — `updateCompose` does `.set({...rest})` on
# the keys it was given (packages/server/src/services/compose.ts) — so branch,
# domains and networks are not touched. That was worth checking before writing
# to a production panel rather than after.
#
# THE TRAP THAT COST AN AFTERNOON, and it is not visible from the outside:
# `validateRequest` (packages/server/src/lib/auth.ts) verifies the key, then
# reads `organizationId` out of the key's `metadata` and returns no session at
# all when it is missing. A key created through the auth endpoint by hand has
# `metadata: null` and answers `401 {"message":"Unauthorized"}` on every path,
# while being perfectly valid and enabled in the database. **Generate the key
# with Dokploy's own button**, which attaches the organisation.
# docs/runbooks/dokploy.md 3.4 says so where somebody will look for it.
API_READ='/api/compose.one'                # GET  ?composeId=…  → { env: "KEY=VALUE\n…", … }
API_UPDATE='/api/compose.saveEnvironment'  # POST { composeId, env }
API_DEPLOY='/api/compose.deploy'           # POST { composeId }
API_KEY_HEADER='x-api-key'
ENV_FIELD='env'
# --------------------------------------------------------------------------

tag=${1:?usage: deploy.sh <sha-tag>}
here=$(cd "$(dirname "$0")" && pwd)

# The argument is judged before anything else is required. A typo should be a
# message about the typo, not about a missing API key.
#
# The shape `make images` produces, restated. A tag that is not this shape is
# either a mistake or somebody reaching for `latest` — and `latest` is exactly
# what the rollback section of the Dokploy runbook forbids, because rolling back
# needs a name that cannot be repointed.
case $tag in
  sha-*) ;;
  *) printf '  ✗ %s is not a sha- tag; this deploys immutable builds, never latest\n' "$tag" >&2; exit 1 ;;
esac
short=${tag#sha-}
case $short in
  *[!0-9a-f]* | '') printf '  ✗ %s is not lowercase hexadecimal\n' "$tag" >&2; exit 1 ;;
esac
[ "${#short}" -eq 7 ] || {
  printf '  ✗ %s: expected seven hex characters, got %s\n' "$tag" "${#short}" >&2; exit 1; }

for tool in curl jq; do
  command -v "$tool" >/dev/null 2>&1 || {
    printf '  ✗ %s is not available\n' "$tool" >&2
    exit 1
  }
done

base=${DOKPLOY_URL:-http://127.0.0.1:3000}
: "${DOKPLOY_API_KEY:?DOKPLOY_API_KEY is not set}"
: "${DOKPLOY_COMPOSE_ID:?DOKPLOY_COMPOSE_ID is not set}"

# The tag has to exist in the registry BEFORE the running stack is pointed at
# it. Without this, deploying a typo costs the sixty seconds of the verify gate
# plus a rollback, with the site down for both. With it, a typo costs two
# seconds and touches nothing.
#
# Anonymously, with no login: the packages are public, and asking the way a
# stranger asks is also a check that they still are.
#
# DEPLOY_SKIP_REGISTRY_CHECK is the seam a test needs, in the same shape as
# CHECK_VERSION_DIR, CHECK_TIDY_DIR and SBOM_IMAGE elsewhere in this directory:
# an end-to-end run against a stand-in Dokploy deploys tags that were never
# built. It is never set in ci.yml and never on the host. Skipping when docker
# is absent is the same clause, for a laptop that has none.
if command -v docker >/dev/null 2>&1 && [ -z "${DEPLOY_SKIP_REGISTRY_CHECK:-}" ]; then
  for image in ghcr.io/g1ng4r/timseil-api ghcr.io/g1ng4r/timseil-web; do
    docker manifest inspect "$image:$tag" >/dev/null 2>&1 || {
      printf '  ✗ %s:%s is not in the registry\n' "$image" "$tag" >&2
      printf '    nothing was changed. a tag reaches GHCR through the publish job, never from here\n' >&2
      exit 1
    }
  done
  printf '  ✓ both images exist in the registry\n' >&2
fi

# umask before mkdir, so the directory is never briefly world-readable. The
# whole production environment passes through a file in here.
umask 077
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT INT TERM

# --config -, so DOKPLOY_API_KEY is never in argv and never in a process
# listing. Same treatment the deploy token gets in report-deploy.sh.
api() { # api <method> <path> [json-file]
  method=$1; path=$2; payload=${3:-}
  {
    printf 'url = "%s%s"\n' "$base" "$path"
    printf 'request = "%s"\n' "$method"
    printf 'header = "%s: %s"\n' "$API_KEY_HEADER" "$DOKPLOY_API_KEY"
    printf 'header = "Content-Type: application/json"\n'
    [ -n "$payload" ] && printf 'data = "@%s"\n' "$payload"
  } | curl -sS --max-time 60 -o "$work/body" -w '%{http_code}' --config -
}

fail() { printf '  ✗ %s\n' "$1" >&2; exit 1; }

printf 'deploy %s\n' "$tag" >&2

# ------------------------------------------------------------------- read
code=$(api GET "$API_READ?composeId=$DOKPLOY_COMPOSE_ID" || printf '000')
[ "$code" = "200" ] || fail "reading the compose app answered $code — is the tunnel up?"

jq -e --arg f "$ENV_FIELD" 'has($f)' "$work/body" >/dev/null 2>&1 \
  || fail "the answer has no '$ENV_FIELD' field — the API changed, see the block at the top of this file"

# createEnvFile, asserted rather than set.
#
# Dokploy only writes the .env that compose interpolates ${IMAGE_TAG} from when
# this switch is on; with it off the environment is discarded SILENTLY — no
# write, no warning, no log line — and the deploy fails later on
# `required variable IMAGE_TAG is missing a value`, which points at the wrong
# thing entirely (runbook 2.2 quotes the line of Dokploy source).
#
# Asserted and never sent: saveEnvironment would happily take a `createEnvFile`
# field, and a pipeline that quietly flips a panel switch is a pipeline that
# hides a misconfiguration instead of reporting it.
jq -e '.createEnvFile == true' "$work/body" >/dev/null 2>&1 \
  || fail 'createEnvFile is off in Dokploy — the environment would be discarded silently (runbook 2.2)'

jq -r --arg f "$ENV_FIELD" '.[$f] // ""' "$work/body" > "$work/env"

# ---------------------------------------------------- the rollout, asserted
#
# Dokploy's Command field is what actually swaps the containers. Left at its
# default it runs one `up -d` over the whole stack, which recreates api and web
# together and serves ten seconds of 404 to the public site while it happens —
# the defect issue #143 exists for. The chain that does not is tools/rollout.sh,
# and --check is where the panel and the repository are held equal.
#
# ASSERTED, NEVER SET. Exactly the treatment createEnvFile gets above and for
# the same reason: a pipeline that quietly writes a panel setting is a pipeline
# that hides a misconfiguration. A Dokploy upgrade that resets the field should
# stop a deploy and say so, not be repaired behind somebody's back and then do
# it again next time.
#
# BEFORE anything is written. A refusal here has changed nothing.
jq -e 'has("command")' "$work/body" >/dev/null 2>&1 \
  || fail "the answer has no 'command' field — the API changed, see the block at the top of this file"

jq -r '.command // ""' "$work/body" | "$here/rollout.sh" --check || exit 1

# ----------------------------------------------------------------- rewrite
#
# The one destructive step, and it lives in its own file so that it can be
# tested against every broken input without a live Dokploy — no IMAGE_TAG line,
# two of them, an empty value. tools/selftest.sh does exactly that; the header
# of deploy-env.sh says why. Here it either returns the previous tag or it has
# already refused, and nothing has been sent.
previous=$("$here/deploy-env.sh" "$tag" "$work/env" "$work/env.new")

if [ "$previous" = "$tag" ]; then
  printf '  ! IMAGE_TAG is already %s — this is a redeploy, and a rollback would be a no-op\n' "$tag" >&2
else
  printf '  ✓ previous %s\n' "$previous" >&2
fi

# --rawfile, so the environment goes in as data and cannot be read as a jq
# program or break the JSON on a quote.
jq -n --arg id "$DOKPLOY_COMPOSE_ID" --arg f "$ENV_FIELD" --rawfile env "$work/env.new" \
  '{composeId: $id} + {($f): $env}' > "$work/update.json"

code=$(api POST "$API_UPDATE" "$work/update.json" || printf '000')
case $code in
  200 | 201 | 204) printf '  ✓ IMAGE_TAG set to %s\n' "$tag" >&2 ;;
  *) fail "updating the environment answered $code — the running stack is untouched" ;;
esac

# ------------------------------------------------------------------ deploy
jq -n --arg id "$DOKPLOY_COMPOSE_ID" '{composeId: $id}' > "$work/deploy.json"

code=$(api POST "$API_DEPLOY" "$work/deploy.json" || printf '000')
case $code in
  200 | 201 | 202 | 204) ;;
  *) fail "starting the deploy answered $code — IMAGE_TAG is now $tag but nothing was restarted" ;;
esac

# Deliberately not "deployed". Dokploy has accepted the job; whether the site
# works is a different claim, and the only thing that may make it is
# verify-deploy.sh against the public URL.
printf '  ✓ dokploy accepted the deploy — verify decides whether it worked\n' >&2

printf '%s\n' "$previous"
