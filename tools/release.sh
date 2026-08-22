#!/bin/sh
# What this repository calls its next release, and when it has none.
#
#   release.sh --next      the next version, or nothing at all
#   release.sh --notes     the release body, built from the commits
#   release.sh --tag       create the annotated tag HERE, locally
#   release.sh --publish   push that tag and open the GitHub release
#
# WHY THIS FILE EXISTS AND release-please DOES NOT
#
# The build plan (§5.4) names release-please. It works through a RELEASE PULL
# REQUEST, and that is where it stops working here: a pull request opened by the
# built-in GITHUB_TOKEN triggers no `pull_request` workflows — GitHub's own
# recursion guard — so not one of the seven required contexts in
# tools/github-setup.sh ever reports, and `enforce_admins: true` means the
# release pull request can never be merged.
#
# The ways around that are a GitHub App or a personal access token: another
# long-lived credential allowed to write to this repository. Four days after a
# token was leaked into a terminal, that is the wrong thing to add. So the
# release is a TAG and a GitHub release, made by the job that already builds and
# signs the artefact, and the changelog is the release body rather than a file.
# ADR 0036 carries the trade, including what it costs.
#
# THE RULES, AND THEY ARE THE WHOLE FILE
#
#   feat: · feat!: · BREAKING CHANGE:   minor
#   fix: · perf:                        patch
#   docs chore ci test refactor style build revert    NO release
#   no v* tag yet                       v0.1.0
#
# **A breaking change is a MINOR bump, and that is not a bug.** While the major
# version is 0, semver promises no stability — 0.y.z is allowed to break. Going
# to v1.0.0 is the statement "the public interface holds", and the launch makes
# that statement, not a commit. CONTRIBUTING.md says the same where a
# contributor will read it.
#
# **Only v* tags are ever read.** `--match 'v*'` for the same reason
# tools/version.sh has it: with a plain `git describe --tags` this repository
# once published
#
#     "version": "backup/pre-rewrite-2026-08-17-22-g3890180"
#
# on /api/health for as long as that image ran. Announcing the name of a backup
# tag as a version is not a formatting problem, it is a false claim about which
# code is running. Issue #112.
#
# RELEASE_DIR overrides the repository — the seam tools/selftest.sh needs to
# point this at a throwaway repository, the same way CHECK_VERSION_DIR does.
set -eu

dir=${RELEASE_DIR:-.}

usage() {
  printf 'usage: release.sh --next | --notes | --tag | --publish\n' >&2
  exit 1
}

[ $# -eq 1 ] || usage

cd "$dir" 2>/dev/null || { printf '  ✗ %s is not a directory\n' "$dir" >&2; exit 1; }
git rev-parse --git-dir >/dev/null 2>&1 || { printf '  ✗ %s is not a git repository\n' "$dir" >&2; exit 1; }

# The last release, or nothing. --abbrev=0 asks for the tag itself rather than a
# description of the distance to it.
last=$(git describe --tags --abbrev=0 --match 'v*' 2>/dev/null || true)
range=${last:+$last..HEAD}

# One line per commit, subject and body kept apart, because BREAKING CHANGE is a
# body footer while `!` is part of the subject and both mean the same thing.
#
# The range is an argument rather than the global, and that is a repair: --publish
# runs AFTER --tag in the same job, so by then `git describe` answers the tag that
# was just created and `$range` would be `vX.Y.Z..HEAD` — empty. The release body
# would have been blank on the first real release and on every one after it.
commits() { # commits <range>
  # shellcheck disable=SC2086
  git log $1 --no-merges --format='%s%x1f%b%x1e' 2>/dev/null || true
}

# bump prints major, minor, patch — or nothing, which is a decision and not a
# failure: a branch of documentation and chores has produced no release, and
# saying so is the point.
#
# THREE FLAGS AND ONE DECISION AT THE END, not a running verdict. The first
# version kept a single variable and only overwrote it when it was still empty,
# so a `fix:` early in the range locked the answer to `patch` and a `feat:`
# after it changed nothing. A release that silently understates what is in it is
# worse than no release.
bump() {
  commits "$range" | awk -v RS='\036' -v FS='\037' '
    NF == 0 { next }
    {
      subject = $1; body = $2
      sub(/^[[:space:]]+/, "", subject)

      # type(scope)!: description — the ! and the footer say the same thing.
      if ((subject ~ /^[a-zA-Z]+(\([^)]*\))?!:/) || (body ~ /BREAKING[ -]CHANGE/)) breaking = 1

      type = subject
      sub(/[(!:].*$/, "", type)

      if (type == "feat") feat = 1
      else if (type == "fix" || type == "perf") fix = 1
      # Everything else is deliberately silent, and a commit with no
      # conventional prefix lands here too — ignored rather than guessed at.
    }
    END {
      if (breaking) print "major"
      else if (feat) print "minor"
      else if (fix) print "patch"
    }
  '
}

next_version() {
  kind=$(bump)
  [ -n "$kind" ] || return 0

  if [ -z "$last" ]; then
    # The first release of a repository that has never had one. v0.1.0 and not
    # v1.0.0: see the header.
    printf 'v0.1.0\n'
    return 0
  fi

  n=${last#v}
  major=${n%%.*}
  rest=${n#*.}
  minor=${rest%%.*}
  patch=${rest#*.}
  # A tag like v1.2.3-rc1 is not something this repository makes; refuse rather
  # than compute a version out of something unexpected.
  case $major$minor$patch in
    *[!0-9]*) printf '  ✗ the last tag %s is not vMAJOR.MINOR.PATCH\n' "$last" >&2; exit 1 ;;
  esac

  # THE ZERO RULE. While the major version is 0, semver promises nothing about
  # stability, so a breaking change is a minor bump rather than v1.0.0. Going to
  # 1.0.0 is the statement "the public interface holds" and belongs to the
  # launch, not to whichever commit happened to break something first.
  if [ "$kind" = major ] && [ "$major" = 0 ]; then
    kind=minor
  fi

  case $kind in
    major) printf 'v%s.0.0\n' "$((major + 1))" ;;
    minor) printf 'v%s.%s.0\n' "$major" "$((minor + 1))" ;;
    patch) printf 'v%s.%s.%s\n' "$major" "$minor" "$((patch + 1))" ;;
  esac
}

