#!/bin/sh
# Known vulnerabilities in what this repository actually ships.
#
#   check-vuln.sh [repo-root]     default: .
#
# Two halves, both blocking:
#
#   govulncheck over api/  — and it is not a dependency scanner. It walks the
#     call graph and reports a CVE only when some path in THIS program reaches
#     the affected symbol. A vulnerable function nobody calls is not a finding,
#     which is the difference between a gate people act on and a list people
#     stop reading.
#
#   npm audit over web/ with --omit=dev. What is not in the bundle cannot be
#     exploited through the site; a devDependency advisory is a thing to fix on
#     a Tuesday, not a thing that blocks a merge. --audit-level=high is the
#     line the build plan draws (chapter 5.2).
#
# **This target is deliberately NOT in `make check`.** It can turn red on a
# tree nobody touched, because the input is somebody else's disclosure
# schedule. A gate in the check chain that breaks without a code change is a
# gate people learn to work around, and then it protects nothing. It belongs in
# the pipeline plus a weekly run — ADR 0031 states the rule.
#
# THREE OUTCOMES, NOT TWO, AND THAT COST A MORNING TO LEARN.
#
#   ✓  the scanner ran and found nothing at or above the line
#   ✗  the scanner ran and found something                        → exit 1
#   !  the scanner could not reach what it needs, so it has no
#      verdict at all                                             → exit 2
#
# On 2026-09-04 registry.npmjs.org stopped answering the bulk advisories
# endpoint for about an hour. `npm audit` exits non-zero for that as readily as
# it does for a finding, and this script had two branches for three cases, so it
# printed the loudest sentence it owns:
#
#   ✗ npm audit reports a high or critical advisory in a shipped dependency
#     npm error audit endpoint returned an error
#
# There was no advisory. The same command, given enough time later, answered
# `found 0 vulnerabilities` across all 472 dependencies. The evidence for the
# true reading was sitting in the script's own output, one line below the claim.
#
# This is not a new policy. ADR 0054 already decided it for tools/verify-deploy.sh
# — "der Verify hat drei Ausgänge, nicht zwei", and a 403 is not the
# application's answer, so nothing is judged and nothing is written. ADR 0031 §3
# and §5 say it twice more in other words: "ein Report, der früh aufhört, sieht
# aus wie ein Report, der nichts mehr gefunden hat", and a scanner that stopped
# scanning reports "no leaks found" in the same words as one that worked.
# tools/witness.sh counts three classes for the same reason and says the third
# "is easy to leave out". It was left out here.
#
# HOW THE THIRD CASE IS RECOGNISED, AND WHY IT IS NOT A STRING MATCH ON AN ERROR.
# npm's exit code cannot separate them, so the question asked instead is whether
# a REPORT came back. Measured on 2026-09-04, against the real outage and again
# against a deliberately dead registry (`--registry=http://127.0.0.1:9/`):
#
#   reached the registry   {"auditReportVersion": 2, …, "metadata": {…}}
#   did not reach it       {"message": "network timeout at: …", "error": {…}}
#
# `auditReportVersion` is npm's own name for "this is an audit report", which is
# a structure rather than prose. Matching its error text instead would be
# depending on someone else's wording — the mistake components/dev/StateFlip.tsx
# names when it refuses to depend on a CSS animation's name. If npm ever changes
# the report's shape, the selftest case that feeds a real report fails loudly.
#
# The go half has the same shape and has simply never fired: `go run pkg@version`
# needs the module proxy, and govulncheck needs vuln.go.dev. `-version` prints
# the scanner AND the database's timestamp, so one cheap call proves both are
# reachable before the scan is asked for a verdict.
#
# A RETRY BEFORE THE VERDICT, because ADR 0056 settled that too: one refused
# sample is not a judgement. Only the no-report case is retried; a finding is
# never asked twice.
#
# govulncheck is fetched by version rather than installed: `go run pkg@version`
# resolves and caches without touching api/go.mod, so the vulnerability scanner
# never becomes a line in the dependency graph it is scanning. The version is
# pinned here for the same reason every action is pinned by SHA.
#
# CHECK_VULN_NPM and CHECK_VULN_GO point at the binaries to run. They exist so
# tools/selftest.sh can hand this script something known instead of depending on
# the machine and on somebody else's registry — the same seam check-lint.sh
# opens with CHECK_LINT_BIN. Until they existed, this file had no test at all.
set -eu

root=${1:-.}
govulncheck=golang.org/x/vuln/cmd/govulncheck@v1.7.0
npm_bin=${CHECK_VULN_NPM:-npm}
go_bin=${CHECK_VULN_GO:-go}

# Three tries and a second between them. Enough to ride out a refused connection
# or one timed-out request, and short enough that a real outage is still called
# an outage inside a minute.
attempts=3
delay=1

fail=0
unchecked=0

# A missing toolchain is a skip on a laptop and a failure on a runner. E1 paid
# for that distinction once already: tools/check-node.sh skipped itself where
# no node existed and the job went green having checked nothing.
missing() { # missing <tool> <what it would have checked>
  if [ -n "${CI:-}" ]; then
    printf '  ✗ %s is not available and CI is set — %s went unchecked\n' "$1" "$2"
    fail=1
  else
    printf '  – skip: %s is not available (%s)\n' "$1" "$2"
  fi
}

