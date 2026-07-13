#!/usr/bin/env bash
# infra/doctor.sh — is this machine lab-ready? (ADR 0006)
#
# Checks, in dependency order:
#   1. a container engine (docker or podman) is reachable
#   2. kind is installed (version compared against the pin — WARN on drift)
#   3. kubectl is installed (version compared against the pin — WARN on drift)
#   4. the workshop kind cluster exists
#   5. the cluster answers the API (kubectl cluster-info)
#   6. every node is Ready
#   7. a short-lived smoke Pod runs to completion and is cleaned up
#
# Never prompts (it is a check script), so WORKSHOP_NONINTERACTIVE is
# honoured trivially; set it anyway for symmetry with the other tooling.
# Exit code: 0 when nothing FAILed (WARNs allowed), 1 otherwise.

set -u

WORKSHOP_NONINTERACTIVE="${WORKSHOP_NONINTERACTIVE:-1}"
export WORKSHOP_NONINTERACTIVE

script_dir="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=versions.env disable=SC1091
. "$script_dir/versions.env"

pass_count=0
warn_count=0
fail_count=0

pass() { pass_count=$((pass_count + 1)); echo "[PASS] $1"; }
warn() { warn_count=$((warn_count + 1)); echo "[WARN] $1"; }
fail() { fail_count=$((fail_count + 1)); echo "[FAIL] $1"; }

summary_and_exit() {
  echo ""
  echo "doctor: ${pass_count} passed, ${warn_count} warnings, ${fail_count} failed"
  if [ "$fail_count" -gt 0 ]; then
    exit 1
  fi
  exit 0
}

kube_ctx="kind-${WORKSHOP_CLUSTER_NAME}"

# 1. container engine ---------------------------------------------------------
engine=""
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  engine="docker"
elif command -v podman >/dev/null 2>&1 && podman info >/dev/null 2>&1; then
  engine="podman"
fi
if [ -n "$engine" ]; then
  pass "container engine reachable ($engine)"
else
  fail "no container engine reachable — start Docker Desktop / Podman machine"
  summary_and_exit
fi

# 2. kind binary + version vs pin --------------------------------------------
if command -v kind >/dev/null 2>&1; then
  kind_actual="$(kind version 2>/dev/null | awk '{print $2}')"
  if [ "$kind_actual" = "$KIND_VERSION" ]; then
    pass "kind $kind_actual matches pin ($KIND_VERSION)"
  else
    warn "kind is $kind_actual but the workshop is tested with $KIND_VERSION (infra/versions.env)"
  fi
else
  fail "kind not found on PATH — install kind $KIND_VERSION"
  summary_and_exit
fi

# 3. kubectl binary + version vs pin ------------------------------------------
if command -v kubectl >/dev/null 2>&1; then
  kubectl_actual="$(kubectl version --client 2>/dev/null | awk '/Client Version/{print $3}')"
  if [ "$kubectl_actual" = "$KUBECTL_VERSION" ]; then
    pass "kubectl $kubectl_actual matches pin ($KUBECTL_VERSION)"
  else
    warn "kubectl is ${kubectl_actual:-unknown} but the workshop is tested with $KUBECTL_VERSION (infra/versions.env)"
  fi
else
  fail "kubectl not found on PATH — install kubectl $KUBECTL_VERSION"
  summary_and_exit
fi

# 4. cluster exists ------------------------------------------------------------
if kind get clusters 2>/dev/null | grep -qx "$WORKSHOP_CLUSTER_NAME"; then
  pass "kind cluster '$WORKSHOP_CLUSTER_NAME' exists"
else
  fail "kind cluster '$WORKSHOP_CLUSTER_NAME' not found — run: make kind-up"
  summary_and_exit
fi

# 5. cluster reachable ----------------------------------------------------------
if kubectl cluster-info --context "$kube_ctx" >/dev/null 2>&1; then
  pass "cluster answers the API (context $kube_ctx)"
else
  fail "cluster '$WORKSHOP_CLUSTER_NAME' is not reachable — panic reset: make kind-down && make kind-up"
  summary_and_exit
fi

# 6. nodes Ready ----------------------------------------------------------------
node_states="$(kubectl --context "$kube_ctx" get nodes \
  -o jsonpath='{range .items[*]}{.status.conditions[?(@.type=="Ready")].status}{"\n"}{end}' 2>/dev/null)"
total=0
ready=0
for s in $node_states; do
  total=$((total + 1))
  if [ "$s" = "True" ]; then
    ready=$((ready + 1))
  fi
done
if [ "$total" -gt 0 ] && [ "$ready" -eq "$total" ]; then
  pass "all nodes Ready ($ready/$total)"
else
  fail "nodes Ready: $ready/$total — inspect: kubectl --context $kube_ctx describe nodes"
  summary_and_exit
fi

# 7. smoke Pod -------------------------------------------------------------------
smoke_pod="workshop-doctor-smoke"
cleanup_smoke() {
  kubectl --context "$kube_ctx" delete pod "$smoke_pod" \
    --ignore-not-found --wait=false >/dev/null 2>&1
}
trap cleanup_smoke EXIT

if kubectl --context "$kube_ctx" run "$smoke_pod" \
  --image="$WORKSHOP_SMOKE_IMAGE" --restart=Never \
  --command -- /agnhost help >/dev/null 2>&1 &&
  kubectl --context "$kube_ctx" wait \
    --for=jsonpath='{.status.phase}'=Succeeded "pod/$smoke_pod" \
    --timeout=60s >/dev/null 2>&1; then
  pass "smoke Pod ran to completion and was cleaned up"
else
  fail "smoke Pod did not complete — the cluster cannot run workloads; panic reset: make kind-down && make kind-up"
fi
cleanup_smoke

summary_and_exit
