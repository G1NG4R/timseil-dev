#!/bin/sh
# Something outside this host measures whether the host answers.
#
#   probe.sh [--log FILE] [base-url]
#
# A host cannot report its own outage — handbook ch. 8. This is the watcher that
# runs somewhere else: every five minutes from .github/workflows/probe.yml, and
# by hand from a laptop against a dev stack. It writes what it saw in one of two
# places, and which one is the whole design:
#
#   the host answers  →  POST /api/internal/probe, one row in ops_checks
#   the host is gone  →  a line in uptime-log.txt on the ops-data branch, which
#                        does not die with the machine; the api replays it later
#
# WHAT "UP" MEANS HERE IS TWO THINGS, and ADR 0038 §D4 is why. GET / has to
# answer 200 — that is the visitor's truth, the same one E5's deploy witness
# measured — AND the report has to arrive. The write path is the second probe:
# if the api is gone the report does not land, and the api is part of this
# system.
#
# A 401 OR 400 FROM THE ENDPOINT IS NOT AN OUTAGE. It is our own misconfiguration,
# and this script stops loudly without writing a line. A typo in a secret must
# not colour a public grid red.
#
# THE TOKEN NEVER APPEARS IN argv. curl reads its configuration from stdin, the
# same way report-deploy.sh does and for the same reason: on a shared machine a
# process listing is not a private place.
#
# THE REASON IS MAPPED, NEVER QUOTED. A curl error text carries the address it
# could not reach, uptime-log.txt is public, and F1a found exactly that leak in
# mail/smtp.go. The words below are the closed vocabulary api/internal/uptime
# parses; anything else makes the api reject the whole file.
set -eu

log=''
case ${1:-} in
  --log) log=${2:?usage: probe.sh [--log FILE] [base-url]}; shift 2 ;;
esac
base=${1:-${VERIFY_BASE_URL:-https://timseil.dev}}

command -v curl >/dev/null 2>&1 || { printf '  ✗ curl is not available\n'; exit 1; }

# Checked before anything reaches the network. A run without a token cannot
# report an up, so it could only ever write a down — an outage invented by a
# missing variable.
: "${INTERNAL_PROBE_TOKEN:?INTERNAL_PROBE_TOKEN is not set}"

# The instant the measurement began, not the instant it finished. A retry of the
# report may take fifteen seconds, and the observation is the earlier one.
# Whole seconds, literal Z: exactly the spelling api/internal/uptime accepts,
# and it rejects every other one.
at=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

umask 077
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT INT TERM

# ------------------------------------------------------------------ measure

# --max-time 10 and not longer. Five minutes between runs means a slow answer is
# still an answer, but a page that takes more than ten seconds is not one a
# visitor waits for either.
# `|| page=…` followed by `$?` would read the status of the assignment, which
# is always zero — the || already handled the failure. An if is the only shape
# that keeps curl's own exit code, and that code is the specific half of the
# diagnosis below.
if page=$(curl -sS --max-time 10 -o /dev/null \
  -w '%{http_code} %{time_starttransfer}' "$base/" 2>/dev/null); then
  exit_code=0
else
  exit_code=$?
  page="000 0"
fi

status=${page%% *}
seconds=${page##* }

# Milliseconds, rounded, without bc: seconds carries three decimals, so the
# arithmetic is integer once the point is gone. A latency is only ever reported
# on an up, where the request completed and the number means something.
latency=$(printf '%s' "$seconds" | awk '{printf "%d", ($1 * 1000) + 0.5}')

# curl's exit code first, because it is the specific one; the status only speaks
# when curl itself was happy. Every arm names a word from the vocabulary.
case $exit_code in
  0)  case $status in
        200)    state=up;   reason='' ;;
        5??)    state=down; reason='http 5xx' ;;
        4??)    state=down; reason='http 4xx' ;;
        *)      state=down; reason='probe failed' ;;
      esac ;;
  6)  state=down; reason='dns failure' ;;
  7)  state=down; reason='connect refused' ;;
  28) state=down; reason='connect timeout' ;;
  35|51|58|59|60|77|83) state=down; reason='tls failure' ;;
  *)  state=down; reason='probe failed' ;;
