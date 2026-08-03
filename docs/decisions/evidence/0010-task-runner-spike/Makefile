.DEFAULT_GOAL := help
.PHONY: help preflight up down doctor addon-gateway-api addon-metrics-server \
	profile-observability args tool-version

help:
	@printf '%s\n' 'commands: help up down doctor profile-observability args tool-version'

preflight:
	@test -f .ready || { echo 'missing .ready' >&2; exit 1; }

up: preflight
	@./runner.sh up

down:
	@./runner.sh down

doctor:
	@./runner.sh doctor

addon-gateway-api:
	@./runner.sh addon-gateway-api

addon-metrics-server:
	@./runner.sh addon-metrics-server

profile-observability: preflight
	@$(MAKE) --no-print-directory up
	@$(MAKE) --no-print-directory addon-gateway-api
	@$(MAKE) --no-print-directory addon-metrics-server
	@$(MAKE) --no-print-directory doctor

args:
	@./args-from-file.sh "$${WORKSHOP_ARGS_FILE:?WORKSHOP_ARGS_FILE is required}"

tool-version:
	@./tool-version.sh
