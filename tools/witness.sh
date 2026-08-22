#!/bin/sh
# What a visitor saw while the deploy was happening.
#
#   witness.sh --seconds N        [--path P]… [base-url]
#   witness.sh --until-restart    [--path P]… [base-url]
#   witness.sh --until-sha <sha7> [--path P]… [base-url]
#
# THE INSTRUMENT E5 IS MISSING, AND WHY IT IS A FILE RATHER THAN A LOOP
#
# On 2026-08-22 a hand-typed `while true; do curl; sleep 1; done` measured the
# rollback drill and found something nobody had gone looking for: every
# container swap serves about ten seconds of 404 to the public site. That loop
# then went away with the terminal it ran in. Issue #143 asks for the repair and
# for this: "whatever produces the witness is a command in the repository, not a
# shell loop somebody remembers".
#
# WHAT IT ASSERTS, AND WHY IT IS NOT WHAT verify-deploy.sh ASSERTS
#
# tools/verify-deploy.sh asks five questions ONCE, at the end, when the site is
# back. Its promise is "the build we ordered is serving the site". That promise
# is true and narrow. It is NOT "no visitor saw an error", and after the drill it
# must not be read that way.
#
# This script makes the second claim, and it can only be made continuously:
# stage E5 is done when a deploy, written down from outside over the public
# name, one request a second for its whole duration, shows NO ANSWER THAT IS NOT
# 200. Build plan, stage E5; system handbook chapter 26.
#
# NOT 5xx. ANYTHING THAT IS NOT 200.
#
# The criterion said "zero 5xx" until E4b measured it. There are no 5xx in that
# window — there are 404s, because the routers are labels on the containers, so
# a container that is being recreated takes its router with it and Traefik
# answers its own default. The old wording would have passed the exact defect it
# existed to catch. So three classes are counted here, not two:
#
#   200              — the only good answer
#   any other status — 404 and 502 alike; a status is an answer
#   no connection    — no answer at all, which a visitor also cannot use
#
# The third one is easy to leave out and would repeat the same mistake one level
# down. The drill's table has both failure kinds in it.
#
# FROM OUTSIDE, OVER THE PUBLIC NAME. Not through the tunnel, not against a
# container IP, not with a Host header nobody else sends — the same rule
# verify-deploy.sh states for the same reason: what is being asserted is that a
# visitor can use the site, and the only honest way to check that is to be one.
#
# BOTH IMAGES SWAP, SO BOTH ARE WATCHED. The drill only sampled `/`. The api
# container is recreated in the same breath, and `/api/health` is the path that
# would show it. One request a second per path is two requests a second at the
# host, against RATE_LIMIT_RPM=120 — the api sees one of them. Measured, not
# assumed: a 429 in the table would be this script's own fault, and it would say
# so by appearing as a status like any other.
#
# IT HAS TO SEE THE SWAP, AND SAYING SO COST A MEASUREMENT.
#
# On 2026-08-22 this script was started three and a half minutes after the merge
# it was meant to measure. /api/health already answered the target sha on the
# first sample, so the run ended thirty seconds later with "every answer was
# 200" over a window that contained no deploy at all. A green tick above nothing
# — the third time this repository has caught that shape in one day, after the
# drill that passed in three seconds and after --until-sha's own guard rail.
#
# The repair is the one verify-deploy.sh already uses for its fourth condition,
# and it is the same field: .startedAt read against itself. A deploy is a NEW
# PROCESS, so nothing counts as one until that value changes. Two consequences,
# and the second is the one that matters:
#
#   · --until-sha now needs the sha AND a restart. Started too late, it is red.
#   · --until-restart needs no sha at all, which is what lets it be started
#     BEFORE the merge — and a squash sha does not exist before the merge, which
#     is exactly how the run above ended up starting too late.
#
# TIME IS RECORDED, NOT ASSUMED. Each sample carries the wall-clock second it
# was taken in. A request that outlasts the interval leaves a gap in the numbers
# rather than a smoothed-over row: an instrument that hides its own hiccups is
# not measuring, it is reassuring.
set -eu

# One request a second is the criterion, quoted from the build plan. It is not a
# knob: change it and the thing being measured is a different thing.
INTERVAL_SEC=1

# Bounded well under the interval, for the same reason verify-deploy.sh bounds
# its own: a hung connection must not silently eat the run.
TIMEOUT_SEC=4

