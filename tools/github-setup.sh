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
# required_status_checks names the nine contexts that exist, and naming them is
# the whole of issue #29. Until E2 this was null, because a required check that
# does not exist blocks every merge rather than guarding one.
#
# Seven come from ci.yml, one from pr-title.yml. The remaining one, `CodeQL`, is
# posted by the code-scanning service and goes red when a pull request
# introduces a new alert — which is exactly what happened on #126 and cleared
# when the alert was dismissed with a reason. Without it the build plan's
# "Findings ≥ HIGH blockieren" would hold for every scanner except that one, and
# the last step would rest on somebody noticing a red tick. ADR 0026 already
# argued that discipline is the weaker instrument.
#
# `e2e` AND `title` WERE ADDED IN THE H9c TRIAGE, AND NEITHER WAS EVER REFUSED.
# This list was last touched in #130. `e2e` arrived with #269 and `title` with
# #345, and neither was named here or in the runbook — so unlike `quickstart`
# and `deploy` below, their absence was an omission rather than a decision.
#
# `title` is the one that had already cost something. The squash merge makes the
# PULL REQUEST TITLE the commit on main and tools/release.sh reads its type;
# .githooks/commit-msg guards the local messages the squash throws away. #338
# merged with no type, the pipeline stayed green because "no release due" is the
# right answer for a typeless merge, and v0.32.0 was never cut. The workflow
# that catches it has existed since #345 and was an indicator until this line.
#
# `e2e` is the longer argument and the cheaper one to state: it is the only job
# that renders the site and clicks it, 2091 assertions over seven widths. It ran
# on every pull request already and merging without it was a matter of
# remembering. A gate nobody can forget costs 16-18 minutes.
#
# THE NAMES ARE THE CHECK-RUN NAMES, ASKED FOR RATHER THAN DERIVED —
# `gh api repos/OWNER/REPO/commits/SHA/check-runs --jq '.check_runs[].name'`.
# A job in a second workflow is still just its job name here: `title`, not
# `pr-title / title`, whatever the web interface renders beside it.
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
      "e2e",
      "images",
      "scan",
      "codeql (go)",
      "codeql (javascript-typescript)",
      "CodeQL",
      "title"
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
echo "  ✓ PR required, nine checks required, no force push, linear history, admins included"

echo ""
echo "Verify:"
echo "  gh api repos/$REPO/branches/main/protection | jq '{enforce_admins, allow_force_pushes}'"
