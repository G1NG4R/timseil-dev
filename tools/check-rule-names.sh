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
# TWO DIRECTIONS, AND THE SECOND ONE IS NARROWER THAN THE FIRST.
#
#   1. Every name Go asks for exists in slis.yml. The obvious direction.
#   2. Every `timseil:site:*` rule in slis.yml is asked for by Go.
#
# The second exists because the first can shrink without noticing. `wanted` is
# read out of the Go source, so a name that stops being found there stops being
# checked — and the run still prints a tick, for one name instead of two. Any
# guard against that inside direction 1 would have to know how many names to
# expect, which is a third copy of the answer. Direction 2 knows it from
# slis.yml instead: a site rule nobody reads is the same defect seen from the
# other end.
#
# It is scoped to `site:` on purpose. The three per-service rules are read by
# nobody in Go and that is correct — timseil:service:availability_5m waits for
# F10's burn-rate alerts, and all three feed F9's dashboards. A check demanding
# a Go reader for those would fail today for a reason that is right.
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

# Every quoted string in the file that has the shape of one of our rule names,
# e.g.
#     rulePercentile = "timseil:site:request_duration_seconds:p95_5m"
#
# The shape and not the identifier. An earlier version matched constants named
# `rule*` and claimed in this very comment that renaming the identifier could
# not empty the list — it could, silently, and the run would have gone green
# over one name instead of two. Nothing in the Go file is allowed to decide how
# much this gate checks.
wanted=$(sed -n 's/.*"\(timseil:[A-Za-z0-9_:]*\)".*/\1/p' "$asks" | sort -u)

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

# ------------------------------------------------- direction 2, site rules only

unread=0
site=0

for have in $declared; do
  case $have in timseil:site:*) ;; *) continue ;; esac
  site=$((site + 1))

  found=0
  for name in $wanted; do
    [ "$name" = "$have" ] && { found=1; break; }
  done
  [ "$found" -eq 1 ] && continue

  unread=$((unread + 1))
  printf '  ✗ %s declares %s and %s asks for nothing of that name\n' "$rules" "$have" "$asks"
done

if [ "$unread" -gt 0 ]; then
  printf '    a site rule exists to be read; one nobody reads is a page field left null\n'
  exit 1
fi

printf '  ✓ %s recording rules asked for, all declared; %s site rules, all read\n' "$count" "$site"
