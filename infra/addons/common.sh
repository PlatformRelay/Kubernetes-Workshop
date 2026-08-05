#!/usr/bin/env bash
# Shared helpers for workshop add-on profiles (US-GATEWAY-1 + US-ADDONS-1).
# shellcheck shell=bash

set -euo pipefail

ADDONS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$ADDONS_DIR/../.." && pwd)"

# shellcheck source=../versions.env disable=SC1091
. "$REPO_ROOT/infra/versions.env"

WORKSHOP_PART_OF="${WORKSHOP_PART_OF:-k8s-workshop}"
WORKSHOP_MANAGED_BY="${WORKSHOP_MANAGED_BY:-workshop-infra}"
WORKSHOP_LABEL_PREFIX="${WORKSHOP_LABEL_PREFIX:-workshop.k8s-labs.dev}"
ROUTING_MARKER_CM="${ROUTING_MARKER_CM:-workshop-routing-profile}"
ADDON_MARKER_PREFIX="${ADDON_MARKER_PREFIX:-workshop-addon}"

ENVOY_NS="${ENVOY_NS:-envoy-gateway-system}"
CONTOUR_NS="${CONTOUR_NS:-projectcontour}"
ENVOY_GATEWAYCLASS_NAME="${ENVOY_GATEWAYCLASS_NAME:-eg}"
ENVOY_CONTROLLER_NAME="${ENVOY_CONTROLLER_NAME:-gateway.envoyproxy.io/gatewayclass-controller}"
CONTOUR_INGRESS_CONTROLLER="${CONTOUR_INGRESS_CONTROLLER:-projectcontour.io/ingress-controller}"
CONTOUR_INGRESSCLASS_NAME="${CONTOUR_INGRESSCLASS_NAME:-contour}"

METRICS_SERVER_NS="${METRICS_SERVER_NS:-kube-system}"
ARGOCD_NS="${ARGOCD_NS:-argocd}"
FLUX_NS="${FLUX_NS:-flux-system}"
CERT_MANAGER_NS="${CERT_MANAGER_NS:-cert-manager}"
MONITORING_NS="${MONITORING_NS:-monitoring}"
# Day-3 GitOps tool (US-GITOPS-CHOICE-D). Aligns with deck --gitops naming.
GITOPS_TOOL="${GITOPS_TOOL:-argocd}"

READY_TIMEOUT_DEFAULT="${WORKSHOP_ADDON_READY_TIMEOUT:-300s}"

addons_say() { printf '%s\n' "$*"; }
addons_ok() { printf '[OK] %s\n' "$*"; }
addons_err() { printf '[FAIL] %s\n' "$*" >&2; }
addons_warn() { printf '[WARN] %s\n' "$*" >&2; }

kubectl_bin() {
  command -v kubectl
}

ns_exists() {
  local name="$1"
  [ -n "$(kubectl get ns "$name" --ignore-not-found -o name 2>/dev/null || true)" ]
}

addon_marker_name() {
  local addon="$1"
  printf '%s-%s\n' "$ADDON_MARKER_PREFIX" "$addon"
}

read_profile_marker() {
  local ns="$1"
  kubectl -n "$ns" get configmap "$ROUTING_MARKER_CM" \
    -o jsonpath='{.data.profile}' 2>/dev/null || true
}

apply_profile_marker() {
  local ns="$1" profile="$2" section="$3"
  kubectl apply -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${ROUTING_MARKER_CM}
  namespace: ${ns}
  labels:
    app.kubernetes.io/name: ${profile}
    app.kubernetes.io/part-of: ${WORKSHOP_PART_OF}
    app.kubernetes.io/managed-by: ${WORKSHOP_MANAGED_BY}
    ${WORKSHOP_LABEL_PREFIX}/profile: ${profile}
    ${WORKSHOP_LABEL_PREFIX}/section: ${section}
    ${WORKSHOP_LABEL_PREFIX}/lane: kind
data:
  profile: ${profile}
EOF
}

delete_profile_marker() {
  local ns="$1"
  kubectl -n "$ns" delete configmap "$ROUTING_MARKER_CM" --ignore-not-found >/dev/null 2>&1 || true
}

read_addon_marker() {
  local ns="$1" addon="$2"
  kubectl -n "$ns" get configmap "$(addon_marker_name "$addon")" \
    -o jsonpath='{.data.addon}' 2>/dev/null || true
}

addon_is_installed() {
  local ns="$1" addon="$2"
  local marker
  marker="$(read_addon_marker "$ns" "$addon")"
  [ "$marker" = "$addon" ]
}

apply_addon_marker() {
  local ns="$1" addon="$2" section="$3"
  local cm
  cm="$(addon_marker_name "$addon")"
  kubectl apply -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${cm}
  namespace: ${ns}
  labels:
    app.kubernetes.io/name: ${addon}
    app.kubernetes.io/part-of: ${WORKSHOP_PART_OF}
    app.kubernetes.io/managed-by: ${WORKSHOP_MANAGED_BY}
    ${WORKSHOP_LABEL_PREFIX}/addon: ${addon}
    ${WORKSHOP_LABEL_PREFIX}/section: ${section}
    ${WORKSHOP_LABEL_PREFIX}/lane: kind
data:
  addon: ${addon}
EOF
}

delete_addon_marker() {
  local ns="$1" addon="$2"
  kubectl -n "$ns" delete configmap "$(addon_marker_name "$addon")" --ignore-not-found >/dev/null 2>&1 || true
}

ensure_namespace() {
  local ns="$1"
  kubectl create namespace "$ns" --dry-run=client -o yaml | kubectl apply -f -
}

wait_deploy_available() {
  local ns="$1" deploy="$2"
  local timeout="${3:-$READY_TIMEOUT_DEFAULT}"
  kubectl -n "$ns" wait --timeout="$timeout" --for=condition=Available "deployment/${deploy}"
}

apply_remote_or_skip() {
  local url="$1"
  shift
  if [ "${WORKSHOP_ADDON_SKIP_REMOTE:-0}" = "1" ]; then
    addons_say "skip remote apply (${url}) — WORKSHOP_ADDON_SKIP_REMOTE=1"
    # Record intent for bats without fetching.
    kubectl apply --dry-run=client -f - <<EOF >/dev/null 2>&1 || true
apiVersion: v1
kind: ConfigMap
metadata:
  name: workshop-addon-skip-remote
  namespace: default
  annotations:
    workshop.k8s-labs.dev/skipped-url: "${url}"
data:
  skipped: "1"
EOF
    return 0
  fi
  kubectl apply "$@" -f "$url"
}

# Interactive gum choose is progressive enhancement; flags/non-TTY identical.
addons_use_gum() {
  [ "${WORKSHOP_NONINTERACTIVE:-0}" = "1" ] && return 1
  [ "${CI:-}" = "true" ] && return 1
  [ -t 0 ] || return 1
  command -v gum >/dev/null 2>&1
}
