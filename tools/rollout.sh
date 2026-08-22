#!/bin/sh
# The overlapping start: how a deploy swaps both containers without ever leaving
# Traefik holding a rule with no backend.
#
#   rollout.sh --steps                       the four steps, one per line, bare
#   rollout.sh --print -p <app> -f <path>…   the same, as Dokploy's Command field
#   rollout.sh --run   [-f <path>]…          run it here, against a local stack
#   rollout.sh --check                       read a panel's Command field on
#                                            stdin and say whether it is this
#
# WHY THERE IS A FILE INSTEAD OF FOUR LINES IN A RUNBOOK
#
# The same four steps have to exist in three places that cannot be allowed to
# disagree: the Command field of a Compose app in Dokploy's panel, the lab that
# measures whether they work, and the check in tools/deploy.sh that refuses to
# deploy against a panel saying something else. Written three times they would
# drift, and the drift would not be loud — it would be ten seconds of 404 on the
# public site, which is exactly the defect this phase exists to remove.
#
# So the steps live here once, in $steps below, and the three readers ask this
# file. docs/adr/0035 carries the decision; issue #143 carries the measurement
# that made it necessary.
#
# THE SHAPE IS FORCED, AND BY SOMEBODY ELSE'S CODE
#
# Dokploy owns the deploy (ADR 0033 §2) and the pipeline's key forwards one port
# and runs no command, so whatever swaps the containers has to fit in Dokploy's
# Command field. That field replaces the default `up -d` wholesale and accepts an
# `&&` chain — but `sanitizeCommand` (Dokploy v0.30.0,
# packages/server/src/utils/builders/compose.ts) rejects shell metacharacters and
# requires every link AFTER THE FIRST to begin literally with `docker compose `.
# Read out of the source, not inferred from behaviour.
#
# That is why the sequence E5a measured cannot be used as it stands. Its middle
# step is `docker stop <container>` — not a `docker compose` call, and it names a
# container whose index moves on every rollout (api-1 → api-2 → api-3). A SERVICE
# has a stable name; that is what compose.rollout.yaml is for, and it is what
# makes step four expressible at all.
#
# WHAT EACH STEP IS FOR
#
#   1. The api twin, and — through its own depends_on — db, migrate and seed. The
#      schema is applied by the NEW image while the OLD api is still serving,
#      which is why migrations are expand/contract and have been since ADR 0033.
#   2. The web twin. Both builds now answer, which is a window of mixed versions:
#      every overlapping start has one, and ADR 0035 names it rather than leaving
#      it to be discovered.
#   3. api and web are recreated. This is the swap that used to serve 404 — this
#      time the twins are holding both routers up while it happens.
#   4. The twins go away, by SERVICE name. Steady state is one container per
#      service again, so /api/health keeps a single identity outside the deploy
#      window and verify-deploy.sh, check-deployed.sh and witness.sh go on
#      reading one value rather than two.
#
# WHY migrate AND seed ARE NOT NAMED, and it cost a lab run to find out.
#
# The obvious first step is `up -d --wait db migrate seed`. It fails:
#
#     container timseil-seed-1 exited (0)
#     ✗ step 1 failed
#
# `--wait` waits for every service NAMED ON THE COMMAND LINE to be running or
# healthy, and a one-shot container that has done its job and left is neither.
# Reached as a dependency instead — api2 inherits `service_completed_successfully`
# on both of them — the same `--wait` handles them correctly and exits 0.
# Measured in the lab on 22.08.2026, both ways round.
#
# That is also why step 1 is the only one without --no-deps. Steps 2 and 3 must
# have it: web2 inherits `depends_on: api` from web, and without --no-deps step 2
# would recreate the very container that is supposed to be serving through it.
#
# --remove-orphans SITS ON STEP 1, once, where Dokploy's default command had it.
# Dropping it would leave a service deleted from compose.yaml running forever. It
# is also what makes the failure mode graceful: a deploy that somehow runs
# without -f compose.rollout.yaml does not know the twins, so it takes them away
# instead of leaving two half-owned containers behind.
#
# --wait ON EVERY STEP THAT STARTS SOMETHING. It is the difference between "the
# container exists" and "the container answers": without it step 3 would begin
# recreating api while the twin that is supposed to be covering for it is still
# booting, and the gap this whole file exists to close would simply move.
set -eu

# THE FOUR STEPS. Everything else in this file is transport.
#
# No `-p` and no `-f` in here: which project and which files are the caller's
# business, and — the part that matters — the appName of the production host is
# not this repository's to publish. tools/deploy.sh compares the panel's field to
# these lines after stripping both, so what is versioned is the SHAPE of the
# rollout and never its mapping to a machine.
#
# `rm -s -f` and deliberately NOT `-v`. api and web declare no volumes at all, so
# a `-v` would be a no-op today and a loaded gun pointed at whatever the file
# gains next — this command runs on every single deploy.
steps() {
  cat <<'STEPS'
up -d --remove-orphans --wait api2
up -d --no-deps --wait web2
up -d --no-deps --wait api web
rm -s -f api2 web2
STEPS
}

