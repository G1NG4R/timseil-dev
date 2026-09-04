.DEFAULT_GOAL := help
SHELL := /bin/sh

# Targets carry the phase that fills them. A placeholder says so out loud
# instead of exiting green and pretending it checked something.

.PHONY: help
help: ## Show this list
	@printf 'timseil.dev — make targets\n\n'
	@grep -hE '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'
	@printf '\n'

# ---------------------------------------------------------------- check

.PHONY: check
check: check-tools check-node check-versions check-pins check-env check-adrs check-readme check-repo check-todo check-compose check-rollout check-dockerfiles check-migrations check-stack check-probe-cadence check-rule-names check-tokens check-go check-lint check-web check-contract ## Run every check that applies today
	@printf '\n✓ make check\n'

.PHONY: check-fast
check-fast: ## Hygiene on staged files only (called by the pre-commit hook)
	@tools/check-repo.sh --staged

.PHONY: check-tools
check-tools: ## Prove the checks and hooks still reject their broken case
	@printf 'tools\n'
	@tools/selftest.sh

.PHONY: check-node
check-node: ## The running Node major must match .nvmrc
	@printf 'node\n'
	@tools/check-node.sh

.PHONY: check-versions
check-versions: ## The declared Node and Go versions match the images that build them
	@printf 'versions\n'
	@tools/check-versions.sh .

# The four tool versions no ecosystem lifts — cosign, golangci-lint, gitleaks,
# syft — found by shape rather than from a list. Named twice in backlog.md, in
# two different phases, as versions a person has to remember; four places is
# where a check gets cheaper than the discipline.
.PHONY: check-pins
check-pins: ## Every externally pinned tool carries a full digest and a readable version
	@tools/check-pins.sh .

# The same pins, asked of the world: is any of them behind? Weekly rather than
# per-diff, next to check-vuln and verify-supply-chain, because the answer can
# change on a tree nobody touched — ADR 0031 §1.
.PHONY: check-pins-online
check-pins-online: ## Ask upstream whether any pinned tool has a newer release
	@tools/check-pins.sh --online .

.PHONY: check-env
check-env: ## Every Env* constant appears in .env.example, the runbook and compose.dev.yaml
	@printf 'env\n'
	@tools/check-env.sh .

.PHONY: check-adrs
check-adrs: ## Every referenced ADR exists, no number twice, no gap
	@printf 'adrs\n'
	@tools/check-adrs.sh .

.PHONY: check-readme
check-readme: ## Every `make` target the quickstart names actually exists
	@printf 'readme\n'
	@tools/check-readme.sh .

.PHONY: check-repo
check-repo: ## Line endings, trailing whitespace, final newline, git hooks
	@printf 'repo\n'
	@tools/check-repo.sh

.PHONY: check-todo
check-todo: ## Reject TODO/FIXME without an issue reference
	@printf 'markers\n'
	@tools/check-todo.sh

.PHONY: check-compose
check-compose: ## No published port for db, no build: in the production compose
	@printf 'compose\n'
	@tools/check-compose.sh

.PHONY: check-rollout
check-rollout: ## Every service compose.yaml defines is started by the rollout
	@printf 'rollout\n'
	@tools/check-rollout.sh .

.PHONY: check-dockerfiles
check-dockerfiles: ## Digest pins, no secret build args, non-root, no module cache layer
	@printf 'dockerfiles\n'
	@tools/check-dockerfiles.sh

.PHONY: check-migrations
check-migrations: ## Migration hygiene and the invariants that are greppable
	@printf 'migrations\n'
	@tools/check-migrations.sh

.PHONY: check-stack
check-stack: ## Every stack.yaml entry resolves, and none of them types a version
	@printf 'stack\n'
	@tools/check-stack.sh

.PHONY: check-probe-cadence
check-probe-cadence: ## The probe's cron and ops.ProbeInterval are the same number
	@printf 'probe cadence\n'
	@tools/check-probe-cadence.sh .

# The second gate of the same kind as check-probe-cadence, and ordered the same
# way: ADR 0040 §4 wrote down what a rename of these names would cost before
# anybody renamed one. The failure it catches is silent — an empty vector, no
# row, and the page back on `— NO DATA` with nothing logged above INFO.
.PHONY: check-rule-names
check-rule-names: ## Every recording rule internal/snapshots asks for exists in slis.yml
	@printf 'rule names\n'
	@tools/check-rule-names.sh .

.PHONY: check-go
check-go: ## gofmt, go vet, go test -race
	@printf 'go\n'
# gofmt -l prints the offenders and exits 0 — on its own it is a check that
# reports and then lets everything through. The emptiness of its output is the
# assertion, so that is what gets tested.
#
# -race, and the second half of issue #181 is the decision to put it here rather
# than in a target of its own. The argument against was runtime, so it was
# measured instead of estimated: 6 s without, 8 s with, on a cold test cache.
# Two seconds does not buy a second target to remember, and the class it catches
# — a goroutine and a test body touching the same field — is the class that does
# not fail until it fails in production. The first thing it found had been in
# internal/contact since E2 and no gate had ever looked.
#
# NOT in check-db, and that is a separate line rather than an oversight. Those
# run in a container against a real server, the cost there is container time
# rather than two seconds, and the races this finds are in-process ones that
# the untagged run already covers.
	@cd api && bad=$$(gofmt -l .); \
		[ -z "$$bad" ] || { printf '  ✗ not gofmt-clean:\n'; printf '%s\n' "$$bad" | sed 's/^/    /'; exit 1; }; \
		go vet ./... && go test -race ./... && printf '  ✓ gofmt, vet, test -race\n'
# Tidiness, in its own script so that tools/selftest.sh can hold it against a
# module that is deliberately untidy. The reasons are in the file.
	@tools/check-tidy.sh api

.PHONY: check-lint
check-lint: ## golangci-lint over api/ — ruleset and exclusions in .golangci.yml
	@printf 'lint\n'
	@tools/check-lint.sh

.PHONY: check-tokens
check-tokens: ## Invariant 8 — no colour, radius or duration outside tokens.css
	@printf 'tokens\n'
	@tools/check-tokens.sh

.PHONY: check-web
check-web: ## Typecheck, lint, unit tests
	@printf 'web\n'
	@cd web && npm run typecheck --silent && npm run lint --silent && npm test --silent

GENERATED := contract/openapi.public.yaml api/internal/httpx/assets/openapi.yaml \
             api/internal/intake/testdata/openapi.yaml \
             api/internal/httpx/gen.go web/lib/api/schema.d.ts \
             api/migrations/testdata/skill_states.json \
             api/internal/seed/stack.gen.json \
             web/content/generated/compose-api.gen.json \
             web/e2e/oracle/case-study.gen.json \
             web/e2e/oracle/home.gen.json \
             web/e2e/oracle/work.gen.json \
             web/e2e/oracle/about.gen.json \
             web/e2e/oracle/blog-post.gen.json \
             web/e2e/oracle/contact.gen.json \
             api/internal/store/db.go api/internal/store/models.go \
             api/internal/store/health.sql.go api/internal/store/systems.sql.go \
             api/internal/store/training.sql.go api/internal/store/ops.sql.go \
             api/internal/store/contributions.sql.go \
             api/internal/store/contact.sql.go

