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
check: check-tools check-node check-repo check-todo check-compose check-migrations check-go check-web check-contract ## Run every check that applies today
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

.PHONY: check-migrations
check-migrations: ## Migration hygiene and the invariants that are greppable
	@printf 'migrations\n'
	@tools/check-migrations.sh

.PHONY: check-go
check-go: ## gofmt, go vet, go test
	@printf 'go\n'
# gofmt -l prints the offenders and exits 0 — on its own it is a check that
# reports and then lets everything through. The emptiness of its output is the
# assertion, so that is what gets tested.
	@cd api && bad=$$(gofmt -l .); \
		[ -z "$$bad" ] || { printf '  ✗ not gofmt-clean:\n'; printf '%s\n' "$$bad" | sed 's/^/    /'; exit 1; }; \
		go vet ./... && go test ./... && printf '  ✓ gofmt, vet, test\n'

.PHONY: check-web
check-web: ## Typecheck, lint, unit tests
	@printf 'web\n'
	@cd web && npm run typecheck --silent && npm run lint --silent && npm test --silent

GENERATED := contract/openapi.public.yaml api/internal/httpx/assets/openapi.yaml \
             api/internal/httpx/gen.go web/lib/api/schema.d.ts

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
	@[ -f contract/openapi.yaml ] || exit 0; \
		before=$$(cat $(GENERATED) 2>/dev/null | sha256sum); \
		$(MAKE) --no-print-directory gen >/dev/null || exit 1; \
		after=$$(cat $(GENERATED) 2>/dev/null | sha256sum); \
		[ "$$before" = "$$after" ] || { \
			printf '  ✗ generated files are stale — run make gen and commit the result\n'; \
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
.PHONY: gen
gen: ## Generate Go and TS types from the contract
	@printf 'gen\n'
# Both tools narrate to stderr on success. Swallowing that keeps `make check`
# readable; keeping it on failure is why the output is captured rather than
# discarded outright.
	@cd web && out=$$(npx --no-install redocly bundle public --config ../redocly.yaml \
		--remove-unused-components -o ../contract/openapi.public.yaml 2>&1) \
		|| { printf '%s\n' "$$out" | sed 's/^/    /'; exit 1; }
	@cp contract/openapi.public.yaml api/internal/httpx/assets/openapi.yaml
	@cd api && go tool oapi-codegen -config oapi-codegen.yaml ../contract/openapi.yaml
	@cd web && out=$$(npx --no-install openapi-typescript ../contract/openapi.yaml \
		-o lib/api/schema.d.ts 2>&1) \
		|| { printf '%s\n' "$$out" | sed 's/^/    /'; exit 1; }
	@printf '  ✓ public bundle, go types, ts types\n'

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

# The acceptance criterion of this phase, and it needs a real Postgres: three
# up/down/up cycles plus every invariant proven against its broken case.
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
	@$(COMPOSE_DEV) run --rm --entrypoint go migrate test -tags=db -count=1 ./...

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
