# Workshop task entrypoint (ADR 0006) — thin verbs only; the logic lives in
# infra/. Versions come from the single pin file (ADR 0007).
#
#   make            # this help
#   make kind-up    # create the local kind cluster (idempotent)
#   make kind-down  # delete it (idempotent) — panic reset: kind-down && kind-up
#   make doctor     # check the environment is lab-ready
#   make profile-day-1 / profile-day-2 / profile-day-3  # opt-in day composers
#   make profile-gateway-envoy / profile-ingress-contour  # mutually exclusive

include infra/versions.env

.DEFAULT_GOAL := help
.PHONY: help kind-up kind-down doctor \
	profile-day-1 profile-day-2 profile-day-3 \
	profile-day-1-down profile-day-2-down profile-day-3-down \
	profile-gateway-envoy profile-ingress-contour \
	profile-gateway-envoy-down profile-ingress-contour-down \
	profile-transition profile-status

help: ## Show this help
	@echo "Workshop environment — usage: make <verb>"
	@echo ""
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z0-9_-]+:.*## / {printf "  %-28s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

kind-up: ## Create the local kind cluster from infra/kind/cluster.yaml (idempotent)
	@infra/kind/cluster.sh up

kind-down: ## Delete the local kind cluster (idempotent)
	@infra/kind/cluster.sh down

doctor: ## Check the environment is lab-ready (engine, cluster, nodes, smoke Pod)
	@infra/doctor.sh

profile-day-1: ## Install day-1 profile (Contour for S08; opt-in)
	@infra/addons/profile.sh day-1

profile-day-2: ## Install day-2 profile (Envoy Gateway + metrics-server; opt-in)
	@infra/addons/profile.sh day-2

profile-day-3: ## Install day-3 profile (Argo CD default + cert-manager + kube-prometheus; GITOPS=flux for Flux)
	@infra/addons/profile.sh day-3 $(if $(GITOPS),--gitops $(GITOPS),)

profile-day-1-down: ## Tear down day-1 composed components
	@infra/addons/profile.sh day-1 --teardown

profile-day-2-down: ## Tear down day-2 composed components
	@infra/addons/profile.sh day-2 --teardown

profile-day-3-down: ## Tear down day-3 composed components (GITOPS=flux to match install)
	@infra/addons/profile.sh day-3 $(if $(GITOPS),--gitops $(GITOPS),) --teardown

profile-gateway-envoy: ## Install Envoy Gateway profile (S09; exclusive vs Contour)
	@infra/addons/gateway-envoy.sh install

profile-ingress-contour: ## Install Contour profile (S08 optional; exclusive vs Envoy)
	@infra/addons/ingress-contour.sh install

profile-gateway-envoy-down: ## Tear down workshop-owned Envoy Gateway only
	@infra/addons/gateway-envoy.sh uninstall

profile-ingress-contour-down: ## Tear down workshop-owned Contour only
	@infra/addons/ingress-contour.sh uninstall

# TO=gateway-envoy|ingress-contour|argocd|flux — explicit mutual-exclusion transition
profile-transition: ## Transition routing or GitOps tools (TO=gateway-envoy|ingress-contour|argocd|flux)
	@test -n "$(TO)" || (echo "usage: make profile-transition TO=gateway-envoy|ingress-contour|argocd|flux" >&2; exit 2)
	@infra/addons/profile.sh transition "$(TO)"

profile-status: ## Show active routing profile and installed add-ons
	@infra/addons/profile.sh status