# Drift is "running gen would change something", so that is what gets measured —
# checksums either side of a run, not `git diff`.
#
# The git version was wrong in a way that only shows up locally: it compares the
# working tree against the index, so a file you had just regenerated correctly but
# not yet staged came out red. On a clean CI checkout the two agree; on a working
# tree they do not, and a check that cries wolf while you work stops being read.
.PHONY: check-contract
check-contract: ## Validate the OpenAPI contract and check for codegen drift
	@printf 'contract\n'
	@tools/check-contract.sh
# One checksum per file rather than one over all of them: GENERATED covers
# fifteen files from seven sources now, and "something is stale" would send you
# looking in the contract when what moved was a column in a migration.
#
# training.sql.go was missing from that list for a whole phase — C3 added the file
# and not the line, so a generated file sat outside the drift check without
# anything noticing. Adding a query file means adding it here, in the same commit.
	@[ -f contract/openapi.yaml ] || exit 0; \
		before=$$(sha256sum $(GENERATED) 2>/dev/null); \
		$(MAKE) --no-print-directory gen >/dev/null || exit 1; \
		after=$$(sha256sum $(GENERATED) 2>/dev/null); \
		stale=$$(printf '%s\n%s\n' "$$before" "$$after" | sort | uniq -u | awk '{print $$2}' | sort -u); \
		[ -z "$$stale" ] || { \
			printf '  ✗ generated files are stale — run make gen and commit the result\n'; \
			printf '%s\n' "$$stale" | sed 's/^/    /'; \
			exit 1; \
		}; \
		printf '  ✓ no codegen drift\n'

# ---------------------------------------------------------------- bootstrap
#
# The two steps a fresh clone needs before `make check` and `make dev` work,
# and both were missing from the README quickstart until the check that runs it
# said so.

.PHONY: deps
deps: ## Install the web dependencies a fresh clone needs
	@printf 'deps\n'
	@cd web && npm ci

# What .env.example deliberately does not carry, filled in for a local run.
#
# The file is committed, so it cannot hold secrets and it cannot hold a personal
# access token. The api refuses to start without either (C1), and that refusal
# is correct and stays. What was missing is one command that satisfies it,
# instead of four things a reader has to be told about one at a time — the
# quickstart said `cp .env.example .env` and then `make dev`, and `make dev`
# could never have worked.
#
# Throwaway values: they authenticate nothing that outlives this machine.
# Production values come from Dokploy.
#
# Idempotent. A variable that already has a value is left alone, so running this
# twice does not rotate tokens under a running stack.
REQUIRED_SECRETS := CONTACT_IP_PEPPER INTERNAL_PROBE_TOKEN INTERNAL_DEPLOY_TOKEN

.PHONY: env-dev
env-dev: ## Fill .env with what a local run needs and .env.example cannot carry
	@printf 'env-dev\n'
	@[ -f .env ] || { printf '  ✗ no .env — run: cp .env.example .env\n'; exit 1; }
	@for k in $(REQUIRED_SECRETS); do \
		if grep -qE "^$$k=.+" .env; then \
			printf '  – %s already set, left alone\n' "$$k"; \
		else \
			sed -i.bak "/^$$k=/d" .env && rm -f .env.bak; \
			printf '%s=%s\n' "$$k" "$$(openssl rand -hex 32)" >> .env; \
			printf '  ✓ %s generated\n' "$$k"; \
		fi; \
	done
# The contribution calendar is the one thing a stranger cannot have: it needs a
# personal access token, and there is no throwaway version of somebody else's
# GitHub account. The transport switches off instead, which is a documented
# state (ADR 0020) and not a workaround — the api starts, every endpoint answers,
# and /api/contributions serves whatever the cache holds.
	@if grep -qE '^GITHUB_TOKEN=.+' .env; then \
		printf '  – GITHUB_TOKEN is set, leaving the calendar on\n'; \
	else \
		sed -i.bak "/^CONTRIBUTIONS_TRANSPORT=/d" .env && rm -f .env.bak; \
		printf 'CONTRIBUTIONS_TRANSPORT=off\n' >> .env; \
		printf '  ✓ no GITHUB_TOKEN, so CONTRIBUTIONS_TRANSPORT=off — the calendar is never refreshed\n'; \
	fi

# ------------------------------------------------------------------- dev

COMPOSE_DEV := docker compose -f compose.dev.yaml

# What the dev stack remembers between starts, and why it needs a guard.
#
# node_modules is an anonymous volume and .next a named one, both so the bind
# mount cannot hide them (compose.dev.yaml says why). Neither is touched by
# `up --build`: compose carries anonymous volumes over to the new container and
# keeps named ones by definition. So a dependency added to package.json reaches
# the IMAGE and never the CONTAINER.
#
# Measured in G1, and it cost an hour: `Cannot find module
# '@tailwindcss/postcss'` on every request, every page a 500, while
# `docker exec` showed the package sitting in node_modules. Two layers, and the
# second is the reason `--renew-anon-volumes` alone reads as "did not help":
# the first failed start compiles itself into .next, and that cache keeps
# throwing after node_modules is correct.
#
# The stamp is the lockfile's checksum at the last start. When it moves, this
# stops and names the one command that clears both.
DEV_STAMP := .make/dev-lockfile.sha256

.PHONY: dev
dev: ## Start Postgres, API and web with hot reload
	@[ -f .env ] || { \
		printf '  ✗ no .env — the compose file has nothing to read.\n'; \
		printf '    run: cp .env.example .env\n'; \
		exit 1; \
	}
	@want=$$(sha256sum web/package-lock.json | cut -d' ' -f1); \
	if [ -f $(DEV_STAMP) ] && [ "$$(cat $(DEV_STAMP))" != "$$want" ]; then \
		printf '  ✗ web/package-lock.json has moved since the last start.\n'; \
		printf '    node_modules and .next live in volumes that survive `up --build`,\n'; \
		printf '    so the new dependency would reach the image and not the container.\n'; \
		printf '    run: make dev-reset && make dev\n'; \
		exit 1; \
	fi; \
	mkdir -p $(dir $(DEV_STAMP)) && printf '%s\n' "$$want" > $(DEV_STAMP)
	$(COMPOSE_DEV) up --build

.PHONY: dev-down
dev-down: ## Stop the dev stack, keep the database
	$(COMPOSE_DEV) down

.PHONY: dev-reset
dev-reset: ## Stop the dev stack and drop every volume it owns
	$(COMPOSE_DEV) down --volumes
# The stamp goes with them. Left behind, the guard above would refuse the very
# start that this target just made correct.
	@rm -f $(DEV_STAMP)

# ------------------------------------------------------------------- gen

# Both npm tools are devDependencies, so --no-install is the point: it uses the
# locked versions in web/node_modules and fails loudly if they are missing, instead
# of silently fetching whatever is current from the network on every check.
#
# The generators read the FULL contract — C7 needs the internal types. Only the
# bundle that ships to readers is filtered, and it is copied into the Go package
# because go:embed cannot reach outside its own directory.
#
# The fourth generator has a different source: it reads skillState() out of the
# read-only design handoff and writes the truth table that phase B3's property
# test holds against v_track_states. Same reason it lives here — a generated file
# that nobody regenerates is a stale file, and GENERATED above turns that into a
# red check instead of a green lie.
#
# The fifth resolves stack.yaml against go.mod, package.json and compose.dev.yaml
# so the seed can embed the result — in D2 it runs from an image that carries
# none of those files. Two guards, two different statements: the checksum above
# says "committed equals regenerated", make check-stack says "every entry still
# resolves and nobody typed a version". A checksum cannot name the entry.
.PHONY: gen
gen: ## Generate Go and TS types from the contract, the skill states and the stack
	@printf 'gen\n'
