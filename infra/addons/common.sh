#!/usr/bin/env bash
# Shared helpers for workshop routing add-on profiles (US-GATEWAY-1).
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

ENVOY_NS="${ENVOY_NS:-envoy-gateway-system}"
CONTOUR_NS="${CONTOUR_NS:-projectcontour}"
ENVOY_GATEWAYCLASS_NAME="${ENVOY_GATEWAYCLASS_NAME:-eg}"
ENVOY_CONTROLLER_NAME="${ENVOY_CONTROLLER_NAME:-gateway.envoyproxy.io/gatewayclass-controller}"
CONTOUR_INGRESS_CONTROLLER="${CONTOUR_INGRESS_CONTROLLER:-projectcontour.io/ingress-controller}"
CONTOUR_INGRESSCLASS_NAME="${CONTOUR_INGRESSCLASS_NAME:-contour}"

addons_say() { printf '%s\n' "$*"; }
addons_ok() { printf '[OK] %s\n' "$*"; }
addons_err() { printf '[FAIL] %s\n' "$*" >&2; }

kubectl_bin() {
  command -v kubectl
}

ns_exists() {
  local name="$1"
  [ -n "$(kubectl get ns "$name" --ignore-not-found -o name 2>/dev/null || true)" ]
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