# The third outcome, and it follows missing() deliberately: not being able to
# ask is the same kind of event as not having the tool. On a runner it is a
# failure, because a required check that goes green having asked nothing is the
# check-node.sh defect with a different cause. On a laptop on a train it is a
# skip.
#
# `!` rather than `✗`, because ✗ on this site means "a claim was made and it is
# false". Nothing was claimed here. The symbol is the one verify-deploy.sh,
# deploy-gate.sh, deploy.sh, release.sh and prune-registry.sh already use for
# an answer that did not come from the thing being asked.
unreachable() { # unreachable <what could not be reached> <what went unchecked>
  if [ -n "${CI:-}" ]; then
    printf '  ! %s could not be reached — %s went unchecked\n' "$1" "$2"
    printf '    → no verdict either way; this is not a finding\n'
    unchecked=1
  else
    printf '  – skip: %s could not be reached (%s went unchecked)\n' "$1" "$2"
  fi
}

# The first two lines of what the tool said, and not all of it. npm answers a
# failed audit with a warning, an error, and then the same fact again as a JSON
# document; two lines carry the reason and the rest is noise that pushes it off
# the screen. The same restraint the govulncheck branch keeps for a green run.
why() { # why <captured output>
  printf '%s\n' "$1" | head -2 | sed 's/^/    /'
}

# ------------------------------------------------------------------- go

if [ ! -d "$root/api" ]; then
  printf '  – skip: %s/api does not exist yet\n' "$root"
elif ! command -v "$go_bin" >/dev/null 2>&1; then
  missing go "the api module"
else
  # The reachability probe. It downloads nothing the scan does not need anyway,
  # and it answers with the database's own timestamp — so a success here means
  # the module proxy AND vuln.go.dev both answered.
  probe=''
  probe_ok=0
  try=1
  while :; do
    if probe=$(cd "$root/api" && "$go_bin" run "$govulncheck" -version 2>&1); then
      probe_ok=1
      break
    fi
    [ "$try" -lt "$attempts" ] || break
    try=$((try + 1))
    sleep "$delay"
  done

  # Asked once and read once. An earlier draft ran the probe a second time in
  # this condition, which is a second sample the retry above does not cover —
  # the loop could ride out a flake and the unretried call fail anyway.
  if [ "$probe_ok" -eq 0 ]; then
    unreachable "the go vulnerability database" "the api module"
    why "$probe"
  # Output held back until it means something: govulncheck narrates its
  # download and then says "No vulnerabilities found", and two lines of nothing
  # on every green run is how a check stops being read.
  elif out=$(cd "$root/api" && "$go_bin" run "$govulncheck" ./... 2>&1); then
    printf '  ✓ govulncheck: nothing reachable\n'
  else
    printf '  ✗ govulncheck reports a vulnerability this program can reach\n'
    printf '%s\n' "$out" | sed 's/^/    /'
    fail=1
  fi
fi

# ------------------------------------------------------------------ web

# One invocation, and the two answers it can give read separately: `status` is
# the verdict and is only meaningful once `report` says a verdict was reached.
audit() { # audit <extra npm args…> — sets out, status, report
  try=1
  while :; do
    out=$(cd "$root/web" && "$npm_bin" audit --audit-level=high --json "$@" 2>&1) \
      && status=0 || status=$?

    case $out in
      *'"auditReportVersion"'*) report=1 ;;
      *) report=0 ;;
    esac

    [ "$report" -eq 0 ] || return 0
    [ "$try" -lt "$attempts" ] || return 0
    try=$((try + 1))
    sleep "$delay"
  done
}

if [ ! -f "$root/web/package-lock.json" ]; then
  printf '  – skip: %s/web has no lockfile yet\n' "$root"
elif ! command -v "$npm_bin" >/dev/null 2>&1; then
  missing npm "the web dependencies"
else
  audit --omit=dev
  shipped_report=$report

  if [ "$report" -eq 0 ]; then
    unreachable "the npm registry" "the shipped dependencies"
    why "$out"
  elif [ "$status" -eq 0 ]; then
    printf '  ✓ npm audit: nothing high or above in what ships\n'
  else
    printf '  ✗ npm audit reports a high or critical advisory in a shipped dependency\n'
    printf '    → cd web && npm audit --omit=dev\n'
    fail=1
  fi

  # Informational only, and separated so that the exit code above is the one
  # that means something. A devDependency advisory is worth seeing and is not
  # worth blocking a merge over.
  #
  # AND IT SAYS NOTHING WHEN IT WAS NOT TOLD ANYTHING. On 2026-09-04 this line
  # claimed a high advisory in a devDependency during the same outage, which was
  # equally invented. Silence is correct here: the half above has already
  # reported that the registry could not be reached, and saying it twice adds
  # no fact.
  if [ "$shipped_report" -eq 1 ]; then
    audit
    if [ "$report" -eq 1 ] && [ "$status" -ne 0 ]; then
      printf '  – note: there is a high advisory in a devDependency (not blocking)\n'
      printf '    → cd web && npm audit\n'
    fi
  fi
fi

# A finding outranks a check that could not run: if both happened, the exit code
# names the one somebody has to act on.
[ "$fail" -eq 0 ] || exit 1
[ "$unchecked" -eq 0 ] || exit 2