# Both tools narrate to stderr on success. Swallowing that keeps `make check`
# readable; keeping it on failure is why the output is captured rather than
# discarded outright.
	@cd web && out=$$(npx --no-install redocly bundle public --config ../redocly.yaml \
		--remove-unused-components -o ../contract/openapi.public.yaml 2>&1) \
		|| { printf '%s\n' "$$out" | sed 's/^/    /'; exit 1; }
	@cp contract/openapi.public.yaml api/internal/httpx/assets/openapi.yaml
# The FULL contract, for the one test that cannot read the served one: the two
# internal operations are stripped from the public bundle by design, so a
# contract test for them written the usual way would find nothing and pass.
#
# testdata and not assets: the Go toolchain ignores a testdata directory, so
# this copy is reachable from a test and cannot be embedded into the binary by
# the `//go:embed assets` next door. It lives under api/ because `make check-db`
# mounts only ./api into the container, and a test that reads ../../../contract
# is green on the host and broken in CI.
	@cp contract/openapi.yaml api/internal/intake/testdata/openapi.yaml
	@cd api && go tool oapi-codegen -config oapi-codegen.yaml ../contract/openapi.yaml
# sqlc reads api/migrations directly — the goose files are the schema, so the
# queries are checked against what is actually applied rather than against a
# copy that drifts. It needs no database and no C toolchain: the Postgres parser
# it uses is compiled to WebAssembly.
	@cd api && go tool sqlc generate
	@cd web && out=$$(npx --no-install openapi-typescript ../contract/openapi.yaml \
		-o lib/api/schema.d.ts 2>&1) \
		|| { printf '%s\n' "$$out" | sed 's/^/    /'; exit 1; }
# Its own success line goes; a failure still speaks, because it speaks on stderr.
	@node tools/gen-skill-states.mjs >/dev/null
	@cd api && go run ./cmd/genstack
# H1, issue #75. The excerpt the case study shows is cut out of the compose file
# the VPS runs, so it cannot drift from it — the same guarantee stack.yaml gives
# a version number. Both narrate to stderr, so both are silenced the same way.
	@node tools/gen-compose-excerpt.mjs 2>/dev/null
# H1b. What the design handoff draws, extracted from the sheets so that a test
# can hold the built page against it. The sheets are read-only and never move,
# so this file never changes on its own — what the drift check guards is the
# EXTRACTOR, and the transcription inside it.
	@node tools/gen-sheet-oracle.mjs 2>/dev/null
	@printf '  ✓ public bundle, go types, sql types, ts types, skill states, stack manifest, compose excerpt, sheet oracle\n'

# --------------------------------------------------------------- migrations

# Every one of these runs inside the docker network, because Postgres publishes
# no port and goose on the host cannot reach it at all. The migrate service
# carries MIGRATE_DATABASE_URL; the api service deliberately does not.
MIGRATE := $(COMPOSE_DEV) run --rm migrate

.PHONY: migrate
migrate: ## Apply every pending migration (as timseil_migrate)
	@$(MIGRATE) up

.PHONY: migrate-down
migrate-down: ## Roll back exactly one migration
	@$(MIGRATE) down

.PHONY: migrate-reset
migrate-reset: ## Roll back to zero — the only reliable way down once B3 lands
	@$(MIGRATE) reset

.PHONY: migrate-status
migrate-status: ## List every migration and whether it is applied
	@$(MIGRATE) status

# --user because this is the one command that writes into the bind mount. The
# container runs as root, so without it the new file lands in your working tree
# owned by root and you cannot delete it from your own account — the same trap
# that produced root-owned web/.next and api/tmp in A4.
.PHONY: migrate-create
migrate-create: ## Write a new empty migration — make migrate-create name=add_foo
	@[ -n "$(name)" ] || { printf '  ✗ give it a name: make migrate-create name=add_foo\n'; exit 1; }
	@$(COMPOSE_DEV) run --rm --user "$$(id -u):$$(id -g)" migrate create $(name)

# ---------------------------------------------------------------------- seed

# Same reason as the migrate targets: Postgres publishes no port, so this runs
# inside the docker network. The seed service carries DATABASE_URL — the app
# role, DML only — because that is all a seed needs, and needing no more is the
# claim being made.
#
# `make dev` already runs it in the startup chain. This target is for afterwards:
# a track renamed, an evidence detail corrected, a stack line added.
.PHONY: seed
seed: ## Write the curated content — systems, modules, tracks, evidence
	@$(COMPOSE_DEV) run --rm seed

# The acceptance criterion of this phase, and it needs a real Postgres: three
# up/down/up cycles plus every invariant proven against its broken case.
# ------------------------------------------------------------- scanners
#
# Neither of these is in `make check`, and they are outside it for two
# different reasons — ADR 0031 has the rule.
#
# check-secrets is deterministic but needs a container, like check-db.
# check-vuln is the other case: it can turn red on a tree nobody touched,
# because somebody else published a CVE. A gate in the check chain that breaks
# without a code change is a gate people learn to run `make check` around.
#
# Both are one command in CI and on a laptop, which is the part of ADR 0030
# that does not bend.

# The other half of documentation-drift check 3. check-readme (in `make check`)
# asks whether the quickstart's targets exist; this one runs the thing. It
# clones, installs, builds two images and starts a stack, so it is not in the
# chain — same reason as check-db, and it runs on main and on the schedule
# rather than on every pull request.
.PHONY: quickstart
quickstart: ## Actually run the README quickstart, from a fresh clone
	@printf 'quickstart\n'
	@tools/run-quickstart.sh .

.PHONY: check-secrets
check-secrets: ## Plant a key, prove gitleaks rejects it, then scan this history
	@printf 'secrets\n'
	@tools/check-secrets.sh . $(RANGE)

.PHONY: check-vuln
check-vuln: ## Known vulnerabilities this program can actually reach
	@printf 'vulnerabilities\n'
	@tools/check-vuln.sh .

#
# Behind the `db` build tag rather than an env guard with t.Skip. With the tag
# the tests do not appear in `go test ./...` at all, so there is no skip line to
# mistake for a run; inside the tagged package a missing DSN is a t.Fatal. A
# plain env guard would go green in CI the day someone forgets the variable —
# the `gofmt -l` bug from A4 in new clothes.
.PHONY: check-db
check-db: ## Migration cycle and schema invariants against a real Postgres
	@printf 'db\n'
	@[ -f .env ] || { printf '  ✗ no .env — run: cp .env.example .env\n'; exit 1; }
	@$(COMPOSE_DEV) up -d --wait db
# -p 1 because there is one test database and more than one package now wants
# it. go test runs packages in parallel by default, and two of them calling
# FreshSchema at the same time produce "relation already exists" from whichever
# lost the race — a failure that reads like a broken migration and is not one.
	@$(COMPOSE_DEV) run --rm --entrypoint go migrate test -tags=db -count=1 -p 1 ./...

# -------------------------------------------------------------------- images

# The production images. `make images` still tags locally only — the push is a
# separate target (`make push`) so that building and publishing stay two
# decisions. E3 moved that push into the pipeline; it happens in GitHub Actions,
# on main, and never on the VPS. Issue #90, and the runbook heading that used to
# call the manual version one-off.
IMAGE_API := timseil-api
IMAGE_WEB := timseil-web

