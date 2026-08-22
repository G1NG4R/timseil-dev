#!/bin/sh
# The seventh step: does the thing that was deployed actually answer?
#
#   verify-deploy.sh <sha7> [base-url]     default base: https://timseil.dev
#
# **Sixty seconds, and the number lives here.** System handbook chapter 26:
# "Liefert /api/health nach sechzig Sekunden kein 200, rollt der Deploy zurück
# und der Job schlägt fehl." The contract says the same thing from the other
# side, in the description of GET /api/health: "The deploy gate polls this
# endpoint: no 200 within sixty seconds of a release and the pipeline rolls
# back." A budget spelled a second time in YAML would be a budget that drifts,
# the same argument `make image-tag` makes about the tag.
#
# **From outside, over the public name.** Not through the SSH tunnel, not
# against a container IP, not with a Host header nobody else sends. What is
# being asserted is that a visitor can use the site, and the only honest way to
# check that is to be one. This is also why the deploy job cannot simply trust
# the answer Dokploy's API gives it: Dokploy reports that it started a compose
# project, which is a different claim.
#
# FIVE CONDITIONS, and each one exists because a deploy has failed that way
# somewhere:
#
#   1. /api/health answers 200            — the api is up at all
#   2. .status is "ok"                    — it is up and not degraded
#   3. .sha equals the sha we deployed    — it is the BUILD we ordered
#   4. .startedAt is not the one from before — it is a NEW process
#   5. / answers 200                      — the web container came up too
#
# The third is the one a plain uptime check does not make. `docker compose up`
# with an unchanged .env is a successful no-op: every container healthy, the
# pipeline green, and the previous build still serving. That failure looks
# exactly like a good deploy from the outside unless somebody compares the sha.
#
# THE FOURTH IS NEW IN E4b, AND IT WAS FOUND THE HARD WAY. Dokploy answers the
# deploy call the moment it has ACCEPTED the job; the containers swap seconds
# later. So this script's first sample is normally still the OLD process. When
# the sha being verified differs from the one already running that is harmless
# — the old process fails condition three and the loop waits. But when the two
# are the same, the old process satisfies every condition instantly and this
# script says yes to a deploy that has not happened yet.
#
# That is not only the drill's problem. **A redeploy of the same tag is exactly
# this case**, and it is not hypothetical: a workflow re-run republishes
# `sha-<S>` onto new bytes and deploys it again, the old container answers `S`
# on the first sample, and the pipeline reports success even if the new
# containers never come up. Green over a deploy that did not happen — the same
# family of lie as the skipped job that concluded `success`, one layer down.
#
# The repair compares ONE FIELD FROM ONE SOURCE WITH ITSELF: `.startedAt` read
# before the deploy against `.startedAt` read now. No second clock, so no skew
# to reason about — which a `date` on the runner would have brought with it.
# The caller supplies the earlier value in VERIFY_PREVIOUS_START;
# `verify-deploy.sh --started` is how it gets one, so the base URL and the shape
# of the health document stay defined in this file and nowhere else.
#
# Without that value the condition cannot be made, and the script SAYS so rather
# than quietly dropping to four.
#
# The fifth is there because two images are deployed and only one of them has
# a health endpoint. A broken web image behind a healthy api would pass four
# checks and serve a 502 to every visitor.
#
# A CONNECTION ERROR IS NOT A FAILURE, it is the expected middle of a deploy.
# Containers restart, Traefik re-resolves, and for a few seconds there is
# nothing listening. Only the clock ends this loop.
set -eu

