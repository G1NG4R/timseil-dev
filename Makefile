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
check: check-tools check-node check-versions check-repo check-todo check-compose check-dockerfiles check-migrations check-stack check-go check-lint check-web check-contract ## Run every check that applies today
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

.PHONY: check-go
check-go: ## gofmt, go vet, go test
	@printf 'go\n'
# gofmt -l prints the offenders and exits 0 — on its own it is a check that
# reports and then lets everything through. The emptiness of its output is the
# assertion, so that is what gets tested.
	@cd api && bad=$$(gofmt -l .); \
		[ -z "$$bad" ] || { printf '  ✗ not gofmt-clean:\n'; printf '%s\n' "$$bad" | sed 's/^/    /'; exit 1; }; \
		go vet ./... && go test ./... && printf '  ✓ gofmt, vet, test\n'

.PHONY: check-lint
check-lint: ## golangci-lint over api/ — ruleset and exclusions in .golangci.yml
	@printf 'lint\n'
	@tools/check-lint.sh

.PHONY: check-web
check-web: ## Typecheck, lint, unit tests
	@printf 'web\n'
	@cd web && npm run typecheck --silent && npm run lint --silent && npm test --silent

GENERATED := contract/openapi.public.yaml api/internal/httpx/assets/openapi.yaml \
             api/internal/intake/testdata/openapi.yaml \
             api/internal/httpx/gen.go web/lib/api/schema.d.ts \
             api/migrations/testdata/skill_states.json \
             api/internal/seed/stack.gen.json \
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
# thirteen files from five sources now, and "something is stale" would send you
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

# ------------------------------------------------------------------- dev

COMPOSE_DEV := docker compose -f compose.dev.yaml

.PHONY: dev
dev: ## Start Postgres, API and web with hot reload
	@[ -f .env ] || { \
		printf '  ✗ no .env — the compose file has nothing to read.\n'; \
		printf '    run: cp .env.example .env\n'; \
		exit 1; \
	}
	$(COMPOSE_DEV) up --build

.PHONY: dev-down
dev-down: ## Stop the dev stack, keep the database
	$(COMPOSE_DEV) down

.PHONY: dev-reset
dev-reset: ## Stop the dev stack and drop the database volume
	$(COMPOSE_DEV) down --volumes

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
	@printf '  ✓ public bundle, go types, sql types, ts types, skill states, stack manifest\n'

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

# The production images. Local tags only — pushing to GHCR is E4's job and it
# happens in GitHub Actions, never here and never on the VPS.
IMAGE_API := timseil-api
IMAGE_WEB := timseil-web

# compose.yaml names the images as GHCR does, because that is what runs on the
# VPS and a production file that named something else would be describing a
# deployment nobody has. So the local build carries both tags: the short one for
# `docker images` and the registry one so `make check-topology` can run the real
# file without a registry and without weakening its `image:` lines.
REGISTRY := ghcr.io/g1ng4r

# What the linker stamps into the binary, and therefore what /api/health says.
# `git describe` names a tag when there is one and falls back to the short sha;
# --dirty says out loud that this build is not the commit it names, which is the
# same claim internal/buildinfo makes about a build from a working tree.
#
# Seven characters because that is buildinfo's shaLength and the tag scheme E4
# will push under. A second spelling of the same number is a second number.
GIT_SHA := $(shell git rev-parse --short=7 HEAD 2>/dev/null || echo unknown)
VERSION := $(shell git describe --tags --always --dirty 2>/dev/null || echo dev)
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

# The one handgriff D3 costs, and it is here rather than in your head.
#
# compose.yaml declares dokploy-network as `external:` because on the VPS it is
# Dokploy's — Traefik lives in it and nothing in this repository may create or
# own it there. On any other machine it simply does not exist, and compose
# refuses to start rather than inventing it. That would break `make prod` and
# `make check-topology`, and "up from nothing without a handgriff" is D2's
# acceptance criterion, so the handgriff goes in the Makefile instead. ADR 0028.
.PHONY: require-network
require-network:
	@docker network inspect $(DOKPLOY_NETWORK) >/dev/null 2>&1 || { \
		printf '  · creating %s — on the VPS this one is Dokploy'"'"'s, here it is a local stand-in\n' \
			'$(DOKPLOY_NETWORK)'; \
		docker network create $(DOKPLOY_NETWORK) >/dev/null; }

.PHONY: prod
prod: require-images require-network ## Run the production compose locally — needs `make images` first
	@$(TOPOLOGY_ENV) $(COMPOSE) up -d --wait api web

.PHONY: prod-down
prod-down: ## Stop the production stack, keep the database
	@$(COMPOSE) down

# Drops the volume, never the network: on the VPS that one is Dokploy's and
# taking it away would unroute every other app on the host.
.PHONY: prod-reset
prod-reset: ## Stop it and drop the database volume
	@$(COMPOSE) down --volumes

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

# ---------------------------------------------------------------- placeholders

.PHONY: e2e
e2e: ## Playwright end-to-end, a11y and visual regression — stage H
	@printf 'make e2e arrives before H1 (playwright at 1440·1081·1079·1024·899·719·390).\n'

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
