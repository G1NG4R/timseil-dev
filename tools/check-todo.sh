#!/bin/sh
# Definition of Done: no TODOs without an issue. A marker with a number is
# tracked work; a bare one is a note nobody will ever read again.
#
# Accepted:  TODO(#42): ...   FIXME(#42) ...
# Rejected:  TODO: ...        FIXME(later)
#
# A marker is the word followed by ':' or '(' — that is how one is written in
# code. Prose that merely names the rule ("no TODOs without an issue") is not a
# marker and must not trip the check, or the rule cannot be written down.
set -eu

# Assembled from halves so this file does not match its own pattern.
marker="(TO""DO|FIX""ME)[:(]"

# Excluded on purpose:
#   docs/design/ imported handoff — read-only, not ours
#   backlog.md   the notepad — holding undecided notes is exactly its job
hits=$(git grep -n -E "$marker" \
  -- ':(exclude)docs/design' ':(exclude)backlog.md' ':(exclude)tools/check-todo.sh' 2>/dev/null || true)

# Keep only the ones without an issue reference.
bare=$(printf '%s\n' "$hits" | grep -E '#[0-9]+' -v | sed '/^$/d' || true)

if [ -n "$bare" ]; then
  printf '  ✗ marker without issue reference:\n'
  printf '%s\n' "$bare" | sed 's/^/    /'
  printf '    → open an issue and use the form MARKER(#123), or delete the line.\n'
  exit 1
fi

printf '  ✓ no untracked markers\n'
