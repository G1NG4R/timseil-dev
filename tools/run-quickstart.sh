#!/bin/sh
# Runs the README quickstart and reports whether it still works.
#
#   run-quickstart.sh [repo-root]     default: .
#
# The block comes from `tools/check-readme.sh --print`, so what runs here is the
# text the README shows and not a copy kept in step by hand. That is the point:
# a second copy is the thing that drifts.
#
# **Two of the lines are servers.** `make dev` is `compose up --build` in the
# foreground, `make design` is `npx serve`; neither returns, and neither is
# meant to. So the rule is general rather than a list of which lines those are,
# because a list would be a second thing to keep in step:
#
#   exits 0                   → it worked, next line
#   exits non-zero            → the instruction is broken, stop
#   still running after GRACE → it is a server, leave it up, next line
#
# **`cd` is the exception, and the first version of this file got it wrong.**
# It ran every line as `eval "$line" &`, which for `cd timseil-dev` moves a
# background subshell that immediately exits while the parent stays where it
# was — so the next line ran outside the clone and git said "not in a git
# directory". A builtin cannot be backgrounded and still mean anything. A
# reader types it and their shell moves; this has to do the same.
#
# After the block, every URL the README promises beneath it is fetched — read
# out of the README rather than repeated here. Without that, `make dev` would
# "pass" on the mere fact that compose stayed running, which is not what the
# reader was told would happen.
#
# Not part of `make check`: it clones, installs, builds two images and starts a
# stack. It runs on pushes to main and on the weekly schedule, because "does the
# guide still work" is a question about months and not about one diff.
#
# QUICKSTART_ORIGIN replaces the clone URL, and it exists because of how the
# first version of this file shipped broken: the block is read from the LOCAL
# README while `git clone` fetches the published one, so on any branch but main
# the instructions and the tree under test are different things — and a fix to
# the quickstart could not be verified until after it had been merged. CI does
# not set it, so there the clone stays verbatim and a push to main tests exactly
# what a stranger would get. Same seam as CHECK_LINT_BIN and CHECK_TIDY_DIR.
set -u

root=$(cd "${1:-.}" && pwd)
grace=${QUICKSTART_GRACE:-180}
work=$(mktemp -d)
servers=""
setsid=$(command -v setsid || true)

# Servers are killed by PROCESS GROUP, not by pid, and that is not a detail.
# `make design` is `npx serve`, which is npm exec spawning a node child; killing
# the pid this script recorded leaves that child holding port 4000, and the next
# run fails on "port 4000 is in use" — which is how this was found, by leaving
# one behind on the machine it was being tested on.
#
# setsid makes each line its own session and process-group leader, so the group
# id equals the pid and one signal reaches everything it started. Where setsid
# does not exist the fallback is the old behaviour, and the comment says so
# rather than pretending the leak cannot happen.
cleanup() {
  for pid in $servers; do
    kill -- "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
  done
  if [ -d "$work/timseil-dev" ]; then
    (cd "$work/timseil-dev" && make dev-down >/dev/null 2>&1) || true
  fi
  rm -rf "$work"
}
trap cleanup EXIT INT TERM

"$root/tools/check-readme.sh" --print "$root" > "$work/block.sh" || {
  printf '  ✗ the quickstart block could not be read\n'; exit 1; }
[ -s "$work/block.sh" ] || { printf '  ✗ the quickstart block is empty\n'; exit 1; }

cd "$work" || exit 1

while IFS= read -r line; do
  case $line in
    ''|'#'*) continue ;;
    'cd '*)
      printf '\n=== %s\n' "$line"
      eval "$line" || { printf '    ✗ this line of the quickstart failed\n'; exit 1; }
      continue
      ;;
  esac

  case $line in
    *'git clone '*)
      if [ -n "${QUICKSTART_ORIGIN:-}" ]; then
        # The target directory has to be named too, not just the source. git
        # derives it from the last path component, so cloning a local checkout
        # of timseil.dev would produce `timseil.dev` while the next line of the
        # block says `cd timseil-dev`. The name is taken from the URL the README
        # actually carries rather than assumed.
        target=$(printf '%s' "$line" | sed -n 's|.*/\([^/ ]*\)\.git.*|\1|p')
        line="git clone $QUICKSTART_ORIGIN ${target:-timseil-dev}"
      fi
      ;;
  esac

  printf '\n=== %s\n' "$line"
  if [ -n "$setsid" ]; then
    "$setsid" sh -c "$line" &
  else
    eval "$line" &
  fi
  pid=$!

  waited=0
  while kill -0 "$pid" 2>/dev/null && [ "$waited" -lt "$grace" ]; do
    sleep 2
    waited=$((waited + 2))
  done

  if kill -0 "$pid" 2>/dev/null; then
    printf '    still running after %ss — a server, left up\n' "$grace"
    servers="$servers $pid"
    continue
  fi

  if ! wait "$pid"; then
    printf '    ✗ this line of the quickstart failed\n'
    exit 1
  fi
done < "$work/block.sh"

urls=$(grep -oE 'http://localhost:[0-9]+[^ >|)]*' "$root/README.md" | sort -u)
[ -n "$urls" ] || { printf '  ✗ the README promises no URL to check\n'; exit 1; }

fail=0
for u in $urls; do
  if curl -fsS --max-time 10 --retry 12 --retry-delay 5 --retry-all-errors "$u" >/dev/null 2>&1; then
    printf '  ✓ %s answers\n' "$u"
  else
    printf '  ✗ %s does not answer — the README promises it under the block\n' "$u"
    fail=1
  fi
done

[ "$fail" -eq 0 ] || exit 1
printf '  ✓ the quickstart runs, and all %s URLs it promises answer\n' "$(printf '%s\n' "$urls" | grep -c .)"
