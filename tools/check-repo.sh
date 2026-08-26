#!/bin/sh
# Repository hygiene: line endings, trailing whitespace, final newline, hooks,
# and since F3 one more: a shell script has to parse.
# Runs on tracked files only — never on untracked scratch or ignored output.
#
#   check-repo.sh            all tracked files
#   check-repo.sh --staged   only staged files (what the pre-commit hook calls)
set -eu

mode=${1:-}
fail=0

note() { printf '  %s\n' "$1"; }
bad() { printf '  ✗ %s: %s\n' "$1" "$2"; fail=1; }

if [ "$mode" = "--staged" ]; then
  files=$(git diff --cached --name-only --diff-filter=ACM)
else
  files=$(git ls-files)
fi

# docs/design/ is the imported handoff — read-only, not ours to reformat.
# INDEX.md is the exception: we write it, so it is held to the same hygiene.
# Binary formats have no line endings to check.
skip() {
  case "$1" in
    docs/design/INDEX.md) return 1 ;;
    docs/design/*) return 0 ;;
    *.pdf | *.png | *.jpg | *.jpeg | *.gif | *.webp | *.ico) return 0 ;;
    *.woff | *.woff2 | *.ttf | *.otf | *.zip | *.gz) return 0 ;;
  esac
  return 1
}

for f in $files; do
  skip "$f" && continue
  [ -f "$f" ] || continue

  # A SHELL SCRIPT HAS TO PARSE, and this rule has an incident behind it rather
  # than a good intention — twice in one session, F3, 2026-08-25.
  #
  # Several checks in tools/ embed an awk or python program inside a
  # single-quoted shell string. Put an apostrophe in a COMMENT inside such a
  # program and it closes the string: the rest of the program becomes shell,
  # and the file stops parsing. Both times the offending word was an English
  # possessive in a comment nobody would read twice.
  #
  # Why the existing gates do not catch it: tools/selftest.sh RUNS most of these
  # scripts, so a syntax error there is loud. It cannot run the ones that need
  # Docker and a live stack — check-observability.sh above all — and that is
  # exactly where the second one happened. `sh -n` costs nothing and covers the
  # gap.
  case "$f" in
    *.sh)
      sh -n "$f" 2>/dev/null || bad "$f" "does not parse — sh -n rejects it"
      ;;
  esac

  if LC_ALL=C grep -q "$(printf '\r')" "$f" 2>/dev/null; then
    bad "$f" "CRLF line endings (.editorconfig says lf)"
  fi

  # Markdown keeps trailing spaces: two of them are a hard line break.
  case "$f" in
  *.md) ;;
  *)
    if grep -nE '[ 	]+$' "$f" >/dev/null 2>&1; then
      lines=$(grep -nE '[ 	]+$' "$f" | cut -d: -f1 | tr '\n' ',' | sed 's/,$//')
      bad "$f" "trailing whitespace on line(s) $lines"
    fi
    ;;
  esac

  if [ -s "$f" ] && [ "$(tail -c 1 "$f" | od -An -c | tr -d ' ')" != "\n" ]; then
    bad "$f" "no newline at end of file"
  fi
done

# backlog.local.md must never be tracked.
#
# .gitignore already covers it, and .gitignore is exactly the kind of protection
# that stops working the moment somebody runs `git add -f` or reaches for it
# from an editor that knows better. The file holds what a stranger could use
# against this host, so the rule gets a check rather than a convention — and the
# check runs on `git ls-files`, which answers the only question that matters:
# is it IN the repository, whatever the ignore rules say.
if git ls-files --error-unmatch backlog.local.md >/dev/null 2>&1; then
  bad "backlog.local.md" "is tracked — it holds operational detail that must not be public. run: git rm --cached backlog.local.md"
fi

# Hooks are the local half of the two gates from build-plan 8.4. A fresh clone
# has core.hooksPath unset — then nothing here fires and nobody notices.
hookspath=$(git config --get core.hooksPath || echo "")
if [ "$hookspath" != ".githooks" ]; then
  bad "git config" "core.hooksPath is '${hookspath:-unset}', expected .githooks — run: git config core.hooksPath .githooks"
fi

for h in .githooks/*; do
  [ -f "$h" ] || continue
  [ -x "$h" ] || bad "$h" "not executable — run: chmod +x $h"
done

if [ "$fail" -eq 0 ]; then
  note "✓ repo hygiene"
fi
exit "$fail"
