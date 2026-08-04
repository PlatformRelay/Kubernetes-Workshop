#!/usr/bin/env bash
# metrics-server add-on — required for S16 HPA (US-ADDONS-1).
#
#   metrics-server.sh install|uninstall|status|check

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh disable=SC1091
. "$SCRIPT_DIR/common.sh"

ADDON="metrics-server"
SECTION="s16"
READY_TIMEOUT="${WORKSHOP_ADDON_READY_TIMEOUT:-300s}"
METRICS_SERVER_URL="https://github.com/kubernetes-sigs/metrics-server/releases/download/${METRICS_SERVER_VERSION}/components.yaml"

cmd_check() {
  addons_say "component=${ADDON} version=${METRICS_SERVER_VERSION} ns=${METRICS_SERVER_NS}"
  if addon_is_installed "$METRICS_SERVER_NS" "$ADDON"; then
    addons_ok "${ADDON} already workshop-owned (idempotent re-run safe)"
  else
    addons_say "${ADDON} not installed — install will apply ${METRICS_SERVER_URL}"
  fi
  return 0
}

cmd_status() {
  if addon_is_installed "$METRICS_SERVER_NS" "$ADDON"; then
    addons_ok "addon ${ADDON} is installed (${METRICS_SERVER_VERSION})"
    return 0
  fi
  addons_say "addon ${ADDON} is not installed"
  return 1
}

patch_kind_insecure_tls() {
  # kind's kubelet serves a self-signed cert; metrics-server rejects it by default.
  kubectl -n "$METRICS_SERVER_NS" patch deployment metrics-server --type=json \
    -p '[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]' \
    >/dev/null 2>&1 || true
}

cmd_install() {
  if addon_is_installed "$METRICS_SERVER_NS" "$ADDON"; then
    addons_ok "already installed — addon ${ADDON} is workshop-owned (idempotent)"
    return 0
  fi

  # kube-system always exists; refuse a pre-existing Deployment we do not own.
  if kubectl -n "$METRICS_SERVER_NS" get deployment metrics-server >/dev/null 2>&1; then
    addons_err "refusing install: metrics-server Deployment exists in ${METRICS_SERVER_NS} but is not workshop-owned"
    addons_err "Remediation: remove the foreign metrics-server or recreate the kind cluster"
    return 1
  fi

  addons_say "installing addon ${ADDON} (${METRICS_SERVER_VERSION})"

  if [ "${WORKSHOP_ADDON_SKIP_REMOTE:-0}" = "1" ]; then
    apply_addon_marker "$METRICS_SERVER_NS" "$ADDON" "$SECTION"
    addons_ok "addon ${ADDON} installed (skip-remote mode)"
    return 0
  fi

  apply_remote_or_skip "$METRICS_SERVER_URL"
  patch_kind_insecure_tls
  wait_deploy_available "$METRICS_SERVER_NS" metrics-server "$READY_TIMEOUT"
  apply_addon_marker "$METRICS_SERVER_NS" "$ADDON" "$SECTION"
  addons_ok "addon ${ADDON} ready — kubectl top should work after ~30s"
}

cmd_uninstall() {
  local marker
  marker="$(read_addon_marker "$METRICS_SERVER_NS" "$ADDON")"
  if [ -z "$marker" ]; then
    # No workshop marker: if Deployment absent, nothing to do; if present, foreign.
    if kubectl -n "$METRICS_SERVER_NS" get deployment metrics-server >/dev/null 2>&1; then
      addons_err "refusing teardown: metrics-server present but not workshop-owned"
      return 1
    fi
    addons_ok "nothing to tear down — addon ${ADDON} absent"
    return 0
  fi
  if [ "$marker" != "$ADDON" ]; then
    addons_err "refusing teardown: unexpected marker '${marker}'"
    return 1
  fi

  addons_say "tearing down workshop-owned addon ${ADDON}"
  delete_addon_marker "$METRICS_SERVER_NS" "$ADDON"
  if [ "${WORKSHOP_ADDON_SKIP_REMOTE:-0}" != "1" ]; then
    kubectl -n "$METRICS_SERVER_NS" delete deployment metrics-server --ignore-not-found >/dev/null 2>&1 || true
    kubectl -n "$METRICS_SERVER_NS" delete service metrics-server --ignore-not-found >/dev/null 2>&1 || true
    kubectl delete apiservice v1beta1.metrics.k8s.io --ignore-not-found >/dev/null 2>&1 || true
  fi
  addons_ok "addon ${ADDON} removed"
}

usage() {
  cat <<EOF
Usage: metrics-server.sh <install|uninstall|status|check>

S16 add-on: metrics-server ${METRICS_SERVER_VERSION} (kind gets --kubelet-insecure-tls).
EOF
}

main() {
  case "${1:-}" in
    install) cmd_install ;;
    uninstall | teardown | down) cmd_uninstall ;;
    status) cmd_status ;;
    check) cmd_check ;;
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