notes() { # notes <range> <previous-tag-or-empty>
  printf '## What changed\n\n'
  commits "$1" | awk -v RS='\036' -v FS='\037' '
    NF == 0 { next }
    {
      subject = $1
      sub(/^[[:space:]]+/, "", subject)
      type = subject; sub(/[(!:].*$/, "", type)
      text = subject; sub(/^[a-zA-Z]+(\([^)]*\))?!?:[[:space:]]*/, "", text)
      if (type == "feat")                        feats = feats "- " text "\n"
      else if (type == "fix" || type == "perf")  fixes = fixes "- " text "\n"
      else                                       rest  = rest  "- " subject "\n"
    }
    END {
      if (feats) printf "### Features\n\n%s\n", feats
      if (fixes) printf "### Fixes\n\n%s\n", fixes
      if (rest)  printf "### Everything else\n\n%s\n", rest
    }
  '
  if [ -n "$2" ]; then
    printf '\nSince %s.\n' "$2"
  else
    printf '\nThe first release.\n'
  fi
}

case $1 in
  --next)
    next_version
    ;;

  --notes)
    notes "$range" "$last"
    ;;

  --tag)
    # LOCAL only, and deliberately: the tag has to exist before `make images`
    # runs, so that git describe stamps the release number into the binary and
    # into org.opencontainers.image.version. Publishing it is a separate mode
    # that runs after the artefact has been built, scanned and signed — nothing
    # is named in public before the thing it names exists.
    v=$(next_version)
    [ -n "$v" ] || { printf '  · no release due — nothing in these commits asks for one\n' >&2; exit 0; }
    if git rev-parse -q --verify "refs/tags/$v" >/dev/null; then
      printf '  ! %s already exists here\n' "$v" >&2
      exit 0
    fi

    # WHO TAGS, and why it is asked at all.
    #
    # An annotated tag carries a tagger, and `git tag -a` refuses to invent one:
    # on a runner with no git identity it stops with `fatal: empty ident name`.
    # That is not a hypothetical — it is how the first real run of this job
    # ended, before a single image was built.
    #
    # NOT a bot account and not a tool name. CLAUDE.md is explicit that no model
    # or tool name appears in commits, pull requests, issues, TAGS or release
    # notes. So the tag is made by whoever authored the commit it names: the
    # honest answer, and one that needs no value written into this file to rot
    # there. On main that is the author of the squash commit.
    who_name=$(git log -1 --format='%an')
    who_mail=$(git log -1 --format='%ae')
    [ -n "$who_name" ] || { printf '  ✗ the commit being tagged has no author\n' >&2; exit 1; }

    git -c user.name="$who_name" -c user.email="$who_mail" tag -a "$v" -m "$v"
    printf '  ✓ tagged %s locally as %s — not pushed\n' "$v" "$who_name" >&2
    ;;

  --publish)
    v=$(git describe --tags --exact-match --match 'v*' 2>/dev/null || true)
    [ -n "$v" ] || { printf '  · HEAD carries no release tag — nothing to publish\n' >&2; exit 0; }
    command -v gh >/dev/null 2>&1 || { printf '  ✗ gh is not available\n' >&2; exit 1; }

    git push origin "refs/tags/$v"
    printf '  ✓ pushed %s\n' "$v" >&2

    # The range ends at the tag and starts at the one before it — NOT at
    # whatever `git describe` answers now, which is this tag itself.
    previous=$(git describe --tags --abbrev=0 --match 'v*' "$v^" 2>/dev/null || true)
    notes "${previous:+$previous..}$v" "$previous" \
      | gh release create "$v" --title "$v" --notes-file -
    printf '  ✓ release %s is public\n' "$v" >&2
    ;;

  *) usage ;;
esac