# compose.yaml names the images as GHCR does, because that is what runs on the
# VPS and a production file that named something else would be describing a
# deployment nobody has. So the local build carries both tags: the short one for
# `docker images` and the registry one so `make check-topology` can run the real
# file without a registry and without weakening its `image:` lines.
REGISTRY := ghcr.io/g1ng4r

# What the linker stamps into the binary, and therefore what /api/health says.
#
# VERSION moved into tools/version.sh, and the reason is in that file: the
# expression that used to stand here named a backup tag as this project's
# version, publicly, for as long as the image built from it ran (#112). A rule
# that produced a false claim belongs somewhere it can be held against its
# broken case, not inline in a $(shell).
#
# Seven characters because that is buildinfo's shaLength and the tag scheme E4
# will push under. A second spelling of the same number is a second number —
# which is also why nothing here recomputes what version.sh answers.
GIT_SHA := $(shell git rev-parse --short=7 HEAD 2>/dev/null || echo unknown)
VERSION := $(shell tools/version.sh)
IMAGE_TAG := sha-$(GIT_SHA)

# The tag, printed. It exists so that CI can name the images it just built
# without spelling `sha-$(git rev-parse --short=7 HEAD)` a second time in YAML
# — a second definition of a name is a name that drifts, and the one place it
# would show up is a scanner silently finding no image to scan.
.PHONY: image-tag
image-tag: ## Print the tag `make images` gives the images it builds
	@printf '%s\n' '$(IMAGE_TAG)'

.PHONY: images
images: image-api image-web ## Build both production images

.PHONY: image-api
image-api: ## Build the API image
	@printf 'image %s:%s\n' '$(IMAGE_API)' '$(IMAGE_TAG)'
	@docker build \
		--build-arg VERSION=$(VERSION) \
		--build-arg GIT_SHA=$(GIT_SHA) \
		-t $(IMAGE_API):$(IMAGE_TAG) \
		-t $(REGISTRY)/$(IMAGE_API):$(IMAGE_TAG) ./api

.PHONY: image-web
image-web: ## Build the web image
	@printf 'image %s:%s\n' '$(IMAGE_WEB)' '$(IMAGE_TAG)'
	@docker build \
		--build-arg VERSION=$(VERSION) \
		--build-arg GIT_SHA=$(GIT_SHA) \
		-t $(IMAGE_WEB):$(IMAGE_TAG) \
		-t $(REGISTRY)/$(IMAGE_WEB):$(IMAGE_TAG) ./web

# The acceptance criteria of phase D1, as a command rather than as a paragraph.
#
# Not part of `make check`, and for the same reason `check-db` is not: it needs
# Docker and it needs a build. What a static check CAN say about these files is
# said by `make check-dockerfiles`, which does run — this target checks the
# artefact, that one checks the recipe.
MAX_API_BYTES := 20971520

.PHONY: check-images
check-images: ## The D1 acceptance: size, user, no shell, and the standalone assets
	@printf 'images\n'
	@for tag in $(IMAGE_API):$(IMAGE_TAG) $(IMAGE_WEB):$(IMAGE_TAG); do \
		docker image inspect "$$tag" >/dev/null 2>&1 || { \
			printf '  ✗ %s is not built — run: make images\n' "$$tag"; exit 1; }; \
	done
# Under 20 MiB. A Go binary on distroless has no runtime to carry, so a number
# far above this means something got copied in that should not have been.
	@size=$$(docker image inspect $(IMAGE_API):$(IMAGE_TAG) --format '{{.Size}}'); \
		if [ "$$size" -gt $(MAX_API_BYTES) ]; then \
			printf '  ✗ the api image is %s bytes, over the %s byte ceiling\n' "$$size" '$(MAX_API_BYTES)'; \
			exit 1; \
		fi; \
		printf '  ✓ api image %s MiB\n' "$$(( size / 1048576 ))"
# root is the default, so the assertion is that neither image took it.
	@for tag in $(IMAGE_API):$(IMAGE_TAG) $(IMAGE_WEB):$(IMAGE_TAG); do \
		user=$$(docker image inspect "$$tag" --format '{{.Config.User}}'); \
		case "$$user" in \
			''|root|root:*|0|0:*) printf '  ✗ %s runs as %s\n' "$$tag" "$${user:-root}"; exit 1 ;; \
		esac; \
		printf '  ✓ %s runs as %s\n' "$$tag" "$$user"; \
	done
# The distroless claim, tested rather than trusted: a base image swapped for a
# convenient one would pass every check above and fail this.
	@if docker run --rm --entrypoint sh $(IMAGE_API):$(IMAGE_TAG) -c true >/dev/null 2>&1; then \
		printf '  ✗ the api image has a shell\n'; exit 1; \
	fi
	@printf '  ✓ no shell in the api image\n'
# The standalone trap. Both directories are absent from .next/standalone and
# both are copied by hand, so both are checked — a build that lost one of them
# starts, serves, and looks broken in a way that has nothing to do with the code.
	@docker run --rm $(IMAGE_WEB):$(IMAGE_TAG) \
		sh -c '[ -d .next/static ] && [ -d public ] && [ -f public/favicon.svg ]' \
		|| { printf '  ✗ the web image is missing .next/static or public — the standalone trap\n'; exit 1; }
	@printf '  ✓ .next/static and public are in the web image\n'

# -------------------------------------------------------------- supply chain

# Where the SBOM documents land. Ignored by git (dist/), because a bill of
# materials is produced from the image and never edited — a copy in the tree
# would be a second answer to the same question, kept in step by nobody.
SBOM_DIR := dist/sbom

# The push, as a target rather than as a paragraph in a runbook.
#
# require-images first, so that pushing a tag nobody built says so instead of
# letting docker answer with an authentication error against ghcr.io — which is
# a message about the wrong thing entirely.
.PHONY: push
push: require-images ## Push both production images to GHCR — the pipeline does this on main
	@printf 'push\n'
	@tools/push.sh $(REGISTRY)/$(IMAGE_API):$(IMAGE_TAG) $(REGISTRY)/$(IMAGE_WEB):$(IMAGE_TAG)

# One target per image rather than one that prints both, because the caller is
# an attestation step that needs exactly one subject at a time and would
# otherwise have to cut a line out of a list in YAML. Same argument as
# `image-tag`: a name spelled twice is a name that drifts.
.PHONY: image-digest-api
image-digest-api: ## Print the digest the pushed API image answers to
	@tools/image-digest.sh $(REGISTRY)/$(IMAGE_API):$(IMAGE_TAG)

.PHONY: image-digest-web
image-digest-web: ## Print the digest the pushed web image answers to
	@tools/image-digest.sh $(REGISTRY)/$(IMAGE_WEB):$(IMAGE_TAG)

# CycloneDX per image. The expected ecosystem is passed in and asserted, so a
# document that came back empty fails here instead of being published as an
# answer — see the header of tools/sbom.sh.
#
# The local tags, not the ghcr.io ones: the bytes are identical, and naming the
# registry in a document produced before any push would date the SBOM to a
# place it has not been yet.
.PHONY: sbom
sbom: ## CycloneDX bill of materials for both images, into dist/sbom
	@printf 'sbom\n'
	@tools/sbom.sh $(SBOM_DIR) $(IMAGE_API):$(IMAGE_TAG) pkg:golang/
	@tools/sbom.sh $(SBOM_DIR) $(IMAGE_WEB):$(IMAGE_TAG) pkg:npm/

