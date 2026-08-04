#!/usr/bin/env bash
# cert-manager add-on — required for S22 operator pattern (US-ADDONS-1).
#
#   cert-manager.sh install|uninstall|status|check

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh disable=SC1091
. "$SCRIPT_DIR/common.sh"

ADDON="cert-manager"
SECTION="s22"
READY_TIMEOUT="${WORKSHOP_ADDON_READY_TIMEOUT:-300s}"
CERT_MANAGER_URL="https://github.com/cert-manager/cert-manager/releases/download/${CERT_MANAGER_VERSION}/cert-manager.yaml"

cmd_check() {
  addons_say "component=${ADDON} version=${CERT_MANAGER_VERSION} ns=${CERT_MANAGER_NS}"
  if addon_is_installed "$CERT_MANAGER_NS" "$ADDON"; then
    addons_ok "${ADDON} already workshop-owned (idempotent re-run safe)"
  else
    addons_say "${ADDON} not installed — install will apply ${CERT_MANAGER_URL}"
  fi
  return 0
}

cmd_status() {
  if addon_is_installed "$CERT_MANAGER_NS" "$ADDON"; then
    addons_ok "addon ${ADDON} is installed (${CERT_MANAGER_VERSION})"
    return 0
  fi
  addons_say "addon ${ADDON} is not installed"
  return 1
}

cmd_install() {
  if addon_is_installed "$CERT_MANAGER_NS" "$ADDON"; then
    addons_ok "already installed — addon ${ADDON} is workshop-owned (idempotent)"
    return 0
  fi

  if ns_exists "$CERT_MANAGER_NS" && [ -z "$(read_addon_marker "$CERT_MANAGER_NS" "$ADDON")" ]; then
    if kubectl -n "$CERT_MANAGER_NS" get deploy cert-manager >/dev/null 2>&1; then
      addons_err "refusing install: ${CERT_MANAGER_NS} looks foreign/unowned"
      addons_err "Remediation: remove the foreign install or recreate the kind cluster"
      return 1
    fi
  fi

  addons_say "installing addon ${ADDON} (${CERT_MANAGER_VERSION})"

  if [ "${WORKSHOP_ADDON_SKIP_REMOTE:-0}" = "1" ]; then
    ensure_namespace "$CERT_MANAGER_NS"
    apply_addon_marker "$CERT_MANAGER_NS" "$ADDON" "$SECTION"
    addons_ok "addon ${ADDON} installed (skip-remote mode)"
    return 0
  fi

  apply_remote_or_skip "$CERT_MANAGER_URL"
  wait_deploy_available "$CERT_MANAGER_NS" cert-manager "$READY_TIMEOUT"
  wait_deploy_available "$CERT_MANAGER_NS" cert-manager-webhook "$READY_TIMEOUT"
  apply_addon_marker "$CERT_MANAGER_NS" "$ADDON" "$SECTION"
  addons_ok "addon ${ADDON} ready in namespace ${CERT_MANAGER_NS}"
}

cmd_uninstall() {
  local marker
  if ! ns_exists "$CERT_MANAGER_NS"; then
    addons_ok "nothing to tear down — namespace ${CERT_MANAGER_NS} absent"
    return 0
  fi
  marker="$(read_addon_marker "$CERT_MANAGER_NS" "$ADDON")"
  if [ "$marker" != "$ADDON" ]; then
    addons_err "refusing teardown: ${CERT_MANAGER_NS} is foreign/unowned (marker='${marker:-none}')"
    return 1
  fi

  addons_say "tearing down workshop-owned addon ${ADDON}"
  delete_addon_marker "$CERT_MANAGER_NS" "$ADDON"
  if [ "${WORKSHOP_ADDON_SKIP_REMOTE:-0}" != "1" ]; then
    kubectl delete -f "$CERT_MANAGER_URL" --ignore-not-found >/dev/null 2>&1 || true
  fi
  kubectl delete namespace "$CERT_MANAGER_NS" --ignore-not-found >/dev/null 2>&1 || true
  local waited=0
  while ns_exists "$CERT_MANAGER_NS"; do
    if [ "$waited" -ge 120 ]; then
      addons_err "namespace ${CERT_MANAGER_NS} still present after teardown — wait or recreate the kind cluster"
      return 1
    fi
    sleep 2
    waited=$((waited + 2))
  done
  addons_ok "addon ${ADDON} removed"
}

usage() {
  cat <<EOF
Usage: cert-manager.sh <install|uninstall|status|check>

S22 add-on: cert-manager ${CERT_MANAGER_VERSION}.
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
