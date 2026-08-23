#!/bin/sh
# The cron expression and the Go constant are two halves of one number.
#
#   check-probe-cadence.sh [repo-root]     default: .
#
# down_sec in queries/ops.sql is failed checks TIMES ops.ProbeInterval, and the
# failed checks are however often .github/workflows/probe.yml actually ran. Move
# one without the other and every outage duration on a public page is wrong by
# that factor — while the page keeps looking entirely correct, because the grid
# still has the right number of cells and they are still the right colour.
#
# THIS CHECK WAS ORDERED BEFORE IT WAS WRITTEN. docs/runbooks/ops.md has carried
# the sentence "nothing checks that today, F4 should bring a check for it" since
# C7. That is the nameable trigger CLAUDE.md asks for: the failure has not
# happened, but the way it would happen is written down, and it is a failure
# nobody would notice from the outside.
#
# It reads BOTH files as text rather than running anything. The Go constant is
# not reachable from a shell without a compiler, and a check that needs a
# toolchain to answer a question about two lines would not be in `make check`.
set -eu

root=${1:-.}
workflow=$root/.github/workflows/probe.yml
constant=$root/api/internal/ops/ops.go

for f in "$workflow" "$constant"; do
  [ -f "$f" ] || { printf '  ✗ %s is missing\n' "$f"; exit 1; }
done

# ------------------------------------------------------------------- the cron

cron=$(sed -n 's/^ *- *cron: *"\(.*\)" *$/\1/p' "$workflow" | head -1)
[ -n "$cron" ] || { printf '  ✗ %s declares no cron expression\n' "$workflow"; exit 1; }

minute=$(printf '%s' "$cron" | awk '{print $1}')
rest=$(printf '%s' "$cron" | awk '{print $2, $3, $4, $5}')

# Every other field has to be `*`. A probe that runs only on Mondays would pass
# a check that looked at the step alone, and its grid would be five sixths gaps.
[ "$rest" = "* * * *" ] || {
  printf '  ✗ the cron is "%s" — the probe has to run every hour of every day\n' "$cron"
  exit 1
}

# `*/N` and `A-B/N` both carry the step after the slash. Anything without a
# slash fires once an hour at best, which is not a cadence this grid can use.
case $minute in
  */*) step_min=${minute##*/} ;;
  *)   printf '  ✗ the minute field is "%s" — want a step, as in */5 or 3-58/5\n' "$minute"; exit 1 ;;
esac

case $step_min in
  '' | *[!0-9]*) printf '  ✗ the cron step is "%s", which is not a number\n' "$step_min"; exit 1 ;;
esac
[ "$step_min" -gt 0 ] || { printf '  ✗ the cron step is zero\n'; exit 1; }

cron_sec=$((step_min * 60))

# --------------------------------------------------------------- the constant

# `ProbeInterval = 5 * time.Minute`, with the comment lines above it ignored.
line=$(sed -n 's/^[[:space:]]*ProbeInterval[[:space:]]*=[[:space:]]*\(.*\)$/\1/p' "$constant" | head -1)
[ -n "$line" ] || { printf '  ✗ %s declares no ProbeInterval\n' "$constant"; exit 1; }

count=$(printf '%s' "$line" | awk '{print $1}')
unit=$(printf '%s' "$line" | sed 's/.*time\.//' | awk '{print $1}')

case $count in
  '' | *[!0-9]*) printf '  ✗ ProbeInterval reads "%s" — want a whole number times a time unit\n' "$line"; exit 1 ;;
esac

case $unit in
  Second) go_sec=$count ;;
  Minute) go_sec=$((count * 60)) ;;
  Hour)   go_sec=$((count * 3600)) ;;
  *) printf '  ✗ ProbeInterval reads "%s" — want time.Second, time.Minute or time.Hour\n' "$line"; exit 1 ;;
esac

# ------------------------------------------------------------------ the answer

if [ "$cron_sec" -ne "$go_sec" ]; then
  printf '  ✗ the probe runs every %ss and ProbeInterval says %ss\n' "$cron_sec" "$go_sec"
  printf '    %s: %s\n' "$workflow" "$cron"
  printf '    %s: ProbeInterval = %s\n' "$constant" "$line"
  printf '    every outage duration on the site is wrong by a factor of %s\n' \
    "$(awk -v a="$cron_sec" -v b="$go_sec" 'BEGIN { printf "%.2f", a / b }')"
  exit 1
fi

printf '  ✓ the probe and the roll-up both count %ss\n' "$go_sec"