# --started prints the instant the running process came up, and nothing else, so
# that a caller can hold it across a deploy. Empty and exit 0 when the site does
# not answer: there is then no previous process to be confused with a new one,
# and that is a fact rather than a failure.
if [ "${1:-}" = "--started" ]; then
  base=${2:-${VERIFY_BASE_URL:-https://timseil.dev}}
  curl -sS --max-time 10 "$base/api/health" 2>/dev/null | jq -r '.startedAt // empty' 2>/dev/null || true
  exit 0
fi

sha=${1:?usage: verify-deploy.sh <sha7> [base-url]}
base=${2:-${VERIFY_BASE_URL:-https://timseil.dev}}
previous_start=${VERIFY_PREVIOUS_START:-}

# The budget, and the gap between attempts. 3 s gives twenty samples inside the
# window, which is enough resolution to see in the log roughly when the new
# build arrived without turning the log into the interesting part.
BUDGET_SEC=60
INTERVAL_SEC=3

for tool in curl jq; do
  command -v "$tool" >/dev/null 2>&1 || {
    printf '  ✗ %s is not available\n' "$tool"
    exit 1
  }
done

# Restated from the API's own rule (api/internal/intake/validate.go, checkSHA)
# and from deploys_sha_shape_ck: lowercase hex, seven to forty. Rejected here
# rather than lower-cased, for the same reason the endpoint rejects it — a
# caller that sends `ABCDEF1` has a bug worth one clear message.
case $sha in
  *[!0-9a-f]* | '') printf '  ✗ %s is not lowercase hexadecimal\n' "$sha"; exit 1 ;;
esac
[ "${#sha}" -ge 7 ] || { printf '  ✗ %s is shorter than seven characters\n' "$sha"; exit 1; }

printf 'verify %s\n' "$base"
printf '  waiting up to %ss for sha %s\n' "$BUDGET_SEC" "$sha"
if [ -n "$previous_start" ]; then
  printf '  and for a process that did not start at %s\n' "$previous_start"
else
  printf '  ! no previous startedAt was given — a redeploy of the tag that is already\n'
  printf '    running would pass here on its first sample, before anything restarted\n'
fi

deadline=$(( $(date +%s) + BUDGET_SEC ))
last='no answer yet'

while :; do
  # --max-time bounded well under the interval: a hung connection must not eat
  # the budget silently. -f is deliberately absent, because the status code is
  # read below and a 502 should be reported as a 502, not as exit code 22.
  body=$(curl -sS --max-time 5 -o - -w '\n%{http_code}' "$base/api/health" 2>/dev/null) || body=''

  code=$(printf '%s' "$body" | tail -1)
  json=$(printf '%s' "$body" | sed '$d')

  if [ "$code" = "200" ]; then
    status=$(printf '%s' "$json" | jq -r '.status // "?"' 2>/dev/null || printf '?')
    running=$(printf '%s' "$json" | jq -r '.sha // "?"' 2>/dev/null || printf '?')

    began=$(printf '%s' "$json" | jq -r '.startedAt // "?"' 2>/dev/null || printf '?')

    if [ -n "$previous_start" ] && [ "$began" = "$previous_start" ]; then
      # Right build, right status, and still the process that was answering
      # before the deploy. Dokploy has accepted the job and not yet acted on it.
      last="still the process that started at $began"
    elif [ "$status" = "ok" ] && [ "$running" = "$sha" ]; then
      # Only now the web container, and only once. Asking for it on every
      # sample would triple the requests to learn nothing: the api is the slow
      # one to come up, because it waits for migrate and seed.
      web=$(curl -sS --max-time 5 -o /dev/null -w '%{http_code}' "$base/" 2>/dev/null) || web='000'
      if [ "$web" = "200" ]; then
        printf '  ✓ /api/health 200 · status ok · sha %s\n' "$running"
        [ -z "$previous_start" ] || printf '  ✓ a new process, up since %s\n' "$began"
        printf '  ✓ / 200\n'
        exit 0
      fi
      last="api ok on $sha, but / answered $web"
    else
      last="status $status, running sha $running"
    fi
  else
    last="/api/health answered ${code:-nothing}"
  fi

  [ "$(date +%s)" -lt "$deadline" ] || break
  sleep "$INTERVAL_SEC"
done

printf '  ✗ %ss elapsed and the deploy did not come up\n' "$BUDGET_SEC"
printf '    last seen: %s\n' "$last"
printf '    expected:  status ok, sha %s, / 200' "$sha"
[ -z "$previous_start" ] && printf '\n' || printf ', not started at %s\n' "$previous_start"
exit 1