esac

# ------------------------------------------------------------------- report

# Only when the page answered. There is nothing to report about a host that is
# not there, and the endpoint that would take the report is on it.
if [ "$state" = up ]; then
  printf '{"at":"%s","up":true,"latencyMs":%s}' "$at" "$latency" > "$work/body.json"

  # Three attempts, five seconds apart, and the reason is ADR 0035: every
  # rollout has a moment in step 3 where `api` is gone while the site is served.
  # Without this window a deploy would write a real outage into a public grid.
  code='000'
  n=1
  while [ "$n" -le 3 ]; do
    code=$(printf '%s\n' \
      "url = \"$base/api/internal/probe\"" \
      'request = "POST"' \
      "header = \"Authorization: Bearer $INTERNAL_PROBE_TOKEN\"" \
      'header = "Content-Type: application/json"' \
      "data = \"@$work/body.json\"" \
      | curl -sS --max-time 10 -o /dev/null -w '%{http_code}' --config - 2>/dev/null) || code='000'

    case $code in
      204) break ;;
      # Ours, not theirs. Stop at once: retrying a rejected document four more
      # times sends a wrong token four more times and still writes nothing.
      400|401|403)
        printf '  ✗ the endpoint answered %s — this is a misconfiguration, not an outage\n' "$code"
        printf '    nothing was written and no state changed. Check INTERNAL_PROBE_TOKEN\n'
        printf '    against the value the api container has.\n'
        exit 1 ;;
    esac

    n=$((n + 1))
    [ "$n" -le 3 ] && sleep 5
  done

  if [ "$code" != "204" ]; then
    # The page is served and the api is not. That is an outage of this system,
    # and it is exactly the case the ops-data branch exists for.
    state=down
    reason='api unreachable'
  fi
fi

printf 'probe %s %s' "$state" "$base"
[ "$state" = up ] && printf ' %sms' "$latency"
[ -n "$reason" ] && printf ' — %s' "$reason"
printf '\n'

# ---------------------------------------------------------------- the record

changed=no

if [ -n "$log" ]; then
  # Created with its header when missing, so the branch needs no commit by hand.
  # The file starts EMPTY of transitions: the state before the first line is up,
  # and its first line is the first real outage (ADR 0038 §D5).
  [ -f "$log" ] || printf '%s\n' \
    '# uptime-log.txt — machine written by tools/probe.sh (F4).' \
    '# Grammar: docs/adr/0038. Two lines per outage, tab separated, UTC.' > "$log"

  # The last state on record. grep -v drops the header; the state is field 2.
  # No line at all means up, which is the same rule the parser enforces.
  last=$(grep -v '^#' "$log" | grep -v '^[[:space:]]*$' | tail -1 | cut -f2)
  [ -n "$last" ] || last=up

  if [ "$state" != "$last" ]; then
    changed=yes
    if [ "$state" = down ]; then
      printf '%s\t%s\t%s\n' "$at" down "$reason" >> "$log"
    else
      printf '%s\t%s\n' "$at" up >> "$log"
    fi
    printf '  ✓ %s → %s recorded in %s\n' "$last" "$state" "$log"
  fi
fi

# Read by the workflow, which decides what a change is worth: a run that finds
# the host newly gone ends non-zero so GitHub sends the mail, and every later
# run of the same outage ends green so it sends only one.
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  printf 'state=%s\n' "$state" >> "$GITHUB_OUTPUT"
  printf 'changed=%s\n' "$changed" >> "$GITHUB_OUTPUT"
  printf 'reason=%s\n' "$reason" >> "$GITHUB_OUTPUT"
fi
