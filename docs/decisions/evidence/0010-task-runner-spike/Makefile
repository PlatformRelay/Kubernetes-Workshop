.DEFAULT_GOAL := help
.PHONY: help preflight up down doctor profile args

help:
	@printf '%s\n' 'up down doctor profile args'

preflight:
	@test -f .ready || { echo 'missing .ready' >&2; exit 1; }

up: preflight
	@./runner.sh up

down:
	@./runner.sh down

doctor:
	@./runner.sh doctor

profile: up doctor

args:
	@./runner.sh args $(ARGS)
