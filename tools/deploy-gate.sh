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
# THE DRILL, AND WHY IT WRITES NOTHING DOWN
#
# DEPLOY_DRILL=1 is how the acceptance criterion of this phase is met against real
# production: the build plan asks for the rollback to be provoked once, for real,
# and a rollback that only a merge can trigger is one you get to test once.
#
# A drill deploys one build while verifying another. That is the whole trick, and
# it is the safest one available: the site keeps serving a real, signed, working
# build for the whole minute, and the only reason verify says no is condition
# three — is the running sha the build we ordered — which is exactly the condition
# a plain uptime check does not make. Nothing is broken on purpose; the site never
# goes down.
#
# IT SKIPS STEP SEVEN. report-deploy.sh writes the sha that was DEPLOYED, and in a
# drill that build came up perfectly well. A row saying "this build ended in a
# rollback" would be a fact nobody produced — invariant 1 is about what a number
# MEANS, not only about whether something measured it. The real measurement
# already exists: 2026-08-22, `report ok … 227s`. The drill does not owe it twice.
# The skip is printed, never silent.
#
# THE FLAG AND THE MISMATCH IMPLY EACH OTHER, in both directions, because each
# half alone is a mistake nobody notices:
#
#   tag != sha, no flag   somebody typed one of the two wrong, and the pipeline
#                         would deploy one build and verify another by accident
#   flag, tag == sha      a DEPLOY_DRILL left over in a shell would silently
#                         swallow the report of a real deploy
#
# It is never set in ci.yml, the same way DEPLOY_SKIP_REGISTRY_CHECK in deploy.sh
# is never set there. docs/runbooks/dokploy.md carries the drill itself.
#
# EXIT CODE. Zero only when the requested build is live. A rollback that worked
# perfectly still exits 1: the deploy failed, and a green tick over a rolled-back
# deploy is the pipeline telling a comfortable lie.
#
# AND THE VERDICT IT READS HAS THREE VALUES. verify-deploy.sh answers 2 when the
# answer did not come from the application at all, and on 2026-08-30 the `if`
# that knew only two of them rolled back a good deploy and then reported the site
# as down. On a 2 there is no rollback — it would ask the same caller the same
# question — and no row in `deploys`: this gate does not know whether the deploy
# is up, so both `ok` and `rollback` would be a claim nobody measured. The
# missing row is the honest trace, which is invariant 1 one instrument along and
# the same argument the drill makes above. ADR 0054.
set -eu

tag=${1:?usage: deploy-gate.sh <sha-tag> <sha7> <started-at-epoch>}
sha=${2:?usage: deploy-gate.sh <sha-tag> <sha7> <started-at-epoch>}
started=${3:?usage: deploy-gate.sh <sha-tag> <sha7> <started-at-epoch>}

here=$(cd "$(dirname "$0")" && pwd)

case $started in
  '' | *[!0-9]*) printf '  ✗ started-at must be epoch seconds — got %s\n' "$started"; exit 1 ;;
esac

# The tag names the build; the sha names what /api/health will answer. Two
# spellings of one commit — unless this is the drill, and then a drill says so.
# Both halves are checked, for the two reasons in the header.
drill=${DEPLOY_DRILL:-}

if [ "$tag" = "sha-$sha" ]; then
  [ -z "$drill" ] || {
    printf '  ✗ DEPLOY_DRILL is set but %s and %s are the same build\n' "$tag" "$sha"
    printf '    this is a deploy, not a drill, and a drill is the only thing that may\n'
    printf '    skip the report. unset DEPLOY_DRILL, or deploy a different tag.\n'
    exit 1
  }
else
  [ -n "$drill" ] || {
    printf '  ✗ deploying %s but verifying against %s\n' "$tag" "$sha"
    printf '    that is a drill, and a drill says so: DEPLOY_DRILL=1.\n'
    printf '    without it this is two typos that would deploy one build and verify another.\n'
    printf '    docs/runbooks/dokploy.md, the drill under Rollback\n'
    exit 1
  }
  printf '  ! DRILL — deploying %s while verifying %s; the verify must fail\n' "$tag" "$sha"
  printf '    nothing will be reported to /api/internal/deploy. header of this file says why.\n'