# Signature and SBOM attestation, both attached to the DIGEST of what was
# pushed. Depends on `sbom` because the attestation needs the predicate file,
# and on nothing else: the images have to be in the registry already, which is
# what `push` is for and what tools/image-digest.sh refuses to fake.
#
# This is the one target in the repository whose RESULT depends on where it
# runs — in Actions the signing identity is the workflow, on a laptop it is
# yours. tools/sign.sh says so in its header, and `verify-supply-chain` is what
# makes the difference matter.
.PHONY: sign
sign: sbom ## Sign both images and attach their SBOM — needs an OIDC identity
	@printf 'sign\n'
	@tools/sign.sh \
		$(REGISTRY)/$(IMAGE_API):$(IMAGE_TAG) $(SBOM_DIR)/$(IMAGE_API).cdx.json \
		$(REGISTRY)/$(IMAGE_WEB):$(IMAGE_TAG) $(SBOM_DIR)/$(IMAGE_WEB).cdx.json

# The acceptance criterion of E3, and the only target here that wants nothing
# from this machine: no build, no login, no images. It reads the registry the
# way a stranger would, which is the claim being tested.
#
# Takes a tag or digest; without one it asks for the tag `make images` uses, so
# on main that is the commit that was just published.
.PHONY: verify-supply-chain
verify-supply-chain: ## Verify signature, SBOM attestation and provenance — and the broken case
	@printf 'supply chain\n'
	@tools/verify-supply-chain.sh $(REF)

# --------------------------------------------------------------------- deploy

# What the `deploy` job in ci.yml runs, and what a person runs when the pipeline
# is not the one deploying. Same rule as everywhere else in this file: nothing
# in YAML that is not a command you can type — and here that includes the
# rollback, because a rollback you can only trigger by merging to main is one
# you get to test once.
#
# `deploy-gate` is the whole of steps six and seven. The three below it are its
# parts, and they stay separately runnable because the rollback drill in
# docs/runbooks/dokploy.md needs to combine them in a way the gate never would.
#
# All three default to HEAD, so on `main` right after a merge they name the
# commit that was just published — and on any other commit they name something
# the registry does not have, which tools/deploy.sh says out loud instead of
# taking the site down to find out.
#
# NEEDS A TUNNEL. `deploy` talks to Dokploy on 127.0.0.1:3000, which is where
# the panel is and where it stays (build plan L3). Open it first:
#
#     ssh -N -L 3000:127.0.0.1:3000 <vps>
#
# DEPLOY_TAG is separate from IMAGE_TAG on purpose. IMAGE_TAG names what this
# machine builds; DEPLOY_TAG names what production is asked to run, and the
# rollback path needs to pass a value that is deliberately not HEAD.
DEPLOY_TAG ?= $(IMAGE_TAG)
DEPLOY_SHA ?= $(GIT_SHA)

# DEPLOY_STARTED_AT has no default. The number reported is the whole run, and a
# start instant this Makefile invented would measure the last two steps while
# claiming to measure all seven — invariant 1 applies to what a number MEANS,
# not only to whether something produced it. In ci.yml the value is the run's
# own `run_started_at`; by hand it is the `date +%s` you took before you began.
.PHONY: deploy-gate
deploy-gate: ## Deploy, verify, roll back if it does not come up — needs DEPLOY_STARTED_AT
	@tools/deploy-gate.sh $(DEPLOY_TAG) $(DEPLOY_SHA) $(DEPLOY_STARTED_AT)

.PHONY: deploy
deploy: ## Point production at a build — make deploy DEPLOY_TAG=sha-abc1234
	@tools/deploy.sh $(DEPLOY_TAG)

.PHONY: verify-deploy
verify-deploy: ## Poll the public URL until it serves that build, 60s budget
	@tools/verify-deploy.sh $(DEPLOY_SHA)

# DEPLOY_RESULT and DEPLOY_SECONDS have no defaults, deliberately. A duration
# this Makefile guessed would be the one thing invariant 1 forbids, and a result
# defaulting to `ok` would report success for a rollback. The DEPLOY_ prefix is
# not decoration either: a bare SECONDS is a variable the shell already owns.
.PHONY: report-deploy
report-deploy: ## Report the measured duration — make report-deploy DEPLOY_SECONDS=214 DEPLOY_RESULT=ok
	@tools/report-deploy.sh $(DEPLOY_SHA) $(DEPLOY_SECONDS) $(DEPLOY_RESULT)

# The same script .github/workflows/probe.yml runs every five minutes, so a
# suspicion can be checked from here instead of by reading a workflow log.
#
# PROBE_LOG is optional and unset by default: without it nothing is appended
# anywhere, and the run is a measurement and a report and nothing more. The
# workflow passes its checkout of the ops-data branch.
.PHONY: probe
probe: ## Measure the site once and report it — make probe PROBE_BASE=https://timseil.dev
	@tools/probe.sh $(if $(PROBE_LOG),--log $(PROBE_LOG)) $(PROBE_BASE)

# The second instrument, and it measures a different claim than verify-deploy.
# That one asks five questions once, at the end, and answers "the build we
# ordered is serving the site". This one asks one question a second for the
# whole deploy and answers "no visitor saw an error" — the E5 acceptance, which
# counts anything that is not 200 rather than only 5xx, because the ten-second
# window E4b measured was 404s and the old wording would have passed it.
#
# WITNESS_UNTIL has no default, for the same reason DEPLOY_STARTED_AT has none:
# a duration this Makefile picked would be a number nobody can hold against
# anything. Say how many seconds, or say which end to wait for.
#
# START IT BEFORE THE MERGE. The swap happens three to four minutes after a
# merge (228 s and 258 s, the last two deploys), and a witness started after that
# has measured the wrong window — which happened, on 2026-08-22, to this file's
# own phase. --until-restart is the mode for it: it needs no sha, and a squash
# sha does not exist until the merge has already happened.
#
#     make witness WITNESS_UNTIL="--until-restart"
#     make witness WITNESS_UNTIL="--until-sha $$(git rev-parse --short=7 HEAD)"
#     make witness WITNESS_UNTIL="--seconds 120"
.PHONY: witness
witness: ## Write down what a visitor saw, one request a second — needs WITNESS_UNTIL
	@tools/witness.sh $(WITNESS_UNTIL) $(WITNESS_BASE)

# NOT part of `make check`, and the reason is one line long: it builds, and
# `check` does not. It also builds EVERY time it runs — a `.next` older than the
# tree it came from is the one way this measurement can be wrong without saying
# so, and that is worth twenty seconds.
#
# Two numbers, because one cannot be acted on. 134 KB of the 143 KB it measures
# is React and the App Router; a budget that mixes them goes red for something
# nobody here wrote and stays green while our own half doubles. ADR 0050.
.PHONY: bundle-size
bundle-size: ## Initial JS of `/`, gzip — framework and our own code, separately
	@printf 'bundle\n'
	@tools/bundle-size.sh

# NOT part of `make check`, and for a reason beyond the usual one. It needs the
# network and a running production, which is already the line ADR 0031 §1 draws
# — but inside `check` it would also let one merge be blocked by the deploy of
# the previous one, and be red for every stranger who cloned the repository and
# has no production at all. `make check` has to pass on a fork.
#
# The last claim, the digest of the RUNNING container, cannot be made from here:
# the CI deploy key opens one port-forward and executes no command, so nothing in
# Actions can run `docker inspect` on the host. The script says so out loud and
# prints the digests to compare. `check-deployed-host` is the same file on the
# other side of that line, and it belongs in the D3 acceptance where
# `docker system df` used to stand.
.PHONY: check-deployed
check-deployed: ## Does production run the head of main — every claim a stranger can make
	@tools/check-deployed.sh $(REF)

