#!/usr/bin/env bash
# ingress-contour profile — Contour Ingress controller (optional for S08).
# Mutually exclusive with gateway-envoy (US-GATEWAY-1). Never silently installed
# alongside Envoy Gateway.
#
#   ingress-contour.sh install|uninstall|status

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh disable=SC1091
. "$SCRIPT_DIR/common.sh"
# shellcheck source=routing-preflight.sh disable=SC1091
. "$SCRIPT_DIR/routing-preflight.sh"

PROFILE="ingress-contour"
READY_TIMEOUT="${WORKSHOP_ADDON_READY_TIMEOUT:-300s}"
CONTOUR_URL="https://raw.githubusercontent.com/projectcontour/contour/${CONTOUR_VERSION}/examples/render/contour.yaml"

apply_ingressclass_contour() {
  kubectl apply -f - <<EOF
apiVersion: networking.k8s.io/v1
kind: IngressClass
metadata:
  name: ${CONTOUR_INGRESSCLASS_NAME}
  labels:
    app.kubernetes.io/name: ${PROFILE}
    app.kubernetes.io/part-of: ${WORKSHOP_PART_OF}
    app.kubernetes.io/managed-by: ${WORKSHOP_MANAGED_BY}
    ${WORKSHOP_LABEL_PREFIX}/profile: ${PROFILE}
    ${WORKSHOP_LABEL_PREFIX}/section: s08
spec:
  controller: ${CONTOUR_INGRESS_CONTROLLER}
EOF
}

ensure_contour_namespace() {
  kubectl create namespace "$CONTOUR_NS" --dry-run=client -o yaml | kubectl apply -f -
}

cmd_status() {
  local active
  active="$(routing_detect)"
  addons_say "active=${active}"
  if [ "$active" = "$PROFILE" ]; then
    addons_ok "profile ${PROFILE} is active (IngressClass ${CONTOUR_INGRESSCLASS_NAME})"
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

  addons_say "installing profile ${PROFILE} (Contour ${CONTOUR_VERSION})"

  if [ "${WORKSHOP_ADDON_SKIP_REMOTE:-0}" = "1" ]; then
    ensure_contour_namespace
    apply_ingressclass_contour 2>/dev/null || true
    apply_profile_marker "$CONTOUR_NS" "$PROFILE" s08
    addons_ok "profile ${PROFILE} installed (skip-remote mode)"
    return 0
  fi

  apply_remote_or_skip "$CONTOUR_URL"

  kubectl -n "$CONTOUR_NS" rollout status deployment/contour --timeout="$READY_TIMEOUT"
  kubectl -n "$CONTOUR_NS" rollout status daemonset/envoy --timeout="$READY_TIMEOUT"

  apply_ingressclass_contour
  apply_profile_marker "$CONTOUR_NS" "$PROFILE" s08

  addons_ok "profile ${PROFILE} ready — use ingressClassName: ${CONTOUR_INGRESSCLASS_NAME}"
}

cmd_uninstall() {
  local marker
  if ! ns_exists "$CONTOUR_NS"; then
    addons_ok "nothing to tear down — namespace ${CONTOUR_NS} absent"
    return 0
  fi

  marker="$(read_profile_marker "$CONTOUR_NS")"
  if [ "$marker" != "$PROFILE" ]; then
    addons_err "refusing teardown: ${CONTOUR_NS} is foreign/unowned (marker='${marker:-none}')"
    addons_err "workshop uninstall only removes workshop-owned resources"
    return 1
  fi

  addons_say "tearing down workshop-owned profile ${PROFILE}"
  kubectl delete ingressclass "$CONTOUR_INGRESSCLASS_NAME" --ignore-not-found >/dev/null 2>&1 || true
  delete_profile_marker "$CONTOUR_NS"
  kubectl delete namespace "$CONTOUR_NS" --ignore-not-found >/dev/null 2>&1 || true
  local waited=0
  while ns_exists "$CONTOUR_NS"; do
    if [ "$waited" -ge 120 ]; then
      addons_err "namespace ${CONTOUR_NS} still present after teardown — wait or recreate the kind cluster"
      return 1
    fi
    sleep 2
    waited=$((waited + 2))
  done

  addons_ok "profile ${PROFILE} removed"
}

usage() {
  cat <<EOF
Usage: ingress-contour.sh <install|uninstall|status>

Optional S08 profile: Contour Ingress controller (class ${CONTOUR_INGRESSCLASS_NAME}).
Mutually exclusive with gateway-envoy — never install both.
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
