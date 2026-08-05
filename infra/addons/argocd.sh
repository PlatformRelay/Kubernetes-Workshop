#!/usr/bin/env bash
# Argo CD add-on — required for S21 GitOps (US-ADDONS-1).
#
#   argocd.sh install|uninstall|status|check

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh disable=SC1091
. "$SCRIPT_DIR/common.sh"
# shellcheck source=gitops-preflight.sh disable=SC1091
. "$SCRIPT_DIR/gitops-preflight.sh"

ADDON="argocd"
SECTION="s21"
READY_TIMEOUT="${WORKSHOP_ADDON_READY_TIMEOUT:-300s}"
ARGOCD_URL="https://raw.githubusercontent.com/argoproj/argo-cd/${ARGOCD_VERSION}/manifests/install.yaml"

cmd_check() {
  addons_say "component=${ADDON} version=${ARGOCD_VERSION} ns=${ARGOCD_NS}"
  if addon_is_installed "$ARGOCD_NS" "$ADDON"; then
    addons_ok "${ADDON} already workshop-owned (idempotent re-run safe)"
  else
    addons_say "${ADDON} not installed — install will apply ${ARGOCD_URL}"
  fi
  gitops_preflight_check "$ADDON" || return 1
  return 0
}

cmd_status() {
  if addon_is_installed "$ARGOCD_NS" "$ADDON"; then
    addons_ok "addon ${ADDON} is installed (${ARGOCD_VERSION})"
    return 0
  fi
  addons_say "addon ${ADDON} is not installed"
  return 1
}

cmd_install() {
  if addon_is_installed "$ARGOCD_NS" "$ADDON"; then
    addons_ok "already installed — addon ${ADDON} is workshop-owned (idempotent)"
    return 0
  fi

  gitops_preflight_check "$ADDON" || return 1

  if ns_exists "$ARGOCD_NS" && [ -z "$(read_addon_marker "$ARGOCD_NS" "$ADDON")" ]; then
    # Namespace exists without our marker — likely foreign.
    if kubectl -n "$ARGOCD_NS" get deploy argocd-server >/dev/null 2>&1; then
      addons_err "refusing install: ${ARGOCD_NS} looks foreign/unowned"
      addons_err "Remediation: remove the foreign install or recreate the kind cluster"
      return 1
    fi
  fi

  addons_say "installing addon ${ADDON} (${ARGOCD_VERSION})"
  ensure_namespace "$ARGOCD_NS"

  if [ "${WORKSHOP_ADDON_SKIP_REMOTE:-0}" = "1" ]; then
    apply_addon_marker "$ARGOCD_NS" "$ADDON" "$SECTION"
    addons_ok "addon ${ADDON} installed (skip-remote mode)"
    return 0
  fi

  apply_remote_or_skip "$ARGOCD_URL" -n "$ARGOCD_NS" --server-side --force-conflicts
  wait_deploy_available "$ARGOCD_NS" argocd-server "$READY_TIMEOUT"
  apply_addon_marker "$ARGOCD_NS" "$ADDON" "$SECTION"
  addons_ok "addon ${ADDON} ready in namespace ${ARGOCD_NS}"
}

cmd_uninstall() {
  local marker
  if ! ns_exists "$ARGOCD_NS"; then
    addons_ok "nothing to tear down — namespace ${ARGOCD_NS} absent"
    return 0
  fi
  marker="$(read_addon_marker "$ARGOCD_NS" "$ADDON")"
  if [ "$marker" != "$ADDON" ]; then
    addons_err "refusing teardown: ${ARGOCD_NS} is foreign/unowned (marker='${marker:-none}')"
    return 1
  fi

  addons_say "tearing down workshop-owned addon ${ADDON}"
  delete_addon_marker "$ARGOCD_NS" "$ADDON"
  kubectl delete namespace "$ARGOCD_NS" --ignore-not-found >/dev/null 2>&1 || true
  local waited=0
  while ns_exists "$ARGOCD_NS"; do
    if [ "$waited" -ge 120 ]; then
      addons_err "namespace ${ARGOCD_NS} still present after teardown — wait or recreate the kind cluster"
      return 1
    fi
    sleep 2
    waited=$((waited + 2))
  done
  addons_ok "addon ${ADDON} removed"
}

usage() {
  cat <<EOF
Usage: argocd.sh <install|uninstall|status|check>

S21 add-on: Argo CD ${ARGOCD_VERSION} into namespace ${ARGOCD_NS}.
Mutually exclusive with Flux — use: ./workshop profile transition argocd
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
