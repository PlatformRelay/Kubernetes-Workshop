#!/usr/bin/env bash
# Unified workshop profile CLI (US-ADDONS-1).
#
# Composes routing profiles (US-GATEWAY-1) and day/lab add-on installers without
# duplicating their logic. Default `./workshop up` does NOT install these —
# day profiles are opt-in.
#
#   profile.sh day-1|day-2|day-3|gateway-envoy|ingress-contour [--teardown]
#   profile.sh quiz-live          # deferred stub (US-QUIZ-1 adopted none)
#   profile.sh transition <routing-profile>
#   profile.sh check <profile>
#   profile.sh status|list|detect
#   profile.sh --help

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh disable=SC1091
. "$SCRIPT_DIR/common.sh"
# shellcheck source=routing-preflight.sh disable=SC1091
. "$SCRIPT_DIR/routing-preflight.sh"

# Day profile compositions (names only — installers live in sibling scripts).
DAY1_COMPONENTS=(ingress-contour)
DAY2_COMPONENTS=(gateway-envoy metrics-server)
DAY3_COMPONENTS=(argocd cert-manager kube-prometheus)

usage() {
  cat <<EOF
Usage: ./workshop profile <command>

Named profiles (opt-in — not installed by ./workshop up):

  day-1                      Contour Ingress (S08) — composes: ingress-contour
  day-2                      Gateway API + metrics-server (S09/S16) — composes:
                             gateway-envoy, metrics-server
  day-3                      GitOps/operators/observability (S21–S23) — composes:
                             argocd, cert-manager, kube-prometheus (heavyweight)
  gateway-envoy              Envoy Gateway + Gateway API CRDs (canonical for S09)
  ingress-contour            Contour (optional for S08 / comparison)
  quiz-live                  DEFERRED — US-QUIZ-1 adopted no FOSS candidate

Routing (mutually exclusive — never install Contour and Envoy together):

  gateway-envoy --teardown   remove workshop-owned Envoy Gateway only
  ingress-contour --teardown remove workshop-owned Contour only
  day-N --teardown           tear down that day's composed components (scoped)
  transition <profile>       tear down the other workshop routing profile, then
                             install <gateway-envoy|ingress-contour>
  check <profile>            preflight / composition listing without mutating
  status | detect | list     show active routing profile and installed add-ons

Interactive gum choose is progressive enhancement; flags/non-TTY behave identically.
Versions come from infra/versions.env.
EOF
}

run_component() {
  local name="$1" action="$2"
  case "$name" in
    gateway-envoy | ingress-contour)
      "$SCRIPT_DIR/${name}.sh" "$action"
      ;;
    metrics-server)
      "$SCRIPT_DIR/metrics-server.sh" "$action"
      ;;
    argocd)
      "$SCRIPT_DIR/argocd.sh" "$action"
      ;;
    cert-manager)
      "$SCRIPT_DIR/cert-manager.sh" "$action"
      ;;
    kube-prometheus)
      "$SCRIPT_DIR/kube-prometheus.sh" "$action"
      ;;
    *)
      addons_err "unknown component: ${name}"
      return 2
      ;;
  esac
}

components_for_profile() {
  local profile="$1"
  case "$profile" in
    day-1) printf '%s\n' "${DAY1_COMPONENTS[@]}" ;;
    day-2) printf '%s\n' "${DAY2_COMPONENTS[@]}" ;;
    day-3) printf '%s\n' "${DAY3_COMPONENTS[@]}" ;;
    gateway-envoy | ingress-contour) printf '%s\n' "$profile" ;;
    *) return 1 ;;
  esac
}

cmd_check_profile() {
  local profile="$1"
  local comp

  if [ "$profile" = "quiz-live" ]; then
    addons_err "quiz-live is deferred — US-QUIZ-1 adopted no FOSS candidate"
    addons_err "Remediation: skip quiz-live until a deployable FOSS quiz stack is chosen"
    return 2
  fi

  if ! components_for_profile "$profile" >/dev/null; then
    addons_err "unknown profile: ${profile}"
    return 2
  fi

  addons_say "profile=${profile} composition:"
  while IFS= read -r comp; do
    addons_say "  - ${comp}"
  done < <(components_for_profile "$profile")

  case "$profile" in
    day-3)
      addons_warn "day-3 is heavyweight (Argo CD + cert-manager + kube-prometheus-stack)"
      ;;
  esac

  # Routing preflight when the composition includes a routing profile.
  while IFS= read -r comp; do
    case "$comp" in
      gateway-envoy | ingress-contour)
        routing_preflight_check "$comp" || return 1
        ;;
      *)
        run_component "$comp" check || return 1
        ;;
    esac
  done < <(components_for_profile "$profile")

  addons_ok "preflight clear for profile ${profile}"
}

