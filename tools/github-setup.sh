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
# required_status_checks names the seven contexts that exist, and naming them is
# the whole of issue #29. Until E2 this was null, because a required check that
# does not exist blocks every merge rather than guarding one.
#
# Six come from ci.yml. The seventh, `CodeQL`, is posted by the code-scanning
# service and goes red when a pull request introduces a new alert — which is
# exactly what happened on #126 and cleared when the alert was dismissed with a
# reason. Without it the build plan's "Findings ≥ HIGH blockieren" would hold
# for every scanner except that one, and the last step would rest on somebody
# noticing a red tick. ADR 0026 already argued that discipline is the weaker
# instrument.
#
# `quickstart` is deliberately NOT in the list. It does not run on pull
# requests (ci.yml says why), so requiring it would name a context that never
# reports and lock main permanently.
#
# strict: false — "branch must be up to date" would send every open pull request
# back for a rebase on each merge, and required_linear_history already forbids
# the merge commits that setting exists to prevent.
#
# **If a required context ever stops reporting, main is locked and
# enforce_admins keeps you out of it too.** The way back is to set
# enforce_admins to false for as long as it takes to fix the workflow, then
# turn it on again — docs/runbooks/github.md.
#
# enforce_admins: true applies the rule to you as well. That is the point of a
# lock — but it means every change to main goes through a PR, without exception.
#
# required_approving_review_count: 0 — a solo maintainer cannot approve their own
# PR. The PR is still mandatory; only the second pair of eyes is not.
echo "→ $REPO: branch protection on main"
gh api -X PUT "repos/$REPO/branches/main/protection" --input - >/dev/null <<'JSON'
{
  "required_status_checks": {
    "strict": false,
    "contexts": [
      "check",
      "db",
      "images",
      "scan",
      "codeql (go)",
      "codeql (javascript-typescript)",
      "CodeQL"
    ]
  },
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
echo "  ✓ PR required, seven checks required, no force push, linear history, admins included"

echo ""
echo "Verify:"
echo "  gh api repos/$REPO/branches/main/protection | jq '{enforce_admins, allow_force_pushes}'"
