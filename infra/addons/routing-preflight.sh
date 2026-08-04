#!/usr/bin/env bash
# Routing profile preflight + detect (US-GATEWAY-1).
#
# Profiles (mutually exclusive — never install both):
#   gateway-envoy     Envoy Gateway + Gateway API CRDs (canonical for S09)
#   ingress-contour   Contour Ingress controller (optional for S08 / comparison)
#
# Usage:
#   routing-preflight.sh detect
#   routing-preflight.sh check <gateway-envoy|ingress-contour>
#
# Conflicts fail BEFORE mutation with remediation text. Transition is the
# explicit safe path: ./workshop profile transition <target>

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh disable=SC1091
. "$SCRIPT_DIR/common.sh"

remediation_transition() {
  local target="$1"
  addons_err "Remediation: tear down the other profile, or run an explicit transition:"
  addons_err "  ./workshop profile transition ${target}"
  addons_err "  # or: make profile-transition TO=${target}"
}

host_ports_claimant() {
  # Prefer explicit mock/host signal from kubectl get svc (routing stub), else
  # infer from known controller namespaces.
  local svc_out
  svc_out="$(kubectl get svc -A 2>/dev/null || true)"
  if printf '%s\n' "$svc_out" | grep -q 'ROUTING_HOSTPORTS'; then
    printf '%s\n' "$svc_out" | awk '/ROUTING_HOSTPORTS/ { print $2; exit }'
    return 0
  fi
  if ns_exists "$CONTOUR_NS"; then
    echo "80,443:contour"
    return 0
  fi
  if ns_exists "$ENVOY_NS"; then
    echo "80,443:envoy-gateway"
    return 0
  fi
  return 0
}

gatewayclass_controller() {
  local name="$1"
  kubectl get gatewayclass "$name" \
    -o jsonpath='{.spec.controllerName}' 2>/dev/null || true
}

list_gatewayclass_lines() {
  kubectl get gatewayclass -o jsonpath='{range .items[*]}{.metadata.name} {.spec.controllerName}{"\n"}{end}' 2>/dev/null \
    || kubectl get gatewayclass 2>/dev/null || true
}

list_ingressclass_lines() {
  kubectl get ingressclass -o jsonpath='{range .items[*]}{.metadata.name} {.spec.controller}{"\n"}{end}' 2>/dev/null \
    || kubectl get ingressclass 2>/dev/null || true
}

contour_signals() {
  ns_exists "$CONTOUR_NS" && return 0
  list_ingressclass_lines | grep -q "projectcontour.io/ingress-controller" && return 0
  return 1
}

envoy_signals() {
  ns_exists "$ENVOY_NS" && return 0
  list_gatewayclass_lines | grep -q "gateway.envoyproxy.io/gatewayclass-controller" && return 0
  return 1
}

workshop_contour() {
  [ "$(read_profile_marker "$CONTOUR_NS")" = "ingress-contour" ]
}

workshop_envoy() {
  [ "$(read_profile_marker "$ENVOY_NS")" = "gateway-envoy" ]
}

# Print exactly one of: none | gateway-envoy | ingress-contour | foreign-envoy |
# foreign-contour | conflict
routing_detect() {
  local has_contour=0 has_envoy=0

  if contour_signals; then has_contour=1; fi
  if envoy_signals; then has_envoy=1; fi

  if [ "$has_contour" -eq 1 ] && [ "$has_envoy" -eq 1 ]; then
    echo "conflict"
    return 0
  fi
  if [ "$has_envoy" -eq 1 ]; then
    if workshop_envoy; then
      echo "gateway-envoy"
    else
      echo "foreign-envoy"
    fi
    return 0
  fi
  if [ "$has_contour" -eq 1 ]; then
    if workshop_contour; then
      echo "ingress-contour"
    else
      echo "foreign-contour"
    fi
    return 0
  fi
  echo "none"
}

