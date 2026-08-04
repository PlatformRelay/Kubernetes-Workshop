#!/usr/bin/env bash
# gateway-envoy profile — Gateway API CRDs + Envoy Gateway (canonical for S09).
# Mutually exclusive with ingress-contour (US-GATEWAY-1).
#
#   gateway-envoy.sh install|uninstall|status

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh disable=SC1091
. "$SCRIPT_DIR/common.sh"
# shellcheck source=routing-preflight.sh disable=SC1091
. "$SCRIPT_DIR/routing-preflight.sh"

PROFILE="gateway-envoy"
READY_TIMEOUT="${WORKSHOP_ADDON_READY_TIMEOUT:-300s}"
GATEWAY_API_URL="https://github.com/kubernetes-sigs/gateway-api/releases/download/${GATEWAY_API_VERSION}/standard-install.yaml"
ENVOY_GATEWAY_URL="https://github.com/envoyproxy/gateway/releases/download/${ENVOY_GATEWAY_VERSION}/install.yaml"

apply_gatewayclass_eg() {
  kubectl apply -f - <<EOF
apiVersion: gateway.networking.k8s.io/v1
kind: GatewayClass
metadata:
  name: ${ENVOY_GATEWAYCLASS_NAME}
  labels:
    app.kubernetes.io/name: ${PROFILE}
    app.kubernetes.io/part-of: ${WORKSHOP_PART_OF}
    app.kubernetes.io/managed-by: ${WORKSHOP_MANAGED_BY}
    ${WORKSHOP_LABEL_PREFIX}/profile: ${PROFILE}
    ${WORKSHOP_LABEL_PREFIX}/section: s09
spec:
  controllerName: ${ENVOY_CONTROLLER_NAME}
EOF
}

ensure_envoy_namespace() {
  kubectl create namespace "$ENVOY_NS" --dry-run=client -o yaml | kubectl apply -f -
}

cmd_status() {
  local active
  active="$(routing_detect)"
  addons_say "active=${active}"
  if [ "$active" = "$PROFILE" ]; then
    addons_ok "profile ${PROFILE} is active (GatewayClass ${ENVOY_GATEWAYCLASS_NAME})"
    return 0
  fi
  addons_say "profile ${PROFILE} is not active"
  return 1
}

cmd_install() {
  local active
  active="$(routing_detect)"
  if [ "$active" = "$PROFILE" ]; then
    addons_ok "already installed — profile ${PROFILE} is active (idempotent)"
    return 0
  fi

  routing_preflight_check "$PROFILE" || return 1

  addons_say "installing profile ${PROFILE} (Gateway API ${GATEWAY_API_VERSION} + Envoy Gateway ${ENVOY_GATEWAY_VERSION})"

  if [ "${WORKSHOP_ADDON_SKIP_REMOTE:-0}" = "1" ]; then
    ensure_envoy_namespace
    apply_profile_marker "$ENVOY_NS" "$PROFILE" s09
    # Simulate GatewayClass presence for subsequent detects in skip mode.
    apply_gatewayclass_eg 2>/dev/null || true
    addons_ok "profile ${PROFILE} installed (skip-remote mode)"
    return 0
  fi

  # Install standard-channel CRDs once. Re-applying them re-creates the
  # safe-upgrades ValidatingAdmissionPolicy that blocks Envoy Gateway's
  # bundled (standard+experimental) CRD overlay.
  if kubectl get crd gateways.gateway.networking.k8s.io >/dev/null 2>&1; then
    addons_say "Gateway API CRDs already present — skipping ${GATEWAY_API_VERSION} re-apply"
  else
    apply_remote_or_skip "$GATEWAY_API_URL" --server-side --force-conflicts
  fi
  # Clear the channel-guard VAP so Envoy Gateway's install.yaml can apply.
  # EG re-applies the policy afterward. Short names (not type/name URLs) for
  # broader kubectl compatibility.
  kubectl delete validatingadmissionpolicybinding safe-upgrades.gateway.networking.k8s.io --ignore-not-found
  kubectl delete validatingadmissionpolicy safe-upgrades.gateway.networking.k8s.io --ignore-not-found
  apply_remote_or_skip "$ENVOY_GATEWAY_URL" --server-side --force-conflicts

  kubectl -n "$ENVOY_NS" wait --timeout="$READY_TIMEOUT" \
    --for=condition=Available deployment/envoy-gateway

  apply_gatewayclass_eg
  apply_profile_marker "$ENVOY_NS" "$PROFILE" s09

  addons_ok "profile ${PROFILE} ready — use gatewayClassName: ${ENVOY_GATEWAYCLASS_NAME}"
}

cmd_uninstall() {
  local marker
  if ! ns_exists "$ENVOY_NS"; then
    addons_ok "nothing to tear down — namespace ${ENVOY_NS} absent"
    return 0
  fi

  marker="$(read_profile_marker "$ENVOY_NS")"
  if [ "$marker" != "$PROFILE" ]; then
    addons_err "refusing teardown: ${ENVOY_NS} is foreign/unowned (marker='${marker:-none}')"
    addons_err "workshop uninstall only removes workshop-owned resources"
    return 1
  fi

  addons_say "tearing down workshop-owned profile ${PROFILE}"
  kubectl delete gatewayclass "$ENVOY_GATEWAYCLASS_NAME" --ignore-not-found >/dev/null 2>&1 || true
  delete_profile_marker "$ENVOY_NS"
  kubectl delete namespace "$ENVOY_NS" --ignore-not-found >/dev/null 2>&1 || true
  # Block until the namespace is gone so a subsequent Contour install does not
  # see a Terminating envoy-gateway-system and treat it as foreign-envoy.
  local waited=0
  while ns_exists "$ENVOY_NS"; do
    if [ "$waited" -ge 120 ]; then
      addons_err "namespace ${ENVOY_NS} still present after teardown — wait or recreate the kind cluster"
      return 1
    fi
    sleep 2
    waited=$((waited + 2))
  done

  # Preserve shared Gateway API CRDs — Contour does not need them, but other
  # labs / shared-cluster facilitators may. US-GATEWAY-1: scoped teardown.
  addons_ok "profile ${PROFILE} removed (Gateway API CRDs preserved)"
}

usage() {
  cat <<EOF
Usage: gateway-envoy.sh <install|uninstall|status>

Canonical S09 profile: Gateway API CRDs + Envoy Gateway (class ${ENVOY_GATEWAYCLASS_NAME}).
Mutually exclusive with ingress-contour.
EOF
}

main() {
  case "${1:-}" in
    install) cmd_install ;;
    uninstall | teardown | down) cmd_uninstall ;;
    status) cmd_status ;;
    -h | --help | help | "") usage ;;
    *)
      addons_err "unknown command: ${1:-}"
      usage >&2
      return 2
      ;;
  esac
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  main "$@"
fi
