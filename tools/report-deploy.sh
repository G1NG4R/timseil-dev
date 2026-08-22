#!/bin/sh
# The pipeline tells the site how long it took.
#
#   report-deploy.sh <sha7> <duration-sec> <ok|rollback> [base-url]
#
# This is the reason POST /api/internal/deploy exists, and it is the reason the
# duration on the case study is allowed to call itself measured. Invariant 1:
# a number that no running system produced does not go on the page. Until this
# script ran for the first time, `ops.lastDeploy` on /api/health was null and
# the site said `— NO DATA`, which was correct.
#
# WHICH DURATION. The whole run, from the push that started it to the verify
# that ended it — the seven steps the case study labels `BUILD + DEPLOY`, not
# the seconds `docker compose up` spent. The caller measures it against the
# workflow run's own start time (`run_started_at` from the Actions API) rather
# than against a `date` taken when this job happened to begin, because the job
# begins after `check`, `db` and `publish` have already run and their minutes
# are part of what a reader is being told.
#
# THE TOKEN NEVER APPEARS IN argv. curl reads its configuration from stdin, so
# INTERNAL_DEPLOY_TOKEN is not visible in `ps` and cannot be picked out of a
# process listing on a machine somebody else is also on. On a throwaway runner
# that is close to free; on a laptop, which is the other place this target is
# meant to be runnable from, it is not.
#
# WHAT IT DOES NOT DO is decide anything. It reports what happened, including
# that a rollback happened. A drill that scrubs its own rollback row out of the
# data did not take place — the row is the evidence.
set -eu

sha=${1:?usage: report-deploy.sh <sha7> <duration-sec> <ok|rollback> [base-url]}
seconds=${2:?usage: report-deploy.sh <sha7> <duration-sec> <ok|rollback> [base-url]}
result=${3:?usage: report-deploy.sh <sha7> <duration-sec> <ok|rollback> [base-url]}
base=${4:-${VERIFY_BASE_URL:-https://timseil.dev}}

command -v curl >/dev/null 2>&1 || { printf '  ✗ curl is not available\n'; exit 1; }

# Every rule below is restated from api/internal/intake/validate.go rather than
# discovered by sending a bad document and reading the 400. The endpoint answers
# with one entry per rejected field, which is a good answer to get in a log and
# a bad one to build a pipeline on: a report that failed validation is a number
# that silently never arrived.
case $sha in
  *[!0-9a-f]* | '') printf '  ✗ sha %s is not lowercase hexadecimal\n' "$sha"; exit 1 ;;
esac
[ "${#sha}" -ge 7 ] && [ "${#sha}" -le 40 ] || {
  printf '  ✗ sha must be 7 to 40 characters — got %s\n' "${#sha}"; exit 1; }

case $seconds in
  '' | *[!0-9]*) printf '  ✗ duration must be a whole number of seconds — got %s\n' "$seconds"; exit 1 ;;
esac
[ "$seconds" -le 2147483647 ] || { printf '  ✗ duration is larger than the column can hold\n'; exit 1; }

case $result in
  ok | rollback) ;;
  *) printf '  ✗ result must be ok or rollback — got %s\n' "$result"; exit 1 ;;
esac

: "${INTERNAL_DEPLOY_TOKEN:?INTERNAL_DEPLOY_TOKEN is not set}"

# The endpoint accepts an instant up to two minutes ahead of its own clock and
# refuses anything older than ninety days (validate.go, maxSkewAhead/maxAge).
# `date -u` here rather than letting the API stamp it, because the report can
# arrive after a sixty-second verify and a rollback, and the interesting instant
# is when the deploy finished, not when the request landed.
at=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

printf 'report %s %s in %ss\n' "$result" "$sha" "$seconds"

# The body goes through a FILE, not through the config value.
#
# A curl config value that begins with a double quote is parsed as a quoted
# string, and the first unescaped quote inside it ends the value. A JSON
# document is nothing but quotes, so `data = "{"sha":"…"}"` reaches the server
# as `{` — a 400 for a report that was perfectly well formed when this script
# built it. `data = "@file"` sidesteps the parsing rules entirely.
#
# umask before the file exists, so it is never briefly world-readable. Nothing
# secret is in the body, but the same file is next to a config that carries the
# token, and one rule for both is one rule to get right.
umask 077
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT INT TERM

printf '{"sha":"%s","durationSec":%s,"result":"%s","at":"%s"}' \
  "$sha" "$seconds" "$result" "$at" > "$work/body.json"

# --config -, so the Authorization header is read from stdin and the token is
# never in argv. -o /dev/null because the endpoint answers 204 and any body it
# did send is a problem report we want the status code for, not the prose.
code=$(printf '%s\n' \
  "url = \"$base/api/internal/deploy\"" \
  'request = "POST"' \
  "header = \"Authorization: Bearer $INTERNAL_DEPLOY_TOKEN\"" \
  'header = "Content-Type: application/json"' \
  "data = \"@$work/body.json\"" \
  | curl -sS --max-time 10 -o /dev/null -w '%{http_code}' --config - 2>/dev/null) || code='000'

[ "$code" = "204" ] || {
  printf '  ✗ the endpoint answered %s, not 204\n' "$code"
  case $code in
    401) printf '    the token is wrong — INTERNAL_DEPLOY_TOKEN must match the value in Dokploy\n' ;;
    404) printf '    the path is blocked or the api is not up; from outside the proxy this is what L3 will look like\n' ;;
    400) printf '    the document did not validate — the checks above missed a rule, fix them here\n' ;;
    000) printf '    no answer at all: %s was not reachable\n' "$base" ;;
  esac
  exit 1
}

# Worded by result, because they are different facts. On `ok` the reported sha
# is what is running; on `rollback` it is the build that was attempted and is
# emphatically NOT running — saying otherwise here would be a line somebody
# reads at three in the morning and believes.
case $result in
  ok)       printf '  ✓ 204 — %s is now the last deploy on /api/health\n' "$sha" ;;
  rollback) printf '  ✓ 204 — the failed deploy of %s is on the record\n' "$sha" ;;
esac