routing_preflight_check() {
  local want="$1"
  local active ports eg_ctrl

  case "$want" in
    gateway-envoy | ingress-contour) ;;
    *)
      addons_err "unknown profile '${want}' (want gateway-envoy or ingress-contour)"
      return 2
      ;;
  esac

  active="$(routing_detect)"

  if [ "$active" = "$want" ]; then
    addons_ok "preflight clear — profile '${want}' already active (idempotent re-install OK)"
    return 0
  fi

  if [ "$active" = "conflict" ]; then
    addons_err "conflict: Contour and Envoy Gateway signals both present — mutual exclusion violated"
    remediation_transition "$want"
    return 1
  fi

  if [ "$want" = "gateway-envoy" ]; then
    case "$active" in
      ingress-contour)
        addons_err "refusing gateway-envoy: workshop profile ingress-contour is installed (never silently alongside Envoy)"
        remediation_transition gateway-envoy
        return 1
        ;;
      foreign-contour)
        addons_err "refusing gateway-envoy: foreign/unowned Contour detected in '${CONTOUR_NS}' (not workshop-managed)"
        addons_err "Remediation: remove the foreign install, or use a clean kind cluster (./workshop down && ./workshop up)"
        return 1
        ;;
      foreign-envoy)
        addons_err "refusing gateway-envoy: foreign/unowned Envoy Gateway namespace '${ENVOY_NS}' already exists"
        addons_err "Remediation: remove the foreign install, or use a clean kind cluster"
        return 1
        ;;
    esac

    eg_ctrl="$(gatewayclass_controller "$ENVOY_GATEWAYCLASS_NAME")"
    if [ -n "$eg_ctrl" ] && [ "$eg_ctrl" != "$ENVOY_CONTROLLER_NAME" ]; then
      addons_err "refusing gateway-envoy: GatewayClass '${ENVOY_GATEWAYCLASS_NAME}' exists with controller '${eg_ctrl}'"
      addons_err "expected '${ENVOY_CONTROLLER_NAME}'. Manifests must not rely on an accidental default class."
      addons_err "Remediation: delete the conflicting GatewayClass or pick a different class name in your lab"
      return 1
    fi

    ports="$(host_ports_claimant || true)"
    case "$ports" in
      *contour*)
        addons_err "refusing gateway-envoy: host ports 80/443 appear claimed by Contour (${ports})"
        remediation_transition gateway-envoy
        return 1
        ;;
    esac
  fi

  if [ "$want" = "ingress-contour" ]; then
    case "$active" in
      gateway-envoy)
        addons_err "refusing ingress-contour: workshop profile gateway-envoy is installed (mutually exclusive)"
        remediation_transition ingress-contour
        return 1
        ;;
      foreign-envoy)
        addons_err "refusing ingress-contour: foreign/unowned Envoy Gateway detected in '${ENVOY_NS}'"
        addons_err "Remediation: remove the foreign install, or use a clean kind cluster"
        return 1
        ;;
      foreign-contour)
        addons_err "refusing ingress-contour: foreign/unowned Contour namespace '${CONTOUR_NS}' already exists"
        addons_err "Remediation: remove the foreign install, or use a clean kind cluster"
        return 1
        ;;
    esac

    ports="$(host_ports_claimant || true)"
    case "$ports" in
      *envoy*)
        addons_err "refusing ingress-contour: host ports 80/443 appear claimed by Envoy Gateway (${ports})"
        remediation_transition ingress-contour
        return 1
        ;;
    esac
  fi

  addons_ok "preflight clear for profile '${want}'"
  return 0
}

usage() {
  cat <<EOF
Usage: routing-preflight.sh <detect|check> [profile]

  detect                         print active routing state
  check gateway-envoy|ingress-contour
                                 fail closed if installing that profile would conflict

Profiles are mutually exclusive. Contour is never installed silently alongside
Envoy Gateway. Use: ./workshop profile transition <target>
EOF
}

main() {
  local cmd="${1:-}"
  shift || true
  case "$cmd" in
    detect)
      routing_detect
      ;;
    check)
      [ "${1:-}" ] || { usage >&2; return 2; }
      routing_preflight_check "$1"
      ;;
    -h | --help | help | "")
      usage
      ;;
    *)
      addons_err "unknown command: ${cmd}"
      usage >&2
      return 2
      ;;
  esac
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  main "$@"
fi
