# Workshop task entrypoint (ADR 0006) — thin verbs only; the logic lives in
# infra/. Versions come from the single pin file (ADR 0007).
#
#   make            # this help
#   make kind-up    # create the local kind cluster (idempotent)
#   make kind-down  # delete it (idempotent) — panic reset: kind-down && kind-up
#   make doctor     # check the environment is lab-ready

include infra/versions.env

.DEFAULT_GOAL := help
.PHONY: help kind-up kind-down doctor

help: ## Show this help
	@echo "Workshop environment — usage: make <verb>"
	@echo ""
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z0-9_-]+:.*## / {printf "  %-12s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

kind-up: ## Create the local kind cluster from infra/kind/cluster.yaml (idempotent)
	@if kind get clusters 2>/dev/null | grep -qx '$(WORKSHOP_CLUSTER_NAME)'; then \
		echo "kind cluster '$(WORKSHOP_CLUSTER_NAME)' already exists — nothing to do"; \
	else \
		kind create cluster --name '$(WORKSHOP_CLUSTER_NAME)' --config infra/kind/cluster.yaml --image '$(KIND_NODE_IMAGE)'; \
	fi

kind-down: ## Delete the local kind cluster (idempotent)
	@if kind get clusters 2>/dev/null | grep -qx '$(WORKSHOP_CLUSTER_NAME)'; then \
		kind delete cluster --name '$(WORKSHOP_CLUSTER_NAME)'; \
	else \
		echo "no cluster '$(WORKSHOP_CLUSTER_NAME)' — nothing to do"; \
	fi

doctor: ## Check the environment is lab-ready (engine, cluster, nodes, smoke Pod)
	@infra/doctor.sh
