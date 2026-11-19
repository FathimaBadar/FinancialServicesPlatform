.PHONY: help infra-up infra-down infra-init tb-start tb-stop tb-init tb-reset tb-clean backend-core backend-bff frontend-dev frontend-install test-e2e portal-publish clean pki docs-refresh docs-check docs-hook

help:
	@echo "FSP Phase-0 — available commands"
	@echo "  make infra-up      — start PostgreSQL (TigerBeetle runs on host)"
	@echo "  make infra-down    — stop PostgreSQL"
	@echo "  make tb-init       — format TigerBeetle data file"
	@echo "  make tb-start      — start TigerBeetle server (host binary)"
	@echo "  make tb-stop       — stop TigerBeetle server"
	@echo "  make tb-reset      — reset TigerBeetle data"
	@echo "  make backend-core  — run core service"
	@echo "  make backend-bff   — run BFF service"
	@echo "  make frontend-dev  — run React SPA dev server (bun)"
	@echo "  make frontend-install — install frontend deps (bun)"
	@echo "  make test-e2e      — run Playwright E2E tests (gap probes + onboarding chain)"
	@echo "  make portal-publish — publish a signed portal bundle four-eyes (PORTAL=admin default)"
	@echo "  make docs-refresh  — regenerate architecture doc artifacts (docs/generated)"
	@echo "  make docs-check    — fail if architecture artifacts are stale (CI gate)"
	@echo "  make docs-hook     — install pre-commit hook that regenerates docs on every commit"
	@echo "  make clean         — tear down containers and volumes"

infra-up:
	@docker compose -f infrastructure/docker-compose.yml up -d
	@echo "Waiting for services..."
	@sleep 3
	@docker compose -f infrastructure/docker-compose.yml ps

infra-down:
	@docker compose -f infrastructure/docker-compose.yml down

TB_BIN := infrastructure/bin/tigerbeetle
TB_DATA := infrastructure/tigerbeetle-data

$(TB_DATA):
	@mkdir -p $(TB_DATA)

infra-init: $(TB_DATA)

# --- TigerBeetle (runs as a host binary; avoids Docker seccomp/io_uring issues) ---

tb-init: $(TB_DATA)
	@$(TB_BIN) format --cluster=0 --replica=0 --replica-count=1 \
		$(TB_DATA)/0_0.tigerbeetle 2>/dev/null || echo "already formatted"

tb-start: tb-init
	@echo "Starting TigerBeetle on :3000 ..."
	@nohup $(TB_BIN) start --addresses=127.0.0.1:3000 $(TB_DATA)/0_0.tigerbeetle \
		> $(TB_DATA)/server.log 2>&1 & \
		echo "TigerBeetle pid $$!; log: infrastructure/tigerbeetle-data/server.log"

tb-stop:
	@pkill -f "tigerbeetle start" || true
	@echo "TigerBeetle stopped"

tb-reset: tb-stop
	@rm -rf $(TB_DATA)
	@mkdir -p $(TB_DATA)
	@$(TB_BIN) format --cluster=0 --replica=0 --replica-count=1 $(TB_DATA)/0_0.tigerbeetle
	@echo "TigerBeetle data reset; run 'make tb-start'"

docs-refresh:
	@node docs/gen/refresh.cjs

docs-check:
	@node docs/gen/refresh.cjs --check

docs-hook:
	@git config core.hooksPath .githooks
	@echo "pre-commit hook installed: docs/generated/* regenerate and stage on every commit"

tb-clean: tb-reset

backend-core:
	@cd backend/core && ../gradlew bootRun


backend-idp:
	@cd backend/idp && ../gradlew bootRun

backend-gateway:
	@cd backend/gateway && ../gradlew bootRun

backend-bff:
	@cd backend/bff && ../gradlew bootRun

backend-plugin-kyc:
	@cd backend/plugins/kyc && ../../gradlew bootRun

backend-plugin-inventory:
	@cd backend/plugins/inventory && ../../gradlew bootRun

backend-plugin-dbs:
	@./infrastructure/bin/init-plugin-dbs.sh

frontend-dev:
	@cd frontend && bun run dev

test-e2e:
	@cd frontend && bunx playwright test

# GAP-7: publish a SIGNED portal bundle through the real four-eyes builder flow
# (platform-admin saves + submits, admin-checker approves; core signs). Idempotent.
# Usage: make portal-publish [PORTAL=admin] [FSP_PUBLISH_FORCE=1]. Needs the dev stack up.
PORTAL ?= admin
portal-publish:
	@cd frontend && PORTAL=$(PORTAL) bunx playwright test -c playwright.setup.config.ts

frontend-install:
	@cd frontend && bun install

clean:
	@docker compose -f infrastructure/docker-compose.yml down -v
	@-make tb-stop

stop-all: tb-stop infra-down
	@echo "All services stopped"

pki:
	@bash infrastructure/pki/dev-pki.sh
	@echo "dev PKI regenerated in infrastructure/pki/dev (gitignored)"

stack-up:
	docker compose -f infrastructure/docker-compose.yml --profile stack up -d --build core idp gateway bff

stack-down:
	docker compose -f infrastructure/docker-compose.yml --profile stack down
