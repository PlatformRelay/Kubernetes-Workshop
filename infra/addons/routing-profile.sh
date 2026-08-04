#!/usr/bin/env bash
# Workshop routing profile CLI (US-GATEWAY-1).
#
#   routing-profile.sh gateway-envoy|ingress-contour [--teardown]
#   routing-profile.sh transition <gateway-envoy|ingress-contour>
#   routing-profile.sh status|detect
#   routing-profile.sh --help

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh disable=SC1091
. "$SCRIPT_DIR/common.sh"
# shellcheck source=routing-preflight.sh disable=SC1091
. "$SCRIPT_DIR/routing-preflight.sh"

usage() {
  cat <<EOF
Usage: ./workshop profile <command>

Mutually exclusive Ingress/Gateway profiles (never install both):

  gateway-envoy              install Envoy Gateway + Gateway API CRDs (canonical for S09)
  ingress-contour            install Contour (optional for S08 / comparison)
  gateway-envoy --teardown   remove workshop-owned Envoy Gateway only
  ingress-contour --teardown remove workshop-owned Contour only
  transition <profile>       tear down the other workshop profile, then install <profile>
  status | detect            show the active routing profile
  check <profile>            run preflight without mutating

Envoy Gateway is the default/canonical profile for Gateway API labs. Contour is
separately selected and is never silently installed alongside Envoy.
EOF
}

cmd_transition() {
  local target="${1:-}"
  local active opposite
  case "$target" in
    gateway-envoy) opposite=ingress-contour ;;
    ingress-contour) opposite=gateway-envoy ;;
    *)
      addons_err "transition requires gateway-envoy or ingress-contour"
      return 2
      ;;
  esac

  active="$(routing_detect)"
  addons_say "transition → ${target} (current: ${active})"

  case "$active" in
    "$target")
      addons_ok "already on ${target} — nothing to transition"
      return 0
      ;;
    "$opposite")
      addons_say "tearing down workshop profile ${opposite} before installing ${target}"
      "$SCRIPT_DIR/${opposite}.sh" uninstall || return 1
      ;;
    conflict)
      addons_err "cluster reports both Contour and Envoy — refusing automatic transition"
      addons_err "Remediation: manually remove one stack, or recreate the kind cluster"
      return 1
      ;;
    foreign-envoy | foreign-contour)
      addons_err "foreign/unowned routing controller present (${active}) — refusing transition"
      addons_err "Remediation: remove the foreign install or recreate the kind cluster"
      return 1
      ;;
    none)
      addons_say "no opposing profile present — installing ${target}"
      ;;
    *)
      addons_err "unexpected detect state: ${active}"
      return 1
      ;;
  esac

  "$SCRIPT_DIR/${target}.sh" install
}

main() {
  local cmd="${1:-}" teardown=0
  shift || true

  local args=()
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --teardown | --uninstall | --down) teardown=1 ;;
      -h | --help) usage; return 0 ;;
      *) args+=("$1") ;;
    esac
    shift
  done
  set -- "${args[@]:-}"

  case "$cmd" in
    -h | --help | help | "")
      usage
      ;;
    status | detect)
      routing_detect
      ;;
    check)
      routing_preflight_check "${1:?profile required}"
      ;;
    transition)
      cmd_transition "${1:?target profile required}"
      ;;
    gateway-envoy | ingress-contour)
      if [ "$teardown" -eq 1 ]; then
        "$SCRIPT_DIR/${cmd}.sh" uninstall
      else
        "$SCRIPT_DIR/${cmd}.sh" install
      fi
      ;;
    *)
      addons_err "unknown profile command: ${cmd}"
      usage >&2
      return 2
      ;;
  esac
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  main "$@"
fi
