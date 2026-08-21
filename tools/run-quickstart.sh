#!/bin/sh
# Runs the README quickstart and reports whether it still works.
#
#   run-quickstart.sh [repo-root]     default: .
#
# The block comes from tools/check-readme.sh --print, so what runs here is the
# text the README shows and not a copy kept in step by hand. That is the whole
# point: a second copy is what drifts.
#
# **Two of the lines are servers.** `make dev` is `compose up --build` in the
# foreground and `make design` is `npx serve`; neither returns, and both are
# meant not to. So the rule is general rather than a list of which lines those
# are — a list would be a second thing to keep in step:
#
#   a line that exits 0        → it worked, next line
#   a line that exits non-zero → the instruction is broken, stop
#   a line still running after GRACE seconds → it is a server, leave it up
#
# After the block, the URLs the README promises directly beneath it are probed.
# Without that, `make dev` would "pass" by the mere fact that compose stayed
# running, which is not what the reader was told would happen.
#
# Not part of `make check`: it clones, installs, builds two images and starts a
# stack. It runs on pushes to main and on the weekly schedule — "does the guide
# still work" is a question about months, not about one diff.
set -eu

root=${1:-.}
grace=${QUICKSTART_GRACE:-120}
work=$(mktemp -d)
servers=""

cleanup() {
  for pid in $servers; do kill "$pid" 2>/dev/null || true; done
  # The stack outlives `make dev` being killed, so it is stopped by name.
  [ -d "$work/timseil-dev" ] && (cd "$work/timseil-dev" && make dev-down >/dev/null 2>&1) || true
  rm -rf "$work"
}
trap cleanup EXIT INT TERM

block=$("$root/tools/check-readme.sh" --print "$root")
[ -n "$block" ] || { printf '  ✗ the quickstart block is empty\n'; exit 1; }

cd "$work"
printf '%s\n' "$block" | while IFS= read -r line; do
  case $line in ''|'#'*) continue ;; esac
  printf '  → %s\n' "$line"
done

# The block is executed as one shell so that `cd timseil-dev` carries, which is
# how a reader runs it. Line-by-line accounting happens through the exit code of
# each command inside that shell.
printf '%s\n' "$block" > "$work/block.sh"

# shellcheck disable=SC2016  # the inner script is written for the inner shell
cat > "$work/drive.sh" <<'DRIVE'
set -u
grace=$1
status=0
while IFS= read -r line; do
  case $line in ''|'#'*) continue ;; esac
  printf '\n=== %s\n' "$line"
  eval "$line" &
  pid=$!
  waited=0
  while kill -0 "$pid" 2>/dev/null && [ "$waited" -lt "$grace" ]; do
    sleep 2
    waited=$((waited + 2))
  done
  if kill -0 "$pid" 2>/dev/null; then
    printf '    still running after %ss — treated as a server, left up\n' "$grace"
    printf '%s\n' "$pid" >> "$SERVERS_FILE"
    continue
  fi
  wait "$pid" || { status=$?; printf '    ✗ exited %s\n' "$status"; exit "$status"; }
done
exit 0
DRIVE

SERVERS_FILE=$work/servers
export SERVERS_FILE
: > "$SERVERS_FILE"

if ! sh "$work/drive.sh" "$grace" < "$work/block.sh"; then
  printf '  ✗ the quickstart does not run any more\n'
  exit 1
fi
servers=$(cat "$SERVERS_FILE" 2>/dev/null || true)

# The URLs the README lists under the block, read from the README rather than
# repeated here.
urls=$(grep -oE 'http://localhost:[0-9]+[^ >|)]*' "$root/README.md" | sort -u)
fail=0
for u in $urls; do
  if curl -fsS --max-time 10 --retry 12 --retry-delay 5 --retry-all-errors "$u" >/dev/null 2>&1; then
    printf '  ✓ %s answers\n' "$u"
  else
    printf '  ✗ %s does not answer — the README promises it right under the block\n' "$u"
    fail=1
  fi
done

[ "$fail" -eq 0 ] || exit 1
printf '  ✓ the quickstart runs and every URL it promises answers\n'
