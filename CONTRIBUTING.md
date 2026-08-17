# Contributing

This is a single-person portfolio project. **Feature pull requests are not
accepted** — the content is a personal record, and the build follows a fixed
plan in `docs/build-plan.md`.

That said, three things are genuinely welcome:

- **A wrong number.** The site's whole argument is that its claims are checkable.
  If you check one and it does not hold, that is the most useful thing you can
  send.
- **A bug**, in the site or in this repository.
- **A security issue** — please use [SECURITY.md](SECURITY.md), not a public
  issue.

## Working on a clone

```bash
git config core.hooksPath .githooks
make check
```

**The first command is not optional.** Git does not carry hook configuration
across a clone, so without it the commit and push hooks are inert. `make check`
fails on purpose until it is set — a hook that silently does nothing is worse
than no hook.

What the hooks do:

| Hook | Guards |
|---|---|
| `pre-commit` | line endings, trailing whitespace, final newline on staged files |
| `commit-msg` | Conventional Commits, subject ≤ 72 characters |
| `pre-push` | refuses a direct push to `main` |

Branch protection on `main` enforces the same rule server-side: pull request
required, no force push, no deletion, linear history, admins included. The hook
is the fast feedback; the protection is the lock.

## Branches and commits

One phase = one branch = one pull request = one squash merge = one deploy.

| Prefix | For | Example |
|---|---|---|
| `phase/` | a phase from the build plan | `phase/c3-training-endpoint` |
| `fix/` | a bug found while building or in production | `fix/terminal-crlf` |
| `chore/` | dependencies, configuration, cleanup | `chore/bump-go-1.26.5` |

Commits follow [Conventional Commits](https://www.conventionalcommits.org/).
**The pull request title becomes the commit on `main`**, because merges are
squash-only — so write the title as the commit you want in the history.

There is no `dev` branch. It would cost two pull requests per change and buy
nothing that the phase branch does not already provide. If a staging environment
ever exists, `dev` comes back and points at it; until then it would point at
nothing.

## Definition of done

A change is done when all of these hold:

- [ ] `make check` is green
- [ ] `make check-db` is green, if the change touches `api/migrations/`. It
      needs Docker and is therefore not part of `make check`; CI picks it up in
      E1, and until then it is a manual step that has to be stated in the PR
- [ ] there is a test for the **broken** case, not only the happy path
- [ ] a contract test exists, if the change adds an endpoint
- [ ] `docker compose up` ran from zero (from phase A4 onwards)
- [ ] no `TODO` without an issue reference — `TODO(#42):` passes, `TODO:` does not
- [ ] documentation updated: ADR, runbook or README
- [ ] `backlog.md` updated

The pull request template asks for exactly this list, plus which of the nine
invariants the change touches. Those invariants are in `CLAUDE.md`; the short
version is in the [README](README.md#the-one-rule).

## Language

Code, comments, commit messages, branch names and user-facing text are English.
`docs/` and `CLAUDE.md` are German — they are working documents for the author.
Files in the repository root are English, because their reader arrives from
outside.

## What not to change

- **`docs/design/`** — an imported design handoff, read-only. `INDEX.md` is the
  one file in there that is ours.
- **`tokens.css`** — no colour, radius or duration lives outside it.
- **`contract/openapi.yaml`** is the source of truth. If a type does not fit, the
  contract is wrong; do not hand-write the type.
- **Anything `make gen` writes** — `api/internal/httpx/gen.go`,
  `web/lib/api/schema.d.ts`, `contract/openapi.public.yaml` and the copy embedded in
  the API. Change the contract, run `make gen`, commit the result. `make check`
  compares the two and fails when they differ.
- **`api/internal/httpx/assets/scalar.standalone.js.gz`** — a vendored build of
  `@scalar/api-reference`. To update it, follow the recipe in the comment at the top
  of `api/internal/httpx/docs.go`; do not edit it in place.

Marking an endpoint `x-internal: true` keeps it out of `/api/docs`. It does not
protect it — the token check and the reverse-proxy block do. `make check` fails if a
marked operation declares no security scheme, so the two cannot come apart.