fi

# Step seven, or the sentence that says it did not happen. One place, so that
# neither path can forget the skip and neither can report a drill.
report() { # report <sha7> <duration-sec> <ok|rollback>
  if [ -n "$drill" ]; then
    printf '  ! drill — nothing reported to /api/internal/deploy\n'
    printf '    %s would have been recorded as %s after %ss\n' "$1" "$3" "$2"
    return 0
  fi
  "$here/report-deploy.sh" "$1" "$2" "$3"
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

# WHEN THE PROCESS THAT IS ANSWERING NOW CAME UP, read BEFORE the deploy and
# handed to the verify afterwards.
#
# Dokploy answers the deploy call once it has accepted the job, not once the
# containers have swapped. Without this value the verify's first sample is the
# OLD process, and if it happens to satisfy every condition — which it does on a
# redeploy of the tag already running — the gate reports a deploy that has not
# happened. Measured on 2026-08-22: three seconds, green, and the containers
# swapped a minute later. The header of verify-deploy.sh carries the argument.
#
# Read again before the rollback, because by then the process is a different one.
before=$("$here/verify-deploy.sh" --started)

# stdout of deploy.sh is the previous tag and nothing else; its narration went
# to stderr and has already been printed above this line.
previous=$("$here/deploy.sh" "$tag")

printf '\n─── verify ───────────────────────────────────────────\n'

# Three values, so not an `if`. The header says what the middle one costs.
verdict=0
VERIFY_PREVIOUS_START="$before" "$here/verify-deploy.sh" "$sha" || verdict=$?

if [ "$verdict" -eq 0 ]; then
  elapsed=$(( $(date +%s) - started ))
  printf '\n─── report ───────────────────────────────────────────\n'
  report "$sha" "$elapsed" ok
  printf '\n  ✓ %s is live\n' "$tag"
  exit 0
fi

if [ "$verdict" -eq 2 ]; then
  printf '\n  ✗ the verify was refused — no rollback, and nothing reported\n'
  printf '    %s may or may not be live; this gate did not find out. production is\n' "$tag"
  printf '    where it was, and which build that is has to be measured from somewhere\n'
  printf '    this caller is not being refused from.\n'
  printf '    docs/runbooks/dokploy.md, Rollback → the verify was refused\n'
  exit 1
fi

# ------------------------------------------------------------------ rollback

printf '\n─── rollback ─────────────────────────────────────────\n'

if [ "$previous" = "$tag" ]; then
  printf '  ✗ nothing to roll back to: %s was already the running tag\n' "$tag"
  printf '    the site is down and this script cannot fix it. runbook: docs/runbooks/dokploy.md\n'
  exit 1
fi

printf '  rolling back to %s\n' "$previous"
before=$("$here/verify-deploy.sh" --started)
"$here/deploy.sh" "$previous" >/dev/null

# The same three values. "The site is down" is the loudest sentence this pipeline
# can say, and it was the second wrong verdict of 2026-08-30: it may only be said
# when the application was reached and was actually not there.
verdict=0
VERIFY_PREVIOUS_START="$before" "$here/verify-deploy.sh" "${previous#sha-}" || verdict=$?

if [ "$verdict" -eq 2 ]; then
  printf '\n  ✗ %s was deployed and the verify was refused — whether it came up is unknown\n' "$previous"
  printf '    nothing is reported: the row would say rollback, and nobody measured that.\n'
  printf '    docs/runbooks/dokploy.md, Rollback → the verify was refused\n'
  exit 1
fi

if [ "$verdict" -ne 0 ]; then
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
report "$sha" "$elapsed" rollback || \
  printf '  ! the report did not land — the rollback still happened\n'

printf '\n  ✗ %s did not come up; %s is live again\n' "$tag" "$previous"
exit 1