.PHONY: check-deployed-host
check-deployed-host: ## The same, plus the digest of the running container — run it ON the VPS
	@tools/check-deployed.sh --host $(REF)

# ---------------------------------------------------------------- retention
#
# GHCR is the rollback store — the VPS disk keeps a build for about a day, and
# Dokploy's nightly prune takes the rest (runbook 3.3, 3.5). So this is the one
# file in the repository that can destroy something nothing else holds a copy of,
# and the two targets are deliberately not one target with a flag: `make` history
# and shell history should never be one keystroke away from the irreversible one.
#
# The plan needs no credential at all. It is computed from the public registry
# API, which means a stranger can reproduce it and a wrong plan is visible before
# anything is gone. Only the second target reads GHCR_TOKEN.
.PHONY: prune-registry
prune-registry: ## What the GHCR retention rule would remove — removes nothing, needs no token
	@tools/prune-registry.sh

.PHONY: prune-registry-apply
prune-registry-apply: ## Apply it — IRREVERSIBLE, needs GHCR_TOKEN with delete:packages
	@tools/prune-registry.sh --delete

# ------------------------------------------------------------------- topology

# compose.yaml is the file Dokploy runs. It is also the file this target runs, on
# this machine, against the images `make images` just built — which is the only
# way the claim "it comes up from nothing without a handgriff" is a measurement
# rather than an intention.
COMPOSE := docker compose -f compose.yaml

# IMAGE_TAG reaches compose through the environment, not through Make: compose
# reads the process environment and knows nothing about a Make variable of the
# same name. Exported once here rather than repeated on every line below.
export IMAGE_TAG

# CONTRIBUTIONS_TRANSPORT=off, because verifying the topology should not require
# a GitHub credential. It switches the refresher off and neither the start nor
# the endpoint (ADR 0026 §4) — the same answer C7 reached for local runs.
TOPOLOGY_ENV := CONTRIBUTIONS_TRANSPORT=off

# The network Traefik reaches api and web on. It belongs to Dokploy on the VPS;
# here `require-network` below creates an empty stand-in so the same file runs.
DOKPLOY_NETWORK := dokploy-network

# The seam to the Grafana that already runs on this machine. Same shape as the
# one above and a different owner: on the VPS it is created once and the
# neighbouring app joins it from its own Dokploy settings, here it is a local
# stand-in so compose.yaml runs unchanged. ADR 0039 §2.
OBS_NETWORK := observability-network

# Both targets below need the images to exist under their registry names. They do
# not exist for a commit nobody built: IMAGE_TAG follows HEAD, so committing and
# then running `make prod` asks docker for a tag that was never pushed, and what
# comes back is an authentication error against ghcr.io — a message about the
# wrong thing entirely. This says the true thing instead.
.PHONY: require-images
require-images:
	@for tag in $(REGISTRY)/$(IMAGE_API):$(IMAGE_TAG) $(REGISTRY)/$(IMAGE_WEB):$(IMAGE_TAG); do \
		docker image inspect "$$tag" >/dev/null 2>&1 || { \
			printf '  ✗ %s is not built\n' "$$tag"; \
			printf '    run: make images    (IMAGE_TAG follows HEAD, so a new commit needs a new build)\n'; \
			exit 1; }; \
	done

# The two handgriffe D3 and F2 cost, and they are here rather than in your head.
#
# compose.yaml declares both networks as `external:` because on the VPS neither
# is ours to create: Traefik lives in the first one and Dokploy owns it, and the
# second is joined by an app that is not this stack. On any other machine they
# simply do not exist, and compose refuses to start rather than inventing them.
# That would break `make prod` and `make check-topology`, and "up from nothing
# without a handgriff" is D2's acceptance criterion, so the handgriff goes in
# the Makefile instead. ADR 0028, ADR 0039.
.PHONY: require-network
require-network:
	@for n in $(DOKPLOY_NETWORK) $(OBS_NETWORK); do \
		docker network inspect "$$n" >/dev/null 2>&1 || { \
			printf '  · creating %s — on the VPS this one is not ours, here it is a local stand-in\n' "$$n"; \
			docker network create "$$n" >/dev/null; }; \
	done

# Every service, including the three that measure the other five. `make prod`
# means "what production runs", and since F2 production runs eight containers —
# a target that started five would be a local stack that agrees with the file
# about everything except the part this phase added.
.PHONY: prod
prod: require-images require-network ## Run the production compose locally — needs `make images` first
	@$(TOPOLOGY_ENV) $(COMPOSE) up -d --wait api web prometheus loki alloy

.PHONY: prod-down
prod-down: ## Stop the production stack, keep the database
	@$(COMPOSE) down

# Drops the volume, never the network: on the VPS that one is Dokploy's and
# taking it away would unroute every other app on the host.
.PHONY: prod-reset
prod-reset: ## Stop it and drop the database volume
	@$(COMPOSE) down --volumes

# ---------------------------------------------------------------- rolling lab
#
# The same production compose, plus a Traefik of our own on loopback, so the
# ten-second 404 funnel from issue #143 can be reproduced and repaired without
# spending a public deploy on every attempt. What it does and does not reproduce
# is written at the top of compose.lab.yaml, and reading that comes before
# believing a number measured here.
# All three files, and compose.rollout.yaml is the one that makes the lab worth
# running: without the twins the rollout has nothing to hold the routers up with
# and the lab would measure the old, broken swap.
LAB_FILES := -f compose.yaml -f compose.rollout.yaml -f compose.lab.yaml

COMPOSE_LAB := docker compose $(LAB_FILES)

LAB_URL := http://127.0.0.1:8080

.PHONY: rolling-lab
rolling-lab: require-images require-network ## Production compose behind a local Traefik — the E5 and F3 measuring rig
# The whole measuring side joined this line in F3, for the reason `prod` gives
# one screen up: a lab that starts fewer services than the file describes agrees
# with that file about everything except the part the current phase added.
#
# It was worth measuring rather than assuming. The first version of this line
# named only prometheus and the two exporters, and `--metrics` then reported
# job=alloy and job=loki DOWN — correctly, and for a reason that had nothing to
# do with the code: they were not started. A lab that reads as broken while it
# is merely incomplete is a lab that teaches you to ignore its red.
#
# It is also the instrument now: F3's acceptance reads a recording rule while k6
# pushes load through the proxy, and both halves have to be running at once.
	@$(TOPOLOGY_ENV) $(COMPOSE_LAB) up -d --wait api web traefik prometheus loki alloy node-exporter postgres-exporter
	@printf '  ✓ lab up — %s\n' '$(LAB_URL)'
	@printf '    witness it:  make witness WITNESS_UNTIL="--seconds 60" WITNESS_BASE=%s\n' '$(LAB_URL)'
	@printf '    roll it:     make rollout\n'

# The five steps of a real deploy, against the lab. tools/rollout.sh holds them;
# this target only says which files they run against, and the point of both is
# that Dokploy's Command field, this lab and the check in tools/deploy.sh cannot
# say three different things.
#
# Watch it from the other terminal, or the run proves nothing:
#
#     make witness WITNESS_UNTIL="--seconds 90" WITNESS_BASE=http://127.0.0.1:8080
#
.PHONY: rollout
rollout: ## Run the overlapping start against the lab — the E5b measurement
	@$(TOPOLOGY_ENV) tools/rollout.sh --run $(LAB_FILES)

