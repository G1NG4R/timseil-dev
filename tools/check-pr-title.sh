#!/bin/sh
# The subject the squash merge will write to main, checked before it is written.
#
#   check-pr-title.sh <title> <pull-request-number>
#
# WHY THIS IS NOT JUST THE HOOK. `.github/workflows/pr-title.yml` used to hand
# the pull request title straight to `.githooks/commit-msg`, and that measured
# the wrong string. GitHub's squash merge writes `<title> (#N)` — seven or eight
# characters the hook never saw:
#
#   #342   85 chars  ->  red
#   #343   74 chars  ->  red
#   #351   71 chars  ->  green,  78 on main
#   #352   66 chars  ->  green,  73 on main
#
# A title between 66 and 72 passes the gate and lands over the limit, and the
# two that did are in the history. The number is known at check time — it is the
# pull request's own — so the suffix does not have to be guessed.
#
# ONE GRAMMAR, ONE FILE, still. This composes the subject and then runs the same
# program a developer's `git commit` runs; it does not re-spell the pattern or
# the limit. The hook's 72 is correct locally, where there is no suffix, so the
# hook is left alone and the knowledge of what the squash appends lives here.
#
# IT PRINTS THE ARITHMETIC BEFORE IT CHECKS, because the failure this exists to
# produce is the confusing one: a title a contributor can count to 70 is refused
# for being 77. The three lines above the refusal say which seven characters
# they did not count. #354.
set -eu

title=${1?usage: check-pr-title.sh <title> <pull-request-number>}
number=${2?usage: check-pr-title.sh <title> <pull-request-number>}

case $number in
  '' | *[!0-9]*) printf '✗ %s is not a pull request number\n' "$number" >&2; exit 2 ;;
esac

root=$(git rev-parse --show-toplevel 2>/dev/null || printf '.')
hook=$root/.githooks/commit-msg
[ -x "$hook" ] || { printf '✗ %s is missing or not executable\n' "$hook" >&2; exit 2; }

# THE FIRST LINE AND ONLY THE FIRST. A title cannot hold a newline through
# GitHub's API, and if one ever arrives the subject is still the first line —
# the same thing the hook would have done, decided here so the suffix cannot end
# up appended to a body instead.
subject=$(printf '%s\n' "$title" | sed -n '1p')
suffix=" (#$number)"
composed=$subject$suffix

printf '  title            %s characters\n' "${#subject}"
printf '  suffix           %s characters  "%s"\n' "${#suffix}" "$suffix"
printf '  subject on main  %s characters\n\n' "${#composed}"

work=$(mktemp) || exit 2
trap 'rm -f "$work"' EXIT INT TERM
printf '%s\n' "$composed" > "$work"

"$hook" "$work"
printf '✓ the title is a Conventional Commit, and it fits once the squash has numbered it\n'
