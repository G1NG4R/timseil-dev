#!/bin/sh
# Does production run what main says — and is it the published bytes?
#
#   check-deployed.sh [--host] [sha7]     default base: https://timseil.dev
#
# WHY THIS EXISTS. On 2026-08-22 a run concluded `success` and deployed nothing.
# DEPLOY_ENABLED was not set, the deploy job was skipped, and ADR 0033 §8 had
# argued that a skipped job is grey rather than green — which is true of the job
# and false of the run, and the run is what a person looks at. The repair is not
# a better switch. It is to stop checking the mechanism and check the result.
#
# So this asks the question from outside, the way a visitor asks it, and it can
# go red on a tree nobody touched. That is the point, and it is also why it is
# not in `make check` (ADR 0031 §1): a gate that reads production would block one
# merge because of the deploy of the previous one.
#
# AGAINST THE DIGEST, NOT THE TAG — and the registry already holds the proof that
# the difference is not theoretical. Commit ae939d4 was built twice, fourteen
# minutes apart; both builds carry `revision=ae939d4`, and `sha-ae939d4` names
# only the second. Had production started before the re-run, `/api/health` would
# have said `ae939d4`, the tag would have resolved, and every sha-shaped check in
# this repository would have been green about bytes nobody published under that
# name. A tag can be moved. A digest cannot.
#
# THE THREE VANTAGE POINTS, and why the last one is not always available:
#
#   the public URL   what a visitor gets                    always
#   the registry     what the name resolves to, anonymously always
#   the host         which bytes the container actually ran  only on the VPS
#
# The CI deploy key opens one port-forward and executes no command, so nothing in
# Actions can run `docker inspect` over there. Rather than quietly dropping the
# third question, this script names it, prints the two digests to compare, and
# says where to ask. Weekly in `scan` it makes seven claims; on the VPS, with
# --host, it makes nine. A skipped claim is never a silent one.
#
# WHAT IT DOES NOT CHECK: the signature. `make verify-supply-chain` makes that
# claim, in the same weekly job, one step above. Saying it twice would be two
# definitions of one identity string and thirty seconds for an answer already in
# the log.
set -eu

# ------------------------------------------------------------------ arguments

host=''
expected=''

while [ $# -gt 0 ]; do
  case $1 in
    --host) host=1 ;;
    -*) printf '  ✗ unknown flag %s\n' "$1"
        printf '    usage: check-deployed.sh [--host] [sha7]\n'; exit 1 ;;
    *)  [ -z "$expected" ] || { printf '  ✗ usage: check-deployed.sh [--host] [sha7]\n'; exit 1; }
        expected=$1 ;;
  esac
  shift
done

# Judged before anything is fetched — and this is also the seam the selftest
# uses: given a sha, this script never asks GitHub what main is.
if [ -n "$expected" ]; then
  case $expected in
    *[!0-9a-f]* | '') printf '  ✗ %s is not lowercase hexadecimal\n' "$expected"; exit 1 ;;
  esac
  [ "${#expected}" -eq 7 ] || {
    printf '  ✗ %s: expected seven hex characters, got %s\n' "$expected" "${#expected}"; exit 1; }
fi

for tool in curl jq date; do
  command -v "$tool" >/dev/null 2>&1 || { printf '  ✗ %s is not available\n' "$tool"; exit 1; }
done

here=$(cd "$(dirname "$0")" && pwd)
base=${VERIFY_BASE_URL:-https://timseil.dev}

# The claim is about the PUBLIC site. Over plaintext anybody on the path can
# answer it, and an answer somebody else wrote is not a measurement. Loopback is
# the exception the selftest needs to reach the no-answer path.
case $base in
  https://*) ;;
  http://127.0.0.1* | http://localhost*) ;;
  *) printf '  ✗ %s is not https\n' "$base"
     printf '    this asks what a visitor gets, and over http that is whoever is on the path\n'
     exit 1 ;;
esac

REPO=${CHECK_DEPLOYED_REPO:-G1NG4R/timseil-dev}
IMAGES='timseil-api timseil-web'

fails=0
claims=0
digest_asked=''
api_digest=''
web_digest=''