# Down, not down --volumes. The database is the slow part of coming back up, and
# a lab that costs a re-seed per run is a lab nobody uses twice.
.PHONY: rolling-lab-down
rolling-lab-down: ## Stop the lab, keep the database
	@$(COMPOSE_LAB) down

# The acceptance criterion of phase D2, as a command rather than as a paragraph:
# "down -v && up reproduziert den Zustand ohne Handgriff".
#
# Not part of `make check`, for the same reason `check-db` and `check-images` are
# not: it needs Docker and it needs a build. What a static check CAN say about
# this file is said by `make check-compose`, which does run — that one checks the
# recipe, this one checks the kitchen.
.PHONY: check-topology
check-topology: require-images require-network ## The D2 acceptance: from zero, twice, and the api blocked when the migration fails
	@printf 'topology\n'
	@[ -f .env ] || { printf '  ✗ no .env — run: cp .env.example .env\n'; exit 1; }
# 1. From nothing. This is the criterion, literally.
	@$(COMPOSE) down --volumes --remove-orphans >/dev/null 2>&1 || true
	@$(TOPOLOGY_ENV) $(COMPOSE) up -d --wait --wait-timeout 180 api web >/dev/null \
		|| { printf '  ✗ the stack did not come up from an empty volume\n'; \
		     $(COMPOSE) ps; exit 1; }
	@printf '  ✓ up from an empty volume, no handgriff\n'
# 2. The chain ran in order and both init containers finished.
	@for s in migrate seed; do \
		code=$$($(COMPOSE) ps -a --format '{{.Service}} {{.ExitCode}}' | awk -v s=$$s '$$1==s {print $$2}'); \
		[ "$$code" = "0" ] || { printf '  ✗ %s exited %s\n' "$$s" "$${code:-<never ran>}"; exit 1; }; \
		printf '  ✓ %s ran and exited 0\n' "$$s"; \
	done
# 3. "Reproduziert den Zustand" is about rows, not about containers. ADR 0013
#    fixes these three numbers; the seed checks them before it commits, and this
#    checks that the seed is what ran.
	@rows=$$($(COMPOSE) exec -T db psql -U "$$(grep -E '^POSTGRES_USER=' .env | cut -d= -f2-)" \
		-d "$$(grep -E '^POSTGRES_DB=' .env | cut -d= -f2-)" -tAc \
		'select (select count(*) from systems)||chr(47)||(select count(*) from tracks)||chr(47)||(select count(*) from track_evidence)' 2>/dev/null | tr -d ' \r'); \
		[ "$$rows" = "2/22/13" ] || { printf '  ✗ seeded rows are %s, want 2/22/13\n' "$$rows"; exit 1; }; \
		printf '  ✓ 2 systems, 22 tracks, 13 evidence rows\n'
# 4. The limits and the hardening are APPLIED, not merely written down. Compose
#    outside swarm honours deploy.resources.limits; this is where that stops
#    being a claim.
	@for s in db api web; do \
		c=$$($(COMPOSE) ps -q $$s); \
		mem=$$(docker inspect "$$c" --format '{{.HostConfig.Memory}}'); \
		cpu=$$(docker inspect "$$c" --format '{{.HostConfig.NanoCpus}}'); \
		[ "$$mem" != "0" ] && [ "$$cpu" != "0" ] \
			|| { printf '  ✗ %s has no memory or cpu limit applied\n' "$$s"; exit 1; }; \
	done
	@printf '  ✓ memory and cpu limits applied to db, api and web\n'
	@for s in api web migrate seed; do \
		c=$$($(COMPOSE) ps -aq $$s); \
		ro=$$(docker inspect "$$c" --format '{{.HostConfig.ReadonlyRootfs}}'); \
		[ "$$ro" = "true" ] || { printf '  ✗ %s does not run read-only\n' "$$s"; exit 1; }; \
	done
	@printf '  ✓ api, web and both init containers run read-only\n'
# 5. The healthcheck came from the IMAGE. If this ever reads anything else, a
#    second copy has appeared in compose.yaml and the two will drift.
	@probe=$$(docker inspect $$($(COMPOSE) ps -q api) --format '{{json .Config.Healthcheck.Test}}'); \
		[ "$$probe" = '["CMD","/api","-healthcheck"]' ] \
			|| { printf '  ✗ api healthcheck is %s, not the one in the image\n' "$$probe"; exit 1; }; \
		printf '  ✓ the api healthcheck is the image'"'"'s, not a second copy\n'
# 6. Postgres publishes nothing. The security rule, measured from the outside.
	@ports=$$(docker inspect $$($(COMPOSE) ps -q db) --format '{{json .NetworkSettings.Ports}}'); \
		case "$$ports" in *'"HostPort"'*) printf '  ✗ db publishes a port: %s\n' "$$ports"; exit 1 ;; esac; \
		printf '  ✓ db publishes no port\n'
# 7. The trust boundary, measured rather than written down. Traefik can reach
#    exactly what is in its network — so api and web belong to BOTH networks
#    (the default one for db, the dokploy one for the proxy) and db, migrate and
#    seed belong only to the default one. A service that declares `networks:`
#    joins ONLY those, so getting this wrong is silent in the file and loud at
#    runtime; and db in the proxy's network would be reachable by every other
#    app on that host. ADR 0028.
	@for s in api web; do \
		nets=$$(docker inspect $$($(COMPOSE) ps -q $$s) \
			--format '{{range $$k, $$v := .NetworkSettings.Networks}}{{$$k}} {{end}}'); \
		case " $$nets" in *" $(DOKPLOY_NETWORK) "*) ;; \
			*) printf '  ✗ %s is not in %s — traefik cannot reach it: %s\n' "$$s" '$(DOKPLOY_NETWORK)' "$$nets"; exit 1 ;; esac; \
		case " $$nets" in *"_default "*) ;; \
			*) printf '  ✗ %s left the default network — it cannot reach db: %s\n' "$$s" "$$nets"; exit 1 ;; esac; \
	done
	@printf '  ✓ api and web are in both networks\n'
	@for s in db migrate seed; do \
		nets=$$(docker inspect $$($(COMPOSE) ps -aq $$s) \
			--format '{{range $$k, $$v := .NetworkSettings.Networks}}{{$$k}} {{end}}'); \
		case " $$nets" in *" $(DOKPLOY_NETWORK) "*) \
			printf '  ✗ %s is in %s — it must not be reachable from the proxy network\n' "$$s" '$(DOKPLOY_NETWORK)'; exit 1 ;; esac; \
	done
	@printf '  ✓ db, migrate and seed are not in $(DOKPLOY_NETWORK)\n'
# 8. The redeploy case, which is a different claim from the cold one: every
#    future deploy runs migrate and seed against a populated volume.
	@$(TOPOLOGY_ENV) $(COMPOSE) up -d --wait --wait-timeout 180 api web >/dev/null \
		|| { printf '  ✗ the second up against a populated volume failed\n'; exit 1; }
	@printf '  ✓ up again on a populated volume — migrate and seed are idempotent\n'
	@$(COMPOSE) down --volumes >/dev/null 2>&1 || true