# What --check compares, and it is not a string compare.
#
# The project name and the file paths of the production app are host state and
# do not belong in a public repository (CLAUDE.md), so `-p X` and `-f Y` are
# stripped from both sides first. What is versioned is the SHAPE of the rollout
# — four steps, in this order, with these flags — never its mapping to a machine.
#
# ONLY THE FLAGS BEFORE THE SUBCOMMAND. `rm -s -f api2 web2` carries an -f of its
# own, and stripping that one ate `api2` and made a wrong panel setting compare
# equal to a right one. Caught by feeding --print back in and expecting --steps
# out, which is now a case in tools/selftest.sh rather than something somebody
# happened to try.
normalize() {
  awk '{ gsub(/&&/, "\n"); print }' | awk '
    {
      sub(/^[[:space:]]+/, ""); sub(/[[:space:]]+$/, "")
      sub(/^docker[[:space:]]+/, "")
      sub(/^compose[[:space:]]+/, "")
      n = split($0, a, /[[:space:]]+/)
      out = ""
      prefix = 1
      for (i = 1; i <= n; i++) {
        if (prefix && (a[i] == "-p" || a[i] == "-f")) { i++; continue }
        prefix = 0
        out = (out == "" ? a[i] : out " " a[i])
      }
      if (out != "") print out
    }'
}

usage() {
  printf 'usage: rollout.sh --steps\n' >&2
  printf '       rollout.sh --print -p <app> -f <path> [-f <path>]…\n' >&2
  printf '       rollout.sh --run [-f <path>]…\n' >&2
  printf '       rollout.sh --check  < the-panels-command-field\n' >&2
  exit 1
}

mode=''
project=''
files=''

while [ $# -gt 0 ]; do
  case $1 in
    --steps | --print | --run | --check)
      [ -z "$mode" ] || { printf '  ✗ say one of --steps, --print, --run\n' >&2; usage; }
      mode=${1#--}
      shift
      ;;
    -p)
      [ $# -ge 2 ] || usage
      project=$2
      shift 2
      ;;
    -f)
      [ $# -ge 2 ] || usage
      files="$files -f $2"
      shift 2
      ;;
    *)
      printf '  ✗ unknown argument %s\n' "$1" >&2
      usage
      ;;
  esac
done

[ -n "$mode" ] || usage

case $mode in
  steps)
    steps
    ;;

  print)
    # The literal contents of Dokploy's Command field. The first link carries no
    # `docker` because Dokploy puts it there itself; every link after it must,
    # and must say `docker compose` specifically — see the header.
    [ -n "$project" ] || { printf '  ✗ --print needs -p <app>\n' >&2; exit 1; }
    [ -n "$files" ] || { printf '  ✗ --print needs at least one -f <path>\n' >&2; exit 1; }
    first=1
    steps | while IFS= read -r step; do
      if [ "$first" = 1 ]; then
        printf 'compose -p %s%s %s' "$project" "$files" "$step"
        first=0
      else
        printf ' && docker compose -p %s%s %s' "$project" "$files" "$step"
      fi
    done
    printf '\n'
    ;;

  check)
    # Its own mode, in the same file as the steps, so that the thing being
    # asserted and the assertion cannot drift apart. tools/deploy.sh calls it
    # before every deploy; tools/selftest.sh calls it with broken input, which
    # is the only way to know the assertion is one.
    work=$(mktemp -d)
    trap 'rm -rf "$work"' EXIT INT TERM
    normalize > "$work/actual"
    steps | normalize > "$work/want"

    if cmp -s "$work/actual" "$work/want"; then
      printf '  ✓ the panel runs the four-step rollout\n' >&2
      exit 0
    fi

    printf '  ✗ the panel does not run the rollout this repository defines\n' >&2
    printf '    every container swap without it serves 404 for as long as it takes (#143)\n' >&2
    printf '    wanted, with -p and -f stripped:\n' >&2
    sed 's/^/      /' "$work/want" >&2
    printf '    found:\n' >&2
    if [ -s "$work/actual" ]; then
      sed 's/^/      /' "$work/actual" >&2
    else
      printf '      <empty — Dokploy is running its own default up -d>\n' >&2
    fi
    printf '    set it with:  tools/rollout.sh --print -p <app> -f <path> -f <path>\n' >&2
    printf '    docs/runbooks/dokploy.md 2.3\n' >&2
    exit 1
    ;;

  run)
    # Against whatever stack is here — the lab, normally. A number measured this
    # way is a number about compose and Traefik's docker provider; it is not a
    # number about production, and the head of compose.lab.yaml says why.
    [ -n "$files" ] || files=' -f compose.yaml -f compose.rollout.yaml'
    n=0
    steps | while IFS= read -r step; do
      n=$(( n + 1 ))
      printf '\n  → %s\n' "$step" >&2
      # Unquoted on purpose: $files and $step are word lists built above, not
      # user input, and there is no path here that a caller can put a space into.
      # shellcheck disable=SC2086
      docker compose $files $step >&2 || {
        printf '  ✗ step %s failed — the stack is mid-rollout, `docker compose ps` says where\n' "$n" >&2
        exit 1
      }
    done
    printf '\n  ✓ rollout complete\n' >&2
    ;;
esac
