#!/bin/sh
# The recording-rule names the Go code asks for have to exist in Prometheus.
#
#   check-rule-names.sh [repo-root]     default: .
#
# internal/snapshots queries two rules BY NAME and writes the answers into
# metric_snapshots, which is where Metrics.p95Ms and Metrics.errorRate come
# from. Rename one in ops/prometheus/rules/slis.yml without renaming it here and
# the query is valid, the answer is an empty vector, no row is written, and the
# page goes back to `— NO DATA` on both numbers. Nothing fails. Nothing is
# logged above INFO. From outside it looks like a site that never measured
# itself.
#
# THIS CHECK WAS ORDERED BEFORE IT WAS WRITTEN, the way check-probe-cadence.sh
# was. ADR 0040 §4 declares the names "ein Vertrag mit F5" and puts a price on
# breaking it ("ein Umbenennen der drei Regeln kostet ab jetzt zwei Phasen");
# slis.yml repeats it in its header. That is the nameable trigger CLAUDE.md
# asks for: the failure has not happened, the way it would happen is written
# down in two places, and it is invisible from the outside.
#
# ONE DIRECTION ONLY. Every name Go asks for must exist; not every rule must be
# read. timseil:service:availability_5m is deliberately read by nobody until
# F10's burn-rate alerts, and the three per-service rules feed F9's dashboards.
# A check that demanded both directions would fail today for a reason that is
# correct.
#
# It reads both files as text. The Go constant is not reachable from a shell
# without a compiler, and a check that needed a toolchain to compare two strings
# would not belong in `make check`.
set -eu

root=${1:-.}
rules=$root/ops/prometheus/rules/slis.yml
asks=$root/api/internal/snapshots/promql.go

for f in "$rules" "$asks"; do
  [ -f "$f" ] || { printf '  ✗ %s is missing\n' "$f"; exit 1; }
done

# --------------------------------------------------------------- what Go asks

# The two `const` lines, e.g.
#     rulePercentile = "timseil:site:request_duration_seconds:p95_5m"
# Matched on the quoted value rather than on the constant name, so that renaming
# the Go identifier does not quietly empty this list.
wanted=$(sed -n 's/^[[:space:]]*rule[A-Za-z0-9_]*[[:space:]]*=[[:space:]]*"\([^"]*\)".*$/\1/p' "$asks")

[ -n "$wanted" ] || {
  printf '  ✗ %s names no recording rule\n' "$asks"
  printf '    expected a const like: rulePercentile = "timseil:site:..."\n'
  exit 1
}

# ----------------------------------------------------------- what Prometheus has

declared=$(sed -n 's/^[[:space:]]*-[[:space:]]*record:[[:space:]]*\(.*\)$/\1/p' "$rules" \
  | sed 's/[[:space:]]*$//')

[ -n "$declared" ] || { printf '  ✗ %s declares no recording rule\n' "$rules"; exit 1; }

# ------------------------------------------------------------------ the answer

missing=0
count=0

for name in $wanted; do
  count=$((count + 1))
  found=0
  for have in $declared; do
    [ "$name" = "$have" ] && { found=1; break; }
  done
  [ "$found" -eq 1 ] && continue

  missing=$((missing + 1))
  printf '  ✗ %s asks for %s and %s does not declare it\n' "$asks" "$name" "$rules"
done

if [ "$missing" -gt 0 ]; then
  printf '    the query would be valid, the answer empty, and the page back on — NO DATA\n'
  printf '    declared in %s:\n' "$rules"
  for have in $declared; do printf '      %s\n' "$have"; done
  exit 1
fi

printf '  ✓ %s recording rules asked for, all of them declared\n' "$count"
