#!/bin/sh
# What this build calls itself, and the one rule behind it.
#
#   version.sh [repo-root]     default: .
#
# **Only release tags name a version.** `--match 'v*'` is the whole fix, and it
# exists because the alternative published a falsehood: with a plain
# `git describe --tags`, /api/health answered
#
#     "version": "backup/pre-rewrite-2026-08-17-22-g3890180"
#
# for as long as that image ran. The site's first rule is that every claim is
# tied to evidence; announcing the name of a backup tag from a history rewrite
# as your version is not a formatting problem, it is a false claim about which
# code is running. Issue #112.
#
# The value reaches three places, which is why it is worth a file of its own:
# -ldflags -X into internal/buildinfo and therefore /api/health, and the
# org.opencontainers.image.version label on both images — which E3 reads into
# the SBOM and then signs. A signature is an assertion that the label is true.
#
# **The backup tag stays.** It is the safety net of the 2026-08-17 rewrite and
# it lives only on this machine — GitHub has no tags at all, which is also how
# the wrong version got into production: that image was built locally, not by
# the pipeline. Deleting a backup ref to fix a string would be the wrong trade;
# with --match it cannot interfere.
#
# Falling back to the short sha is deliberate rather than a defeat. Until
# release-please starts tagging in E5 there IS no release number, and a commit
# is the honest answer to "which code is this" — the same reasoning
# internal/buildinfo gives for answering "dev" when nothing stamped it.
#
# CHECK_VERSION_DIR overrides the repository — the seam tools/selftest.sh needs
# to point this at a throwaway repository instead of the real one, the same way
# CHECK_TIDY_DIR and CHECK_STACK_API_DIR work.
set -eu

dir=${CHECK_VERSION_DIR:-${1:-.}}

# --dirty says out loud that the build is not the commit it names, which is the
# same claim internal/buildinfo makes about a build from a working tree.
(cd "$dir" 2>/dev/null && git describe --tags --always --dirty --match 'v*' 2>/dev/null) || echo dev
