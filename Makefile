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
check: check-tools check-node check-repo check-todo check-go check-web check-contract ## Run every check that applies today
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

.PHONY: check-go
check-go: ## gofmt, go vet, go test (from A4)
	@printf 'go\n'
	@[ -d api ] || { printf '  – skip: api/ does not exist yet (phase A4)\n'; exit 0; }; \
		cd api && gofmt -l . && go vet ./... && go test ./...

.PHONY: check-web
check-web: ## Typecheck, lint, unit tests (from G1)
	@printf 'web\n'
	@[ -d web ] || { printf '  – skip: web/ does not exist yet (phase G1)\n'; exit 0; }; \
		cd web && npm run typecheck && npm run lint && npm test

.PHONY: check-contract
check-contract: ## Validate the OpenAPI contract and check for codegen drift (from B1)
	@printf 'contract\n'
	@[ -f contract/openapi.yaml ] || { printf '  – skip: contract/openapi.yaml does not exist yet (phase B1)\n'; exit 0; }; \
		$(MAKE) --no-print-directory gen && git diff --exit-code

# ---------------------------------------------------------------- placeholders

.PHONY: dev
dev: ## Start Postgres, API and web with hot reload — phase A4
	@printf 'make dev arrives in phase A4 (compose.dev.yaml: postgres + air + next dev).\n'

.PHONY: gen
gen: ## Generate Go and TS types from the contract — phase B1
	@printf 'make gen arrives in phase B1 (oapi-codegen + openapi-typescript).\n'

.PHONY: migrate
migrate: ## Run goose migrations — phase B2
	@printf 'make migrate arrives in phase B2 (goose, user timseil_migrate).\n'

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