ok()   { claims=$(( claims + 1 )); printf '  ✓ %s\n' "$1"; }
bad()  { claims=$(( claims + 1 )); fails=$(( fails + 1 )); printf '  ✗ %s\n' "$1"; }
note() { printf '    %s\n' "$1"; }

# The claim that cannot be made here is announced even when the run fails. A red
# run that quietly dropped it would leave the reader believing the digest was
# compared and found wrong.
announce_skip() {
  [ -z "$host" ] || return 0
  [ -z "$digest_asked" ] || return 0
  digest_asked=1
  printf '  – not asked here: whether the running containers are THOSE bytes\n'
  printf '    only the host can see it. from the clone on the VPS:\n'
  printf '        git -C ~/timseil-dev pull && sh tools/check-deployed.sh --host\n'
  [ -z "$api_digest" ] || printf '    expected  ghcr.io/g1ng4r/timseil-api  %s\n' "$api_digest"
  [ -z "$web_digest" ] || printf '    expected  ghcr.io/g1ng4r/timseil-web  %s\n' "$web_digest"
}
trap announce_skip EXIT

# An ISO instant to epoch seconds. GNU-only, the same assumption the deploy job
# in ci.yml already makes. A parse failure is a sentence, never a silent 0 —
# zero would make every deploy look like it is still in flight.
epoch() {
  date -u -d "$1" +%s 2>/dev/null || {
    printf '  ✗ could not read the timestamp %s\n' "$1" >&2
    return 1
  }
}

printf 'deployed\n'

# ----------------------------------------------------------- what main says
#
# From the remote, never from local git. Three machines give three different
# local answers: a laptop is on a phase branch, the VPS clone is whatever was
# last pulled, and the CI checkout is right only by accident of the trigger. The
# question is what `main` says, and only the remote knows.
#
# One request carries all three values the tolerance below needs. GH_TOKEN when
# there is one, unauthenticated otherwise — the same treatment, and the same
# reason, as check-pins.sh --online: sixty an hour per address, and a shared
# runner's address is not one this check gets to itself.
parent=''
head_at=''

if [ -n "$expected" ]; then
  printf '  head under test is %s (given on the command line)\n' "$expected"
else
  auth=''
  [ -z "${GH_TOKEN:-}" ] || auth="Authorization: Bearer $GH_TOKEN"
  body=$(curl -sS --max-time 20 -H 'Accept: application/vnd.github+json' \
           ${auth:+-H "$auth"} "https://api.github.com/repos/$REPO/commits/main") || body=''

  expected=$(printf '%s' "$body" | jq -r '.sha // empty' | cut -c1-7)
  if [ -z "$expected" ]; then
    case $body in
      *'rate limit'*)
        printf '  ✗ github rate-limited this address before it could say what main is\n'
        note 'set GH_TOKEN. this is not a finding about the deploy.' ;;
      *) printf '  ✗ could not read the head of main from %s\n' "$REPO" ;;
    esac
    exit 1
  fi
  parent=$(printf '%s' "$body" | jq -r '.parents[0].sha // empty' | cut -c1-7)
  head_at=$(printf '%s' "$body" | jq -r '.commit.committer.date // empty')
  printf '  head of main is %s, committed %s\n' "$expected" "$head_at"
fi

# ------------------------------------------------------------- the site
#
# One document, read once. Every instant compared below comes out of it, so
# there is no clock on this side to disagree with the one on that side.
answer=$(curl -sS --max-time 15 -o - -w '\n%{http_code}' "$base/api/health" 2>/dev/null) || answer=''
code=$(printf '%s' "$answer" | tail -1)
health=$(printf '%s' "$answer" | sed '$d')

if [ "$code" != "200" ]; then
  bad "$base/api/health did not answer 200 — got ${code:-nothing}"
  note 'production is not serving. this check says nothing else until it does.'
  exit 1
fi

status=$(printf '%s' "$health" | jq -r '.status // "?"')
running=$(printf '%s' "$health" | jq -r '.sha // "?"')
started=$(printf '%s' "$health" | jq -r '.startedAt // empty')
now=$(printf '%s' "$health" | jq -r '.generatedAt // empty')

if [ "$status" = "ok" ]; then
  ok "/api/health answers 200, status ok"
else
  bad "/api/health answers 200 but status is $status"
fi