# 9. THE BROKEN CASE. The claim this phase makes is not "five containers start".
#    It is "the api never comes up against a database the migration did not
#    reach" — so break the migration on purpose and watch the api never exist.
	@MIGRATE_DATABASE_URL='postgres://nobody:wrong@db:5432/timseil?sslmode=disable' \
		$(TOPOLOGY_ENV) $(COMPOSE) up -d --wait --wait-timeout 90 api web >/dev/null 2>&1 \
		&& { printf '  ✗ a failed migration still brought the stack up\n'; exit 1; } || true
#    Compose CREATES the downstream containers before it evaluates the condition
#    and then never starts them, so "no container exists" would be the wrong
#    assertion — and a weaker one. What matters is that no api PROCESS ever ran
#    against the unmigrated database, which is what a zero StartedAt says.
	@[ -z "$$($(COMPOSE) ps -q api)" ] \
		|| { printf '  ✗ the api is running after a failed migration\n'; exit 1; }
	@started=$$(docker inspect $$($(COMPOSE) ps -aq api) --format '{{.State.StartedAt}}' 2>/dev/null); \
		[ "$$started" = "0001-01-01T00:00:00Z" ] \
			|| { printf '  ✗ the api process started anyway (StartedAt %s)\n' "$$started"; exit 1; }
	@printf '  ✓ a failed migration stops the deploy — the api process never ran\n'
	@$(COMPOSE) down --volumes --remove-orphans >/dev/null 2>&1 || true
	@printf '  ✓ make check-topology\n'

# F2's acceptance. Not in `make check` for the same reason check-topology and
# check-db are not: it needs Docker and a running stack. The flood half writes
# five gigabytes and is therefore never implied — you ask for it by name.
.PHONY: check-observability
check-observability: ## Metrics and logs arrive — add FLOOD=1 for the 5 GB limit run
	@tools/check-observability.sh $(if $(FLOOD),--flood,)

# F3, and it runs against the LAB rather than against `make prod`, because the
# traefik job needs a Traefik and the only one this repository owns is
# compose.lab.yaml's. Same script, third mode: six jobs up, every job carrying
# series, and the three recording rules answering with our services and nobody
# else's.
#
#     make rolling-lab && make load && make check-metrics
#
.PHONY: check-metrics
check-metrics: ## The F3 acceptance: six jobs, six with data, three rules — needs `make rolling-lab`
	@OBS_FILES='$(LAB_FILES)' tools/check-observability.sh --metrics

# F5, and it runs against the lab for the same reason check-metrics does — plus
# one of its own: it stops the Prometheus container mid-run, which is a thing to
# do to a laboratory and not to a host.
#
# WHY IT IS A TARGET AND NOT A PARAGRAPH IN THE RUNBOOK. The acceptance
# criterion of this phase is a sentence about what the site does when its
# measuring half is dead, and the only way to answer it is to kill the measuring
# half. Written down as steps, that is a thing somebody performs from memory at
# the end of a long evening; as a command it is a thing that either passes or
# does not. The run puts Prometheus back, including after a Ctrl-C.
#
#     make rolling-lab && make load && make check-snapshots
#
.PHONY: check-snapshots
check-snapshots: ## The F5 acceptance: a dead Prometheus leaves the page honest — needs `make rolling-lab`
	@OBS_FILES='$(LAB_FILES)' LAB_URL='$(LAB_URL)' tools/check-observability.sh --snapshots

# The load that gives the rules something to be a quantile OF. k6 as a throwaway
# container on the lab network, digest-pinned like every other foreign image
# here — the build plan puts k6 in L8 for the performance budget, and this is
# the same tool asked a much smaller question.
#
# WHY THIS IS A TARGET AND NOT A PARAGRAPH IN THE RUNBOOK. F3's acceptance is
# "a p95 that matches a k6 run", and the two numbers have to come from one
# command or the comparison is two people's memories. k6 prints its own
# http_req_duration p(95) at the end; `make check-metrics` prints Traefik's.
# They are not expected to be equal — see docs/runbooks/observability.md for
# what the difference is made of — and the run is honest about that rather than
# rounding it away.
K6_IMAGE := grafana/k6:1.8.1@sha256:23f2279054c3e01535455c4d92914a625df12aeb631ea0e3ea7a43f96bcbc843
K6_VUS   ?= 10
K6_DUR   ?= 60s

# THE TARGET IS THE NETWORK NAME, NOT $(LAB_URL). k6 runs in a container, so
# 127.0.0.1:8080 would be its own loopback. Going over dokploy-network to the
# proxy also happens to be the closer analogue of production, where the client
# is never on the same host as the socket — and it takes the published-port hop
# out of a number that is about to be compared with Traefik's own.
.PHONY: load
load: ## Push k6 load through the lab proxy — needs `make rolling-lab`
	@printf 'load  %s VUs for %s through the lab proxy\n' '$(K6_VUS)' '$(K6_DUR)'
	@docker run --rm -i --network $(DOKPLOY_NETWORK) \
		-e K6_VUS='$(K6_VUS)' -e K6_DURATION='$(K6_DUR)' \
		-e K6_BASE='http://traefik:8080' \
		$(K6_IMAGE) run - < tools/load.js

# ---------------------------------------------------------------- placeholders

.PHONY: e2e
# The rig the build plan asks for before H1, and the window three measurements
# from stage G were waiting in (#236).
#
# It builds and starts a PRODUCTION server, not `next dev`. That is a decision
# with a reason rather than caution: `cacheComponents: true` keeps up to three
# routes mounted and merely hidden, and that behaviour only exists in a
# production build — the `<Activity>` question cannot be asked of a dev server.
# playwright.config.ts carries the whole argument.
#
# NOT in `make check`, and not in the pipeline yet. It downloads a browser, it
# builds the app, and it takes minutes rather than seconds; wiring it into CI is
# a decision about runner time that belongs to H1, where the sheet comparison
# gives it something to earn.
e2e: ## Playwright: touch targets, the mobile menu, reduced motion, axe — stage H
	@printf 'e2e\n'
	@[ -d web/node_modules ] || { printf '  ✗ web/node_modules is missing — run: make deps\n'; exit 1; }
# The browser is not a dependency npm installs; it is a download Playwright
# manages. Saying which command fixes it beats a stack trace from deep inside
# the runner.
	@cd web && npx playwright install --dry-run chromium >/dev/null 2>&1 || { \
		printf '  ✗ no chromium — run: cd web && npx playwright install chromium\n'; exit 1; }
	@cd web && npx playwright test $(E2E_ARGS)

# The sheets pull react@18.3.1 and @babel/standalone from unpkg at runtime, so
# this needs network: with unpkg blocked, <x-dc> is never replaced and the page
# stays dark. It does NOT need a server to render at all — file:// works,
# measured headless against http://, contrary to build plan 6.2. The server is
# here for a stable URL that no absolute machine path leaks into, which is what
# the Playwright comparison from H1 hangs on. The version is pinned so two
# sessions see the same server.
#
# The port check is ours because serve's --no-port-switching does not work in
# 14.2.5: with 4000 taken it moves to a random port and still reports success.
# A session would then read localhost:4000 and review whatever else answers.
.PHONY: design
design: ## Serve the read-only design handoff on port 4000
	@if command -v ss >/dev/null 2>&1 && ss -ltnH 2>/dev/null | grep -q ':4000[[:space:]]'; then \
		printf '  ✗ port 4000 is in use — stop that server first.\n'; \
		printf '    serve would move to a random port without saying so.\n'; \
		exit 1; \
	fi
	@npx --yes serve@14.2.5 docs/design -l 4000 --no-clipboard