cmd_install_profile() {
  local profile="$1"
  local comp failed=""

  if [ "$profile" = "quiz-live" ]; then
    addons_err "quiz-live is deferred — US-QUIZ-1 adopted no FOSS candidate (not available)"
    addons_err "Remediation: use day-1/day-2/day-3 or routing profiles; quiz awaits US-QUIZ-2"
    return 2
  fi

  if ! components_for_profile "$profile" >/dev/null; then
    addons_err "unknown profile: ${profile}"
    usage >&2
    return 2
  fi

  addons_say "installing profile ${profile}"
  while IFS= read -r comp; do
    addons_say "→ component ${comp}"
    if ! run_component "$comp" install; then
      failed="$comp"
      addons_err "profile ${profile} failed at component ${failed}"
      addons_err "Remediation: ./workshop profile ${profile} --teardown  # then fix and retry"
      addons_err "Or: ./workshop profile check ${profile}"
      return 1
    fi
  done < <(components_for_profile "$profile")

  addons_ok "profile ${profile} ready"
}

cmd_teardown_profile() {
  local profile="$1"
  local comp
  local -a comps=()

  if [ "$profile" = "quiz-live" ]; then
    addons_ok "quiz-live deferred — nothing to tear down"
    return 0
  fi

  if ! components_for_profile "$profile" >/dev/null; then
    addons_err "unknown profile: ${profile}"
    return 2
  fi

  # Tear down in reverse composition order.
  while IFS= read -r comp; do
    comps+=("$comp")
  done < <(components_for_profile "$profile")

  local i
  for ((i = ${#comps[@]} - 1; i >= 0; i--)); do
    comp="${comps[$i]}"
    addons_say "→ teardown component ${comp}"
    run_component "$comp" uninstall || return 1
  done
  addons_ok "profile ${profile} torn down"
}

cmd_status() {
  local active addon
  active="$(routing_detect)"
  addons_say "routing=${active}"

  for addon in metrics-server argocd cert-manager kube-prometheus; do
    case "$addon" in
      metrics-server)
        if addon_is_installed "$METRICS_SERVER_NS" "$addon"; then
          addons_say "addon=${addon}: installed"
        else
          addons_say "addon=${addon}: absent"
        fi
        ;;
      argocd)
        if addon_is_installed "$ARGOCD_NS" "$addon"; then
          addons_say "addon=${addon}: installed"
        else
          addons_say "addon=${addon}: absent"
        fi
        ;;
      cert-manager)
        if addon_is_installed "$CERT_MANAGER_NS" "$addon"; then
          addons_say "addon=${addon}: installed"
        else
          addons_say "addon=${addon}: absent"
        fi
        ;;
      kube-prometheus)
        if addon_is_installed "$MONITORING_NS" "$addon"; then
          addons_say "addon=${addon}: installed"
        else
          addons_say "addon=${addon}: absent"
        fi
        ;;
    esac
  done

  # Surface gateway-envoy / Contour via routing detect already printed.
  case "$active" in
    gateway-envoy | ingress-contour)
      addons_ok "routing profile ${active} is active"
      ;;
    none)
      addons_say "no workshop routing profile active"
      ;;
    *)
      addons_warn "routing detect state: ${active}"
      ;;
  esac
}

cmd_list() {
  addons_say "available profiles:"
  addons_say "  day-1 day-2 day-3 gateway-envoy ingress-contour quiz-live(deferred)"
  cmd_status
}

cmd_interactive_choose() {
  local choice
  if ! addons_use_gum; then
    usage
    return 2
  fi
  choice="$(gum choose \
    "day-1" "day-2" "day-3" "gateway-envoy" "ingress-contour" "status" "quit")"
  case "$choice" in
    quit | "") return 0 ;;
    status) cmd_status ;;
    *) cmd_install_profile "$choice" ;;
  esac
}

cmd_transition() {
  # Delegate mutex transition to the routing-profile CLI (no duplication).
  "$SCRIPT_DIR/routing-profile.sh" transition "$@"
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
      if [ "$teardown" -eq 0 ] && addons_use_gum && [ -z "${1:-}" ]; then
        cmd_interactive_choose
      else
        usage
      fi
      ;;
    status | detect | list)
      cmd_status
      ;;
    check)
      cmd_check_profile "${1:?profile required}"
      ;;
    transition)
      cmd_transition "${1:?target profile required}"
      ;;
    day-1 | day-2 | day-3 | gateway-envoy | ingress-contour | quiz-live)
      if [ "$teardown" -eq 1 ]; then
        cmd_teardown_profile "$cmd"
      else
        cmd_install_profile "$cmd"
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