web=$(curl -sS --max-time 15 -o /dev/null -w '%{http_code}' "$base/" 2>/dev/null) || web='000'
if [ "$web" = "200" ]; then
  ok "/ answers 200"
else
  bad "/ answers $web — the api is up and the web container is not"
fi

# ------------------------------------------------ production runs the head
#
# THE TOLERANCE, and the number in it is not invented.
#
# A merge that landed a minute ago is legitimately not live yet. So production
# may run the head's FIRST PARENT — one step, never two — while the head is
# younger than the last deploy took. Two steps behind means an earlier merge
# never deployed, and that is the bug this file is hunting.
#
# The budget is `ops.lastDeploy.durationSec`: the pipeline measured it and
# report-deploy.sh wrote it there. Not a constant here, not one in the Makefile,
# not one in YAML. It satisfies invariant 1 twice — the number came out of a
# running system, and it measures exactly the interval it is used for, the whole
# of a run from push to verify. It is deliberately NOT the sixty seconds in
# verify-deploy.sh; that is the tail of the same run, not the run.
#
# No tolerance is computed when there is no number to compute it from, and none
# is guessed. One step is only "the previous state of main" because main is
# linear — squash-merge in CLAUDE.md, required_linear_history in github-setup.sh.
last_result=$(printf '%s' "$health" | jq -r '.ops.lastDeploy.result // empty')
last_secs=$(printf '%s' "$health" | jq -r '.ops.lastDeploy.durationSec // empty')
last_at=$(printf '%s' "$health" | jq -r '.ops.lastDeploy.at // empty')

if [ "$running" = "$expected" ]; then
  ok "it runs $running — the head of main"
else
  inflight=''
  if [ -n "$parent" ] && [ "$running" = "$parent" ] \
     && [ "$last_result" = "ok" ] && [ -n "$last_secs" ] && [ -n "$head_at" ] && [ -n "$now" ]; then
    age=$(( $(epoch "$now") - $(epoch "$head_at") ))
    [ "$age" -le "$last_secs" ] && inflight=$age
  fi
  if [ -n "$inflight" ]; then
    claims=$(( claims + 1 ))
    printf '  – in flight: %s was committed %ss ago and production runs its parent %s\n' \
      "$expected" "$inflight" "$running"
    note "the last deploy took ${last_secs}s (measured, ops.lastDeploy) and this one is inside it"
  else
    bad "production runs $running, main is at $expected"
    note 'nothing deployed the merge. a run can conclude success with its deploy job'
    note 'skipped — that is what happened on 22.08.2026, and nobody would have seen it.'
    note "→ gh run list --repo $REPO --branch main --workflow ci"
  fi
fi

# ------------------------------------------- the site's own record agrees
if [ -z "$last_result" ]; then
  bad '/api/health reports no deploy at all — ops.lastDeploy is null'
  note 'the site is up and no pipeline has ever told it so. either the report never'
  note 'landed, or what is running was not put there by this pipeline.'
elif [ "$last_result" = "rollback" ]; then
  bad "the last deploy ended in a rollback — ${last_secs}s, $last_at"
  note 'an unfinished rollback is not tolerance. production is on an older build on'
  note 'purpose, and main has not been deployed since.'
else
  ok "the site reports that deploy itself: $last_result, ${last_secs}s, $last_at"
fi

# ------------------------------------------------------- the registry
#
# Anonymously, over the public registry API — the way a stranger asks, which is
# also a check that the packages are still public. Two reasons this claim is
# here at all: it produces the digests the host half compares against, and it
# notices when the retention rule has eaten a tag it was supposed to keep.
resolved=1
for image in $IMAGES; do
  if d=$("$here/registry.sh" digest "$image" "sha-$expected" 2>/dev/null); then
    ok "ghcr.io/g1ng4r/$image:sha-$expected → $d"
    case $image in
      timseil-api) api_digest=$d ;;
      timseil-web) web_digest=$d ;;
    esac
  else
    bad "ghcr.io/g1ng4r/$image:sha-$expected is not in the registry"
    note 'a tag reaches GHCR through the publish job, never from a laptop'
    resolved=''
  fi
done

