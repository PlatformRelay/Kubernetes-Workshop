#!/usr/bin/env bash
# GitOps tool preflight + detect (US-GITOPS-CHOICE-D).
#
# Tools (mutually exclusive — never install both):
#   argocd     Argo CD (default for S21 / day-3)
#   flux       Flux controllers (optional S21 variant)
#
# Usage:
#   gitops-preflight.sh detect
#   gitops-preflight.sh check <argocd|flux>
#
# Conflicts fail BEFORE mutation with remediation text. Transition is the
# explicit safe path: ./workshop profile transition <argocd|flux>

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh disable=SC1091
. "$SCRIPT_DIR/common.sh"

remediation_gitops_transition() {
  local target="$1"
  addons_err "Remediation: tear down the other GitOps tool, or run an explicit transition:"
  addons_err "  ./workshop profile transition ${target}"
  addons_err "  # or: make profile-transition TO=${target}"
}

argocd_signals() {
  ns_exists "$ARGOCD_NS" && return 0
  return 1
}

flux_signals() {
  ns_exists "$FLUX_NS" && return 0
  return 1
}

workshop_argocd() {
  [ "$(read_addon_marker "$ARGOCD_NS" argocd)" = "argocd" ]
}

workshop_flux() {
  [ "$(read_addon_marker "$FLUX_NS" flux)" = "flux" ]
}

# Print exactly one of: none | argocd | flux | foreign-argocd | foreign-flux | conflict
gitops_detect() {
  local has_argo=0 has_flux=0

  if argocd_signals; then has_argo=1; fi
  if flux_signals; then has_flux=1; fi

  if [ "$has_argo" -eq 1 ] && [ "$has_flux" -eq 1 ]; then
    echo "conflict"
    return 0
  fi
  if [ "$has_argo" -eq 1 ]; then
    if workshop_argocd; then
      echo "argocd"
    else
      echo "foreign-argocd"
    fi
    return 0
  fi
  if [ "$has_flux" -eq 1 ]; then
    if workshop_flux; then
      echo "flux"
    else
      echo "foreign-flux"
    fi
    return 0
  fi
  echo "none"
}

gitops_preflight_check() {
  local want="$1"
  local active

  case "$want" in
    argocd | flux) ;;
    *)
      addons_err "unknown GitOps tool '${want}' (want argocd or flux)"
      return 2
      ;;
  esac

  active="$(gitops_detect)"

  if [ "$active" = "$want" ]; then
    addons_ok "preflight clear — GitOps tool '${want}' already active (idempotent re-install OK)"
    return 0
  fi

  if [ "$active" = "conflict" ]; then
    addons_err "conflict: Argo CD and Flux signals both present — mutual exclusion violated"
    remediation_gitops_transition "$want"
    return 1
  fi

  if [ "$want" = "flux" ]; then
    case "$active" in
      argocd)
        addons_err "refusing flux: workshop profile argocd is installed (never silently alongside Flux)"
        remediation_gitops_transition flux
        return 1
        ;;
      foreign-argocd)
        addons_err "refusing flux: foreign/unowned argocd detected in '${ARGOCD_NS}' (not workshop-managed)"
        addons_err "Remediation: remove the foreign install, or use a clean kind cluster (./workshop down && ./workshop up)"
        return 1
        ;;
      foreign-flux)
        addons_err "refusing flux: foreign/unowned flux namespace '${FLUX_NS}' already exists"
        addons_err "Remediation: remove the foreign install, or use a clean kind cluster"
        return 1
        ;;
    esac
  fi

  if [ "$want" = "argocd" ]; then
    case "$active" in
      flux)
        addons_err "refusing argocd: workshop profile flux is installed (mutually exclusive)"
        remediation_gitops_transition argocd
        return 1
        ;;
      foreign-flux)
        addons_err "refusing argocd: foreign/unowned flux detected in '${FLUX_NS}'"
        addons_err "Remediation: remove the foreign install, or use a clean kind cluster"
        return 1
        ;;
      foreign-argocd)
        addons_err "refusing argocd: foreign/unowned argocd namespace '${ARGOCD_NS}' already exists"
        addons_err "Remediation: remove the foreign install, or use a clean kind cluster"
        return 1
        ;;
    esac
  fi

  addons_ok "preflight clear for GitOps tool '${want}'"
  return 0
}

gitops_transition() {
  local target="${1:-}"
  local active opposite
  case "$target" in
    argocd) opposite=flux ;;
    flux) opposite=argocd ;;
    *)
      addons_err "transition requires argocd or flux"
      return 2
      ;;
  esac

  active="$(gitops_detect)"
  addons_say "transition → ${target} (current: ${active})"

  case "$active" in
    "$target")
      addons_ok "already on ${target} — nothing to transition"
      return 0
      ;;
    "$opposite")
      addons_say "tearing down workshop GitOps tool ${opposite} before installing ${target}"
      "$SCRIPT_DIR/${opposite}.sh" uninstall || return 1
      ;;
    conflict)
      addons_err "cluster reports both Argo CD and Flux — refusing automatic transition"
      addons_err "Remediation: manually remove one stack, or recreate the kind cluster"
      return 1
      ;;
    foreign-argocd | foreign-flux)
      addons_err "foreign/unowned GitOps tool present (${active}) — refusing transition"
      addons_err "Remediation: remove the foreign install or recreate the kind cluster"
      return 1
      ;;
    none)
      addons_say "no opposing GitOps tool present — installing ${target}"
      ;;
    *)
      addons_err "unexpected detect state: ${active}"
      return 1
      ;;
  esac

  "$SCRIPT_DIR/${target}.sh" install
}

usage() {
  cat <<EOF
Usage: gitops-preflight.sh <detect|check> [tool]

  detect                         print active GitOps tool state
  check argocd|flux              fail closed if installing that tool would conflict

Argo CD and Flux are mutually exclusive. Use:
  ./workshop profile transition <argocd|flux>
EOF
}

main() {
  local cmd="${1:-}"
  shift || true
  case "$cmd" in
    detect)
      gitops_detect
      ;;
    check)
      [ "${1:-}" ] || { usage >&2; return 2; }
      gitops_preflight_check "$1"
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
