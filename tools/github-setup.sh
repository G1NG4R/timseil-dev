#!/bin/sh
# Repository settings that live on GitHub, not in the tree — kept here so they
# are reviewable and repeatable instead of clicked once and forgotten.
#
# Run it yourself:  sh tools/github-setup.sh
# It is idempotent; running it twice changes nothing.
set -eu

REPO=${REPO:-G1NG4R/timseil-dev}

command -v gh >/dev/null || { echo "✗ gh is not installed."; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "✗ gh is not authenticated — run: gh auth login"; exit 1; }

echo "→ $REPO: merge strategy"
gh api -X PATCH "repos/$REPO" \
  -F allow_squash_merge=true \
  -F allow_merge_commit=false \
  -F allow_rebase_merge=false \
  -F delete_branch_on_merge=true \
  -f squash_merge_commit_title=PR_TITLE \
  -f squash_merge_commit_message=PR_BODY \
  >/dev/null
echo "  ✓ squash only, PR title becomes the commit, branch deleted on merge"

# One phase = one branch = one PR = one squash merge = one deploy.
#
# required_status_checks is null on purpose: there is no CI until phase E1, and
# naming a check that does not exist would block every merge. E1 replaces this
# block with the real contexts — the reminder sits in backlog.md.
#
# enforce_admins: true applies the rule to you as well. That is the point of a
# lock — but it means every change to main goes through a PR, without exception.
#
# required_approving_review_count: 0 — a solo maintainer cannot approve their own
# PR. The PR is still mandatory; only the second pair of eyes is not.
echo "→ $REPO: branch protection on main"
gh api -X PUT "repos/$REPO/branches/main/protection" --input - >/dev/null <<'JSON'
{
  "required_status_checks": null,
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 0
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_linear_history": true,
  "required_conversation_resolution": true
}
JSON
echo "  ✓ PR required, no force push, no deletion, linear history, admins included"

echo ""
echo "Verify:"
echo "  gh api repos/$REPO/branches/main/protection | jq '{enforce_admins, allow_force_pushes}'"
