#!/usr/bin/env bash
# Flux add-on — optional S21 GitOps tool (US-GITOPS-CHOICE-D).
# Mutually exclusive with Argo CD.
#
#   flux.sh install|uninstall|status|check

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh disable=SC1091
. "$SCRIPT_DIR/common.sh"
# shellcheck source=gitops-preflight.sh disable=SC1091
. "$SCRIPT_DIR/gitops-preflight.sh"

ADDON="flux"
SECTION="s21"
READY_TIMEOUT="${WORKSHOP_ADDON_READY_TIMEOUT:-300s}"
FLUX_URL="https://github.com/fluxcd/flux2/releases/download/${FLUX_VERSION}/install.yaml"

cmd_check() {
  addons_say "component=${ADDON} version=${FLUX_VERSION} ns=${FLUX_NS}"
  if addon_is_installed "$FLUX_NS" "$ADDON"; then
    addons_ok "${ADDON} already workshop-owned (idempotent re-run safe)"
  else
    addons_say "${ADDON} not installed — install will apply ${FLUX_URL}"
  fi
  gitops_preflight_check "$ADDON" || return 1
  return 0
}

cmd_status() {
  if addon_is_installed "$FLUX_NS" "$ADDON"; then
    addons_ok "addon ${ADDON} is installed (${FLUX_VERSION})"
    return 0
  fi
  addons_say "addon ${ADDON} is not installed"
  return 1
}

cmd_install() {
  if addon_is_installed "$FLUX_NS" "$ADDON"; then
    addons_ok "already installed — addon ${ADDON} is workshop-owned (idempotent)"
    return 0
  fi

  gitops_preflight_check "$ADDON" || return 1

  if ns_exists "$FLUX_NS" && [ -z "$(read_addon_marker "$FLUX_NS" "$ADDON")" ]; then
    if kubectl -n "$FLUX_NS" get deploy source-controller >/dev/null 2>&1; then
      addons_err "refusing install: ${FLUX_NS} looks foreign/unowned"
      addons_err "Remediation: remove the foreign install or recreate the kind cluster"
      return 1
    fi
  fi

  addons_say "installing addon ${ADDON} (${FLUX_VERSION})"
  ensure_namespace "$FLUX_NS"

  if [ "${WORKSHOP_ADDON_SKIP_REMOTE:-0}" = "1" ]; then
    apply_addon_marker "$FLUX_NS" "$ADDON" "$SECTION"
    addons_ok "addon ${ADDON} installed (skip-remote mode)"
    return 0
  fi

  apply_remote_or_skip "$FLUX_URL" --server-side --force-conflicts
  wait_deploy_available "$FLUX_NS" source-controller "$READY_TIMEOUT"
  wait_deploy_available "$FLUX_NS" kustomize-controller "$READY_TIMEOUT"
  apply_addon_marker "$FLUX_NS" "$ADDON" "$SECTION"
  addons_ok "addon ${ADDON} ready in namespace ${FLUX_NS}"
}

cmd_uninstall() {
  local marker
  if ! ns_exists "$FLUX_NS"; then
    addons_ok "nothing to tear down — namespace ${FLUX_NS} absent"
    return 0
  fi
  marker="$(read_addon_marker "$FLUX_NS" "$ADDON")"
  if [ "$marker" != "$ADDON" ]; then
    addons_err "refusing teardown: ${FLUX_NS} is foreign/unowned (marker='${marker:-none}')"
    return 1
  fi

  addons_say "tearing down workshop-owned addon ${ADDON}"
  delete_addon_marker "$FLUX_NS" "$ADDON"
  if [ "${WORKSHOP_ADDON_SKIP_REMOTE:-0}" != "1" ]; then
    kubectl delete -f "$FLUX_URL" --ignore-not-found >/dev/null 2>&1 || true
  fi
  kubectl delete namespace "$FLUX_NS" --ignore-not-found >/dev/null 2>&1 || true
  local waited=0
  while ns_exists "$FLUX_NS"; do
    if [ "$waited" -ge 120 ]; then
      addons_err "namespace ${FLUX_NS} still present after teardown — wait or recreate the kind cluster"
      return 1
    fi
    sleep 2
    waited=$((waited + 2))
  done
  addons_ok "addon ${ADDON} removed"
}

usage() {
  cat <<EOF
Usage: flux.sh <install|uninstall|status|check>

S21 add-on: Flux ${FLUX_VERSION} into namespace ${FLUX_NS}.
Mutually exclusive with Argo CD — use: ./workshop profile transition flux
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
