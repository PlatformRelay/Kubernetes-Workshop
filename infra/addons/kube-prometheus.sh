#!/usr/bin/env bash
# kube-prometheus-stack add-on — required for S23 (US-ADDONS-1).
# Heavyweight: warns about cluster capacity before install.
#
#   kube-prometheus.sh install|uninstall|status|check

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh disable=SC1091
. "$SCRIPT_DIR/common.sh"

ADDON="kube-prometheus"
SECTION="s23"
READY_TIMEOUT="${WORKSHOP_ADDON_READY_TIMEOUT:-600s}"
HELM_RELEASE="${KUBE_PROMETHEUS_HELM_RELEASE:-monitoring}"
HELM_REPO_NAME="${KUBE_PROMETHEUS_HELM_REPO:-prometheus-community}"
HELM_REPO_URL="${KUBE_PROMETHEUS_HELM_REPO_URL:-https://prometheus-community.github.io/helm-charts}"
CHART="${HELM_REPO_NAME}/kube-prometheus-stack"

cmd_check() {
  addons_say "component=${ADDON} chart=${KUBE_PROMETHEUS_STACK_CHART_VERSION} ns=${MONITORING_NS}"
  addons_warn "heavyweight profile component — needs ~4Gi free memory on the kind node"
  if addon_is_installed "$MONITORING_NS" "$ADDON"; then
    addons_ok "${ADDON} already workshop-owned (idempotent re-run safe)"
  else
    addons_say "${ADDON} not installed — install will helm install ${CHART} @ ${KUBE_PROMETHEUS_STACK_CHART_VERSION}"
  fi
  return 0
}

cmd_status() {
  if addon_is_installed "$MONITORING_NS" "$ADDON"; then
    addons_ok "addon ${ADDON} is installed (chart ${KUBE_PROMETHEUS_STACK_CHART_VERSION})"
    return 0
  fi
  addons_say "addon ${ADDON} is not installed"
  return 1
}

cmd_install() {
  if addon_is_installed "$MONITORING_NS" "$ADDON"; then
    addons_ok "already installed — addon ${ADDON} is workshop-owned (idempotent)"
    return 0
  fi

  if ns_exists "$MONITORING_NS" && [ -z "$(read_addon_marker "$MONITORING_NS" "$ADDON")" ]; then
    addons_err "refusing install: ${MONITORING_NS} exists without workshop ownership marker"
    addons_err "Remediation: remove the foreign install or recreate the kind cluster"
    return 1
  fi

  addons_warn "heavyweight: kube-prometheus-stack — prefer a fresh kind cluster with ≥4Gi RAM"
  addons_say "installing addon ${ADDON} (chart ${KUBE_PROMETHEUS_STACK_CHART_VERSION})"
  ensure_namespace "$MONITORING_NS"

  if [ "${WORKSHOP_ADDON_SKIP_REMOTE:-0}" = "1" ]; then
    apply_addon_marker "$MONITORING_NS" "$ADDON" "$SECTION"
    addons_ok "addon ${ADDON} installed (skip-remote mode)"
    return 0
  fi

  if ! command -v helm >/dev/null 2>&1; then
    addons_err "helm is required to install ${ADDON}"
    addons_err "Remediation: install Helm v3, then re-run ./workshop profile day-3"
    return 1
  fi

  helm repo add "$HELM_REPO_NAME" "$HELM_REPO_URL" >/dev/null 2>&1 || true
  helm repo update "$HELM_REPO_NAME" >/dev/null
  helm upgrade --install "$HELM_RELEASE" "$CHART" \
    --namespace "$MONITORING_NS" \
    --version "$KUBE_PROMETHEUS_STACK_CHART_VERSION" \
    --wait --timeout "$READY_TIMEOUT"

  apply_addon_marker "$MONITORING_NS" "$ADDON" "$SECTION"
  addons_ok "addon ${ADDON} ready in namespace ${MONITORING_NS}"
}

cmd_uninstall() {
  local marker
  if ! ns_exists "$MONITORING_NS"; then
    addons_ok "nothing to tear down — namespace ${MONITORING_NS} absent"
    return 0
  fi
  marker="$(read_addon_marker "$MONITORING_NS" "$ADDON")"
  if [ "$marker" != "$ADDON" ]; then
    addons_err "refusing teardown: ${MONITORING_NS} is foreign/unowned (marker='${marker:-none}')"
    return 1
  fi

  addons_say "tearing down workshop-owned addon ${ADDON}"
  delete_addon_marker "$MONITORING_NS" "$ADDON"
  if [ "${WORKSHOP_ADDON_SKIP_REMOTE:-0}" != "1" ] && command -v helm >/dev/null 2>&1; then
    helm uninstall "$HELM_RELEASE" --namespace "$MONITORING_NS" >/dev/null 2>&1 || true
  fi
  kubectl delete namespace "$MONITORING_NS" --ignore-not-found >/dev/null 2>&1 || true
  local waited=0
  while ns_exists "$MONITORING_NS"; do
    if [ "$waited" -ge 180 ]; then
      addons_err "namespace ${MONITORING_NS} still present after teardown — wait or recreate the kind cluster"
      return 1
    fi
    sleep 2
    waited=$((waited + 2))
  done
  addons_ok "addon ${ADDON} removed"
}

usage() {
  cat <<EOF
Usage: kube-prometheus.sh <install|uninstall|status|check>

S23 add-on: kube-prometheus-stack chart ${KUBE_PROMETHEUS_STACK_CHART_VERSION} (Helm).
Heavyweight — warn before install on small kind nodes.
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