# ------------------------------------------- and the bytes say the same
#
# TWO QUESTIONS THE HOST IS NOT NEEDED FOR, and they are what turn this from a
# sha check into a digest check.
#
#   1. do the bytes behind the name claim this commit? A tag pointed at another
#      build's bytes still resolves, and .sha would still be right.
#   2. were the bytes published AFTER the running process started? Then
#      production CANNOT be running them — the tag was repushed after the deploy.
#
# The second is one-sided on purpose, and the wording says so: older bytes are
# consistent with what is running, never proof of it. The proof is the digest,
# and that lives on the host.
if [ -n "$resolved" ]; then
  same_rev=1
  newest=''
  for image in $IMAGES; do
    cfg=$("$here/registry.sh" config "$image" "sha-$expected" 2>/dev/null) || cfg=''
    rev=$(printf '%s' "$cfg" | jq -r '.config.Labels["org.opencontainers.image.revision"] // empty' | cut -c1-7)
    made=$(printf '%s' "$cfg" | jq -r '.created // empty')
    if [ -z "$rev" ]; then
      bad "the bytes behind $image:sha-$expected carry no revision label"
      same_rev=''
    elif [ "$rev" != "$expected" ]; then
      bad "$image:sha-$expected points at bytes built from $rev"
      note 'a tag can be moved, a digest cannot. this tag names another commit'"'"'s build.'
      same_rev=''
    fi
    [ -z "$made" ] || { [ -n "$newest" ] && [ "$made" \< "$newest" ] || newest=$made; }
  done
  [ -z "$same_rev" ] || ok "both were built from $expected"

  if [ -n "$newest" ] && [ -n "$started" ]; then
    if [ "$(epoch "$newest")" -le "$(epoch "$started")" ]; then
      ok "built $newest, running since $started — consistent, not proof"
    else
      bad 'the published bytes are newer than the running process'
      note "built $newest, running since $started. production cannot be these bytes:"
      note 'the tag was repushed after the deploy. sha equality cannot see this case.'
    fi
  fi
fi

# ---------------------------------------------------------------- the digest
#
# On the host the container is right there, and the question stops being an
# inference. Containers are found by their REPOSITORY, never by a compose project
# name: that name belongs to Dokploy and to the host, not to this repository.
# RepoDigests is matched rather than indexed — index 0 is either the right
# answer, another repository's, or out of range, and only one of those is loud.
# The head of tools/image-digest.sh spends a paragraph on the same trap.
if [ -n "$host" ]; then
  command -v docker >/dev/null 2>&1 || {
    printf '  ✗ --host was asked for and docker is not available here\n'
    printf '    this half runs on the VPS, out of the clone in ~/timseil-dev\n'
    exit 1
  }
  for image in $IMAGES; do
    case $image in
      timseil-api) want=$api_digest ;;
      timseil-web) want=$web_digest ;;
    esac
    repo="ghcr.io/g1ng4r/$image"
    cid=$(docker ps --filter "ancestor=$repo:sha-$expected" --format '{{.ID}}' | head -n 1)
    [ -n "$cid" ] || cid=$(docker ps --format '{{.ID}} {{.Image}}' \
      | awk -v r="$repo:" 'index($2, r) == 1 { print $1; exit }')
    if [ -z "$cid" ]; then
      bad "no running container is using $repo"
      continue
    fi
    img=$(docker inspect --format '{{.Config.Image}}' "$cid")
    got=$(docker image inspect "$img" --format '{{range .RepoDigests}}{{println .}}{{end}}' 2>/dev/null \
      | sed -n "s|^${repo}@||p" | head -n 1)
    if [ -z "$got" ]; then
      bad "the running $image image has no digest in $repo"
      note 'it was built here rather than pulled — which is the thing that must never happen'
    elif [ "$got" = "$want" ]; then
      ok "the running $image container is $got — the published digest"
    else
      bad "the running $image container is $got"
      note "the tag resolves to $want — same name, different bytes"
    fi
  done
fi

announce_skip

printf '\n'
if [ "$fails" -eq 0 ]; then
  if [ -n "$host" ]; then
    printf '  ✓ %s claims\n' "$claims"
  else
    printf '  ✓ %s claims, 1 not asked here\n' "$claims"
  fi
  exit 0
fi
printf '  ✗ %s of %s claims failed\n' "$fails" "$claims"
exit 1
