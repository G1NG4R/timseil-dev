#!/bin/sh
# Tests the checks and hooks against broken input — a gate that only ever sees
# good input is not known to be a gate.
#
# Runs in a throwaway repository so nothing here can touch the real tree.
set -eu

root=$(git rev-parse --show-toplevel)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT INT TERM

fail=0
ok() { printf '  ✓ %s\n' "$1"; }
no() { printf '  ✗ %s\n' "$1"; fail=1; }

# Expect a command to fail (the broken case) or to succeed (the good case).
rejects() { desc=$1; shift; if "$@" >/dev/null 2>&1; then no "$desc (accepted, should reject)"; else ok "$desc"; fi; }
accepts() { desc=$1; shift; if "$@" >/dev/null 2>&1; then ok "$desc"; else no "$desc (rejected, should accept)"; fi; }

mkdir -p "$tmp/tools" "$tmp/.githooks"
cp "$root/tools/check-repo.sh" "$root/tools/check-todo.sh" "$tmp/tools/"
cp "$root/.githooks/pre-commit" "$root/.githooks/commit-msg" "$root/.githooks/pre-push" "$tmp/.githooks/"
cp "$root/Makefile" "$tmp/"

cd "$tmp"
git init -q -b main .
git config user.email selftest@localhost
git config user.name selftest
git config commit.gpgsign false
git config core.hooksPath .githooks
git add -A >/dev/null

printf 'hygiene\n'
printf 'clean line\n' > clean.txt
git add clean.txt
accepts "clean file passes" tools/check-repo.sh --staged

printf 'trailing space \n' > ws.txt
git add ws.txt
rejects "trailing whitespace rejected" tools/check-repo.sh --staged
git rm -q --cached ws.txt && rm ws.txt

printf 'crlf line\r\n' > crlf.txt
git add crlf.txt
rejects "CRLF rejected" tools/check-repo.sh --staged
git rm -q --cached crlf.txt && rm crlf.txt

printf 'no newline' > eof.txt
git add eof.txt
rejects "missing final newline rejected" tools/check-repo.sh --staged
git rm -q --cached eof.txt && rm eof.txt

# Markdown keeps trailing spaces on purpose (hard line break).
printf 'line with break  \n' > doc.md
git add doc.md
accepts "markdown keeps its trailing spaces" tools/check-repo.sh --staged
git rm -q --cached doc.md && rm doc.md

git config --unset core.hooksPath
rejects "unset core.hooksPath rejected" tools/check-repo.sh --staged
git config core.hooksPath .githooks

printf 'markers\n'
printf 'x = 1  # %s: later\n' "TO""DO" > bare.py
git add bare.py
rejects "bare marker rejected" tools/check-todo.sh
git rm -q --cached bare.py && rm bare.py

printf 'x = 1  # %s(#42): tracked\n' "TO""DO" > tracked.py
git add tracked.py
accepts "marker with issue accepted" tools/check-todo.sh
git rm -q --cached tracked.py && rm tracked.py

printf 'the rule says no %ss without an issue\n' "TO""DO" > prose.txt
git add prose.txt
accepts "prose naming the rule accepted" tools/check-todo.sh
git rm -q --cached prose.txt && rm prose.txt

printf 'commit-msg\n'
write_msg() { printf '%s\n' "$1" > msg; }
write_msg "kaputte nachricht"                 && rejects "non-conventional subject rejected" .githooks/commit-msg msg
write_msg "feat: add thing"                   && accepts "conventional subject accepted"     .githooks/commit-msg msg
write_msg "feat(api)!: breaking change"       && accepts "scope and bang accepted"            .githooks/commit-msg msg
write_msg "wip: something"                    && rejects "unknown type rejected"             .githooks/commit-msg msg
write_msg "feat: $(printf 'a%.0s' $(seq 80))" && rejects "subject over 72 chars rejected"     .githooks/commit-msg msg
write_msg "Merge branch main"                 && accepts "merge commit passes through"       .githooks/commit-msg msg

printf 'pre-push\n'
push_ref() { printf 'refs/heads/%s abc refs/heads/%s def\n' "$1" "$1" | .githooks/pre-push origin url; }
rejects "push to main blocked"     push_ref main
accepts "push to phase branch ok"  push_ref phase/x1-example
accepts "push to ops-data ok"      push_ref ops-data

printf 'pre-commit hook\n'
printf 'bad \n' > hookws.txt
git add hookws.txt
rejects "pre-commit blocks dirty staged file" .githooks/pre-commit
git rm -q --cached hookws.txt && rm hookws.txt
accepts "pre-commit passes clean index" .githooks/pre-commit

if [ "$fail" -ne 0 ]; then
  printf '\n✗ selftest failed\n'
  exit 1
fi
printf '  ✓ all gates reject their broken case\n'
