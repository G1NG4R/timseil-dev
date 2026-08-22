#!/bin/sh
# Steps six and seven together, with the rollback between them.
#
#   deploy-gate.sh <sha-tag> <sha7> <started-at-epoch>
#
# This is the file the phase is about. deploy.sh points the stack at a build,
# verify-deploy.sh decides whether that worked, report-deploy.sh writes the
# number down — and the part that has never existed until now is what happens
# when the middle one says no.
#
# It is a script and not a handful of `if: failure()` steps in ci.yml for one
# reason: the acceptance criterion of this phase is that the rollback was really
# triggered, and a rollback that can only be triggered by merging to main is one
# you get to test once. Here it can be run against production from a laptop,
# which is exactly how the drill in the runbook works.
#
# THE THIRD ARGUMENT IS NOT OPTIONAL, and there is no default.
#
# The duration on the case study is the whole run — push, lint, test, build,
# push image, deploy, verify — which is what its own label says: BUILD + DEPLOY.
# A `date` taken when this script starts would measure the last two steps and
# publish the answer as if it were all seven. Invariant 1 is not only about
# numbers nobody produced; it is also about numbers that measured something
# other than what they claim. So the caller passes the instant the run began,
# and in ci.yml that value is `run_started_at` read back from the Actions API
# rather than a clock this pipeline started itself.
#
# EXIT CODE. Zero only when the requested build is live. A rollback that worked
# perfectly still exits 1: the deploy failed, and a green tick over a rolled-back
# deploy is the pipeline telling a comfortable lie.
set -eu

tag=${1:?usage: deploy-gate.sh <sha-tag> <sha7> <started-at-epoch>}
sha=${2:?usage: deploy-gate.sh <sha-tag> <sha7> <started-at-epoch>}
started=${3:?usage: deploy-gate.sh <sha-tag> <sha7> <started-at-epoch>}

here=$(cd "$(dirname "$0")" && pwd)

case $started in
  '' | *[!0-9]*) printf '  ✗ started-at must be epoch seconds — got %s\n' "$started"; exit 1 ;;
esac

# The tag names the build; the sha names what /api/health will answer. They are
# two spellings of one commit, and letting them disagree would mean deploying
# one build and verifying another — which is a real drill (the runbook uses it)
# but never something a pipeline should do by accident.
[ "$tag" = "sha-$sha" ] || {
  printf '  ! deploying %s but verifying against %s — this is a drill, not a deploy\n' "$tag" "$sha"
}

# ---------------------------------------------------------- the prune window
#
# CLAUDE.md, and it applies to a person at a keyboard exactly as much as to the
# pipeline: Dokploy's docker-cleanup runs at 23:50 UTC with
# `docker system prune --all --force`, and its wrapper waits up to 300 s for a
# quiet Docker before starting anyway. A deploy that overlaps it loses stopped
# containers and unreferenced images — which, during a deploy, is the rollback
# target.
#
# MEASURED, NEVER ESTIMATED. `date -u`, every time. An estimated clock is an
# invented number.
now_hhmm=$(date -u '+%H%M')
if [ "$now_hhmm" -ge 2345 ] && [ "$now_hhmm" -lt 2400 ]; then
  printf '  ✗ it is %s UTC — inside the 23:45–00:00 window\n' "$(date -u '+%H:%M')"
  printf "    dokploy's docker-cleanup starts at 23:50 and prunes unreferenced images,\n"
  printf '    which during a deploy means the image this would roll back to. wait it out.\n'
  exit 1
fi

printf '\n─── deploy ───────────────────────────────────────────\n'

# stdout of deploy.sh is the previous tag and nothing else; its narration went
# to stderr and has already been printed above this line.
previous=$("$here/deploy.sh" "$tag")

printf '\n─── verify ───────────────────────────────────────────\n'

if "$here/verify-deploy.sh" "$sha"; then
  elapsed=$(( $(date +%s) - started ))
  printf '\n─── report ───────────────────────────────────────────\n'
  "$here/report-deploy.sh" "$sha" "$elapsed" ok
  printf '\n  ✓ %s is live\n' "$tag"
  exit 0
fi

# ------------------------------------------------------------------ rollback

printf '\n─── rollback ─────────────────────────────────────────\n'

if [ "$previous" = "$tag" ]; then
  printf '  ✗ nothing to roll back to: %s was already the running tag\n' "$tag"
  printf '    the site is down and this script cannot fix it. runbook: docs/runbooks/dokploy.md\n'
  exit 1
fi

printf '  rolling back to %s\n' "$previous"
"$here/deploy.sh" "$previous" >/dev/null

if ! "$here/verify-deploy.sh" "${previous#sha-}"; then
  printf '\n  ✗ THE ROLLBACK DID NOT COME UP EITHER — the site is down\n'
  printf '    docs/runbooks/dokploy.md part 5, and docs/runbooks/compose.md for the chain\n'
  exit 1
fi

printf '\n─── report ───────────────────────────────────────────\n'

# The sha reported is the one that was DEPLOYED, not the one now running. The
# row says: this build was shipped and it ended in a rollback. Reporting the
# previous sha instead would record a deploy that never happened and quietly
# lose the failure.
elapsed=$(( $(date +%s) - started ))
"$here/report-deploy.sh" "$sha" "$elapsed" rollback || \
  printf '  ! the report did not land — the rollback still happened\n'

printf '\n  ✗ %s did not come up; %s is live again\n' "$tag" "$previous"
exit 1