# How long to keep watching after the site reports the sha that was deployed.
# The drill's second swap began 44 s after the first one finished, so stopping
# at the first sight of the new build would have missed the rollback entirely.
#
# The override is the seam tools/selftest.sh needs, the same way CHECK_VERSION_DIR
# is one for version.sh: a suite that waited half a minute per case to prove an
# exit code would be a suite nobody runs.
TAIL_SEC=${WITNESS_TAIL_SEC:-30}

# A guard rail on the instrument, not a measurement of the system. It exists so
# that an unattended witness cannot run until somebody notices; nothing is
# concluded from its value, and it is only reached when --until-sha never comes
# true. Say so out loud rather than letting a reader take 900 for a deadline the
# deploy is held to.
MAX_SEC=${WITNESS_MAX_SEC:-900}

usage() {
  printf 'usage: witness.sh --seconds N [--path P]… [base-url]\n' >&2
  printf '       witness.sh --until-restart [--path P]… [base-url]\n' >&2
  printf '       witness.sh --until-sha <sha7> [--path P]… [base-url]\n' >&2
  exit 1
}

seconds=''
until_sha=''
until_restart=''
base=''
paths=''

while [ $# -gt 0 ]; do
  case $1 in
    --seconds)
      [ $# -ge 2 ] || usage
      seconds=$2
      shift 2
      ;;
    --until-sha)
      [ $# -ge 2 ] || usage
      until_sha=$2
      shift 2
      ;;
    --until-restart)
      until_restart=1
      shift
      ;;
    --path)
      [ $# -ge 2 ] || usage
      case $2 in
        /*) ;;
        *) printf '  ✗ a path starts with / — got %s\n' "$2" >&2; exit 1 ;;
      esac
      paths="$paths $2"
      shift 2
      ;;
    -*)
      printf '  ✗ unknown option %s\n' "$1" >&2
      usage
      ;;
    *)
      [ -z "$base" ] || usage
      base=$1
      shift
      ;;
  esac
done

# NO DEFAULT DURATION. A witness that ran "for a while" would publish a count
# nobody can hold against anything, and picking a number here would be this
# repository inventing one. Exactly one of the three has to be said.
ends=0
[ -n "$seconds" ] && ends=$(( ends + 1 ))
[ -n "$until_sha" ] && ends=$(( ends + 1 ))
[ -n "$until_restart" ] && ends=$(( ends + 1 ))
if [ "$ends" -gt 1 ]; then
  printf '  ✗ --seconds, --until-restart and --until-sha say different things about when to stop\n' >&2
  exit 1
fi
[ "$ends" -eq 1 ] || {
  printf '  ✗ say when to stop: --seconds N, --until-restart or --until-sha <sha7>\n' >&2
  usage
}

case $seconds in
  '') ;;
  *[!0-9]* | 0) printf '  ✗ --seconds takes a positive whole number — got %s\n' "$seconds" >&2; exit 1 ;;
esac

# The same shape check verify-deploy.sh makes, for the same reason: a caller
# that sends `ABCDEF1` has a bug worth one clear message.
if [ -n "$until_sha" ]; then
  case $until_sha in
    *[!0-9a-f]* | '') printf '  ✗ %s is not lowercase hexadecimal\n' "$until_sha" >&2; exit 1 ;;
  esac
  [ "${#until_sha}" -ge 7 ] || {
    printf '  ✗ %s is shorter than seven characters\n' "$until_sha" >&2
    exit 1
  }
fi

base=${base:-${WITNESS_BASE_URL:-https://timseil.dev}}
base=${base%/}

# `/` is what the drill measured and what a visitor asks for. `/api/health` is
# the other container, and the only path that can say which build is answering.
[ -n "$paths" ] || paths='/ /api/health'

# Both waiting modes read /api/health, so a path list without it would leave the
# run with no way to end except the guard rail. Said here in one line rather than
# discovered fifteen minutes later.
# Not `[ … ] || [ … ] && watching=1`: with set -e that chain exits the script
# when both are empty, which is the ordinary --seconds run.
watching=''
if [ -n "$until_sha" ] || [ -n "$until_restart" ]; then watching=1; fi
if [ -n "$watching" ]; then
  case " $paths " in
    *' /api/health '*) ;;
    *)
      printf '  ✗ waiting for a deploy reads /api/health, which is not in the paths\n' >&2
      exit 1
      ;;
  esac
fi

for tool in curl awk; do
  command -v "$tool" >/dev/null 2>&1 || {
    printf '  ✗ %s is not available\n' "$tool" >&2
    exit 1
  }
done
if [ -n "$watching" ]; then
  command -v jq >/dev/null 2>&1 || {
    printf '  ✗ jq is not available, and waiting for a deploy reads /api/health\n' >&2
    exit 1
  }
fi

# umask before mktemp, not after: the samples are the evidence, and a
# world-readable temp directory is a habit worth not having.
umask 077
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT INT TERM

slug() {
  printf '%s' "$1" | tr -c 'a-zA-Z0-9' '_'
}

for p in $paths; do
  : > "$work/$(slug "$p")"
done

printf 'witness %s\n' "$base"
printf '  one request a second, per path:%s\n' "$(printf ' %s' $paths)"
if [ -n "$seconds" ]; then
  printf '  for %ss\n' "$seconds"
elif [ -n "$until_sha" ]; then
  printf '  until /api/health answers sha %s from a NEW process, then %ss more (giving up after %ss)\n' \
    "$until_sha" "$TAIL_SEC" "$MAX_SEC"
else
  printf '  until /api/health answers from a NEW process, then %ss more (giving up after %ss)\n' \
    "$TAIL_SEC" "$MAX_SEC"
fi

start=$(date +%s)
tick=0
seen_at=''
gave_up=''
# The instant this run first got an answer out of /api/health, and the build it
# named. Both are read once and then held: what ends the wait is a CHANGE in the
# first of them, which is the same comparison verify-deploy.sh makes and needs no
# second clock to reason about.
first_start=''
first_sha=''
restarted=''

while :; do
  tick=$(( tick + 1 ))
  now=$(date +%s)
  elapsed=$(( now - start + 1 ))

  for p in $paths; do
    if [ -n "$watching" ] && [ "$p" = '/api/health' ]; then
      # -f is deliberately absent here too: the status code is the measurement,
      # and a 502 must be reported as a 502 rather than as exit code 22.
      body=$(curl -sS --max-time "$TIMEOUT_SEC" -o - -w '\n%{http_code}' "$base$p" 2>/dev/null) || body=''
      code=$(printf '%s' "$body" | tail -1)
      if [ "$code" = '200' ] && [ -z "$seen_at" ]; then
        doc=$(printf '%s' "$body" | sed '$d')
        running=$(printf '%s' "$doc" | jq -r '.sha // empty' 2>/dev/null || true)
        began=$(printf '%s' "$doc" | jq -r '.startedAt // empty' 2>/dev/null || true)

        if [ -z "$first_start" ]; then
          # The first answer of the run. It is the baseline, never the result:
          # whatever is running now was running before this witness existed.
          first_start=$began
          first_sha=$running
        elif [ -n "$began" ] && [ "$began" != "$first_start" ]; then
          restarted=1
        fi

        # A deploy is a new process. The sha alone cannot say that — it is equal
        # to itself on a redeploy of the same tag, and it is already correct for
        # a witness that arrived after the swap.
        if [ -n "$restarted" ]; then
          if [ -z "$until_sha" ] || [ "$running" = "$until_sha" ]; then
            seen_at=$(date +%s)
          fi
        fi
      fi
    else
      code=$(curl -sS --max-time "$TIMEOUT_SEC" -o /dev/null -w '%{http_code}' "$base$p" 2>/dev/null) || code=''
    fi

    # curl reports 000 for a connection that never produced a status line, and
    # writes nothing at all when it fails before that. Both are the same fact to
    # a visitor, and they are recorded as the same fact here.
    case $code in
      '' | 000) code='no connection' ;;
    esac

    printf '%s\t%s\n' "$elapsed" "$code" >> "$work/$(slug "$p")"
  done

  now=$(date +%s)
  elapsed=$(( now - start + 1 ))

  if [ -n "$seconds" ]; then
    # Counted, not clocked: --seconds N sends N requests per path. At one
    # request a second the two are the same number, and counting is the one that
    # stays true when a slow request stretches the run.
    [ "$tick" -lt "$seconds" ] || break
  else
    if [ -n "$seen_at" ] && [ "$(( now - seen_at ))" -ge "$TAIL_SEC" ]; then
      break
    fi
    if [ "$elapsed" -ge "$MAX_SEC" ]; then
      gave_up=1
      break
    fi
  fi

  # Aim at the next whole interval rather than sleeping a fixed amount, so a
  # slow request costs a gap in the numbers instead of shifting every sample
  # after it. `sleep 0` is not portable, hence the guard.
  target=$(( start + tick * INTERVAL_SEC ))
  now=$(date +%s)
  [ "$target" -gt "$now" ] && sleep "$(( target - now ))"
done

# ------------------------------------------------------------------ the table
#
# Runs of the same answer are collapsed into one row, which is the shape the
# drill's table already had in the runbook and in issue #143 — a row per second
# would bury a ten-second window in three hundred lines of `200`.
status=0
summary="$work/summary"
: > "$summary"

for p in $paths; do
  file="$work/$(slug "$p")"
  printf '\n%s\n' "$p"

  awk -F'\t' '
    function emit() {
      if (first == last) label = first; else label = first "–" last
      printf "  %-11s %s\n", label, answer
    }
    NR == 1 { first = $1; last = $1; answer = $2; next }
    $2 == answer { last = $1; next }
    { emit(); first = $1; last = $1; answer = $2 }
    END { if (NR > 0) emit() }
  ' "$file"

  # THE GAP LINE, and it is not decoration. A request that outlasts the interval
  # costs the seconds it ran through, and those seconds carry no sample at all.
  # Without this line a reader takes "10×404" for "ten seconds of 404" — and in
  # the first lab run the window was eleven seconds wide with three of them
  # unsampled. A count of samples and a length of time are two different
  # numbers, and publishing one as the other is invariant 1 from the inside.
  awk -F'\t' -v path="$p" '
    NR == 1 { first = $1 }
    { total++; last = $1; if (!($1 in secs)) { secs[$1]; distinct++ }
      if ($2 == "200") ok++; else bad[$2]++ }
    END {
      span = last - first + 1
      line = total " requests, " ok+0 "×200"
      for (a in bad) line = line ", " bad[a] "×" a
      # DISTINCT seconds, not the request count. After a request that outlasted
      # the interval the loop catches up, so two samples can land in one second
      # and the two numbers stop agreeing — which is precisely when the sentence
      # below is needed and a count-based test would have stayed silent.
      if (total > 0 && span > distinct)
        line = line " — over " span "s, " (span - distinct) "s of which carry no sample"
      print (ok == total && total > 0 ? "ok" : "bad") "\t" path "\t" line
    }
  ' "$file" >> "$summary"
done

printf '\n'
while IFS='	' read -r verdict path line; do
  if [ "$verdict" = 'ok' ]; then
    printf '  ✓ %s — %s\n' "$path" "$line"
  else
    printf '  ✗ %s — %s\n' "$path" "$line"
    status=1
  fi
done < "$summary"

# A run that sampled nothing is not a clean run. Without this the script would
# report success for a witness that never asked anything — the same comfortable
# lie deploy-gate.sh refuses to tell about a rollback, one instrument along.
if [ ! -s "$summary" ]; then
  printf '  ✗ nothing was measured\n'
  exit 1
fi

# THE RUN THAT MEASURED THE WRONG WINDOW, in the three shapes it comes in.
#
# All three end the same way — status 1 — because all three describe a table of
# samples that does not contain a deploy. Reporting "every answer was 200" over
# any of them would be a green tick above a measurement that did not take place,
# the same comfortable lie deploy-gate.sh refuses to tell about a rollback.
#
# They are told apart because the repair differs: wait longer, look at the
# pipeline, or start earlier next time. A single sentence covering all three
# would send a reader to the wrong one twice out of three times.
if [ -n "$gave_up" ]; then
  if [ -n "$until_sha" ] && [ "$first_sha" = "$until_sha" ] && [ -z "$restarted" ]; then
    printf '  ✗ sha %s was already answering when this run began, and nothing restarted\n' "$until_sha"
    printf '    this window is after the deploy, not around it — the site was up %ss ago\n' "$MAX_SEC"
    printf '    start the witness BEFORE the merge, with --until-restart\n'
  elif [ -n "$until_sha" ] && [ -z "$restarted" ] && [ -n "$first_start" ]; then
    printf '  ✗ %ss elapsed and sha %s never answered — this window is not the deploy\n' \
      "$MAX_SEC" "$until_sha"
  else
    printf '  ✗ %ss elapsed and no new process answered — this window is not the deploy\n' "$MAX_SEC"
    [ -z "$first_start" ] || printf '    still the process that started at %s\n' "$first_start"
  fi
  status=1
fi

if [ "$status" -eq 0 ]; then
  printf '\n  ✓ every answer was 200\n'
else
  printf '\n  ✗ this run does not show a clean deploy\n'
fi
exit "$status"
