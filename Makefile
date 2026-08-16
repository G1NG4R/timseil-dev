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
check: check-repo check-todo check-go check-web check-contract ## Run every check that applies today
	@printf '\n✓ make check\n'

.PHONY: check-fast
check-fast: ## Hygiene on staged files only (called by the pre-commit hook)
	@tools/check-repo.sh --staged

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

.PHONY: design
design: ## Serve the read-only design handoff on port 4000
	@npx --yes serve docs/design -p 4000
