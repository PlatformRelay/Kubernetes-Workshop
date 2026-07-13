#!/usr/bin/env bash
# infra/bootstrap.sh — Lane A one-command bootstrap (US-ENV-2, proposal §3).
#
# The ./workshop wrapper dispatches here. Subcommands:
#   up      preflight → install/verify pinned tools (mise) → kind cluster → doctor
#   down    tear the cluster down (confirmed)  → reuses `make kind-down`
#   doctor  run infra/doctor.sh
#
# Design contract (proposal §3.1):
#   * The heavy lifting is DELEGATED, not reimplemented: the cluster is created by
#     `make kind-up` (which owns the pinned node image + config), health is
#     `infra/doctor.sh`, and the pins live in infra/versions.env + mise.toml.
#   * gum is PURE INTERACTIVE SUGAR (gum choose/spin/confirm). Every step also
#     runs non-interactively: set WORKSHOP_NONINTERACTIVE=1, or run with no TTY,
#     or under CI=true — then sane defaults are taken and nothing prompts. The
#     SAME script runs in CI as on a participant laptop.
#   * Resource/OS checks WARN (never hard-fail) so a small CI runner is green.
#
# Exit code: 0 on success, non-zero on a real failure (missing engine, cluster
# create/doctor failure, unknown subcommand).

set -euo pipefail

# --- Locations ---------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# shellcheck source=versions.env disable=SC1091
. "$SCRIPT_DIR/versions.env"

# --- Non-interactive detection ----------------------------------------------
# Interactive UX (gum) is used ONLY when all of these hold:
#   * WORKSHOP_NONINTERACTIVE is not set to 1
#   * CI is not "true"
#   * stdin is a TTY
#   * gum is on PATH
# Otherwise every prompt takes its documented default with no output blocking.
is_noninteractive() {
  [ "${WORKSHOP_NONINTERACTIVE:-0}" = "1" ] && return 0
  [ "${CI:-}" = "true" ] && return 0
  [ -t 0 ] || return 0
  return 1
}

have_gum() { command -v gum >/dev/null 2>&1; }

# Use gum only when interactive AND gum is present.
use_gum() {
  is_noninteractive && return 1
  have_gum || return 1
  return 0
}

# --- Output helpers (plain; gum styling is optional sugar layered on top) -----
say()  { printf '%s\n' "$*"; }
info() { printf '  %s\n' "$*"; }
ok()   { printf '[ OK ] %s\n' "$*"; }
warn() { printf '[WARN] %s\n' "$*"; }
err()  { printf '[FAIL] %s\n' "$*" >&2; }

# gum spin wrapper: spinner when interactive, plain exec otherwise. Always runs
# the SAME command, so behaviour is identical with or without gum.
spin() {
  local title="$1"
  shift
  if use_gum; then
    gum spin --title "$title" -- "$@"
  else
    info "$title"
    "$@"
  fi
}

# confirm — gate a destructive action. Returns 0 = proceed, non-zero = abort.
#
# Keyed off EXPLICIT signals only (never the TTY heuristic), so the decision is
# deterministic and unit-testable:
#   * --yes / WORKSHOP_ASSUME_YES=1  -> proceed unconditionally
#   * WORKSHOP_NONINTERACTIVE=1 or CI=true -> proceed with the default (the CI path)
#   * gum present -> interactive gum confirm (its exit is the answer)
#   * otherwise (no flag, no gum, no TTY) -> FAIL CLOSED (do not delete)
#   * plain TTY with no gum -> a plain [y/N] read
confirm() {
  local prompt="$1" reply
  [ "${WORKSHOP_ASSUME_YES:-0}" = "1" ] && return 0
  [ "${WORKSHOP_NONINTERACTIVE:-0}" = "1" ] && return 0
  [ "${CI:-}" = "true" ] && return 0
  if have_gum; then
    gum confirm "$prompt"
    return $?
  fi
  [ -t 0 ] || return 1
  printf '%s [y/N] ' "$prompt"
  read -r reply
  case "$reply" in
    [yY] | [yY][eE][sS]) return 0 ;;
    *) return 1 ;;
  esac
}

# --- Preflight ---------------------------------------------------------------
# OS / arch detect — informational; used to tailor hints (WSL2, licensing).
detect_os() {
  local uname_s
  uname_s="$(uname -s 2>/dev/null || echo unknown)"
  case "$uname_s" in
    Darwin) echo "macos" ;;
    Linux)
      if grep -qiE '(microsoft|wsl)' /proc/version 2>/dev/null; then
        echo "wsl2"
      else
        echo "linux"
      fi
      ;;
    MINGW* | MSYS* | CYGWIN*) echo "windows" ;;
    *) echo "unknown" ;;
  esac
}

# Container engine probe in preference order Docker → Podman (proposal §3.2).
# Prints the chosen engine on stdout; empty if none is reachable.
detect_engine() {
  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    echo "docker"
    return 0
  fi
  if command -v podman >/dev/null 2>&1 && podman info >/dev/null 2>&1; then
    echo "podman"
    return 0
  fi
  echo ""
  return 1
}

# Resource checks — WARN only. Never fail: a CI runner or a modest laptop must
# still proceed (kind itself will error later if truly starved).
check_resources() {
  local cpus="" mem_gib="" os="$1"
  case "$os" in
    macos)
      cpus="$(sysctl -n hw.ncpu 2>/dev/null || echo '')"
      local mem_bytes
      mem_bytes="$(sysctl -n hw.memsize 2>/dev/null || echo '')"
      [ -n "$mem_bytes" ] && mem_gib=$((mem_bytes / 1024 / 1024 / 1024))
      ;;
    *)
      cpus="$(nproc 2>/dev/null || echo '')"
      if [ -r /proc/meminfo ]; then
        local mem_kb
        mem_kb="$(awk '/MemTotal/{print $2; exit}' /proc/meminfo 2>/dev/null || echo '')"
        [ -n "$mem_kb" ] && mem_gib=$((mem_kb / 1024 / 1024))
      fi
      ;;
  esac
  if [ -n "$cpus" ] && [ "$cpus" -lt 4 ] 2>/dev/null; then
    warn "only ${cpus} CPUs detected — labs want >= 4; kind may be slow"
  else
    [ -n "$cpus" ] && info "CPUs: ${cpus}"
  fi
  if [ -n "$mem_gib" ] && [ "$mem_gib" -lt 8 ] 2>/dev/null; then
    warn "only ~${mem_gib} GiB RAM detected — labs want >= 8 GiB"
  else
    [ -n "$mem_gib" ] && info "RAM: ~${mem_gib} GiB"
  fi
}

# Print the Docker Desktop licensing note + alternatives (macOS/Windows only).
licensing_note() {
  local os="$1"
  case "$os" in
    macos | windows | wsl2)
      say ""
      say "Note on Docker Desktop (macOS/Windows): it is free only for small"
      say "orgs (< 250 employees AND < \$10M revenue). Vendor-neutral"
      say "alternatives that work with kind:"
      say "  * Podman Desktop (CNCF, Apache-2.0)"
      say "  * colima (macOS/Linux CLI)"
      say "See docs/setup.md for the WSL2 path and engine setup."
      ;;
    *) : ;;
  esac
}

preflight() {
  local os engine
  os="$(detect_os)"
  say "Preflight — OS: ${os}, arch: $(uname -m 2>/dev/null || echo unknown)"

  if [ "$os" = "windows" ]; then
    err "native Windows (PowerShell) is not supported — use WSL2."
    say "In an elevated PowerShell, once:"
    say "  wsl --install"
    say "  wsl --set-default-version 2"
    say "then re-run ./workshop up from inside your WSL2 distro. See docs/setup.md."
    return 1
  fi

  check_resources "$os"

  engine="$(detect_engine || true)"
  if [ -z "$engine" ]; then
    err "no reachable container engine (tried docker, then podman)."
    say "Start Docker Desktop or 'podman machine start' (rootful for kind), then retry."
    licensing_note "$os"
    return 1
  fi
  ok "container engine reachable: ${engine}"
  licensing_note "$os"
  return 0
}

# --- Tools (mise) ------------------------------------------------------------
# Install mise if absent (documented installer), then install the pinned
# toolchain from mise.toml, verified against mise.lock.
ensure_mise() {
  if command -v mise >/dev/null 2>&1; then
    ok "mise present: $(mise --version 2>/dev/null | head -1)"
    return 0
  fi
  warn "mise not found — installing it (https://mise.jdx.dev)."
  if is_noninteractive; then
    # CI images normally provide mise already; if not, fail loudly rather than
    # piping curl silently.
    err "mise is required but not installed, and this is a non-interactive run."
    say "Install mise first (brew install mise / winget install jdx.mise /"
    say "curl https://mise.run | sh) then re-run. See docs/setup.md."
    return 1
  fi
  # Interactive: the documented installer (checksummed by upstream).
  curl -fsSL https://mise.run | sh
  # mise installs to ~/.local/bin by default.
  export PATH="$HOME/.local/bin:$PATH"
  command -v mise >/dev/null 2>&1 || {
    err "mise install did not put 'mise' on PATH — see https://mise.jdx.dev/getting-started.html"
    return 1
  }
  ok "mise installed"
}

install_tools() {
  ensure_mise || return 1
  # --locked pins to mise.lock (real checksums); mise trust is required for a
  # config it has not seen. Run from the repo root so it finds mise.toml.
  ( cd "$REPO_ROOT" && mise trust >/dev/null 2>&1 || true )
  spin "Installing pinned toolchain (mise install --locked)" \
    sh -c "cd '$REPO_ROOT' && mise install --locked" || {
    err "mise install failed — see the output above; check mise.lock covers your platform."
    return 1
  }
  ok "toolchain installed and verified against mise.lock"
}

# --- Cluster (delegated to the Makefile) -------------------------------------
cluster_up() {
  spin "Creating the kind cluster (make kind-up)" \
    make -C "$REPO_ROOT" kind-up || {
    err "kind cluster creation failed — see output above."
    return 1
  }
  ok "kind cluster '${WORKSHOP_CLUSTER_NAME}' ready"
}

cluster_down() {
  spin "Deleting the kind cluster (make kind-down)" \
    make -C "$REPO_ROOT" kind-down || {
    err "kind cluster deletion failed — see output above."
    return 1
  }
  ok "kind cluster '${WORKSHOP_CLUSTER_NAME}' removed"
}

# --- doctor (delegated) ------------------------------------------------------
run_doctor() {
  WORKSHOP_NONINTERACTIVE="${WORKSHOP_NONINTERACTIVE:-1}" "$SCRIPT_DIR/doctor.sh"
}

# --- Subcommands -------------------------------------------------------------
cmd_up() {
  say "workshop up — bring up a local, lab-ready kind cluster"
  preflight || return 1
  install_tools || return 1
  cluster_up || return 1
  say ""
  say "Running doctor to confirm the environment is lab-ready…"
  if run_doctor; then
    say ""
    ok "environment is ready — start with labs/day-1/00-setup.md"
    return 0
  else
    err "doctor found problems — see the report above."
    return 1
  fi
}

cmd_down() {
  if ! confirm "Delete the kind cluster '${WORKSHOP_CLUSTER_NAME}'?"; then
    say "Aborted — nothing was deleted."
    return 0
  fi
  cluster_down || return 1
}

cmd_doctor() {
  run_doctor
}

usage() {
  cat <<EOF
Usage: ./workshop <command> [flags]

Commands:
  up        preflight, install pinned tools, create the kind cluster, run doctor
  down      delete the kind cluster (asks for confirmation)
  doctor    check the environment is lab-ready

Flags:
  -y, --yes            assume "yes" to confirmations (for 'down')
  -h, --help           show this help

Environment:
  WORKSHOP_NONINTERACTIVE=1   never prompt; take defaults (also implied by
                              CI=true or a non-TTY stdin) — the CI path.
EOF
}

main() {
  local cmd="${1:-}"
  shift || true

  # Parse global flags (order-independent after the subcommand).
  local args=()
  while [ "$#" -gt 0 ]; do
    case "$1" in
      -y | --yes) export WORKSHOP_ASSUME_YES=1 ;;
      -h | --help) usage; return 0 ;;
      *) args+=("$1") ;;
    esac
    shift
  done
  set -- "${args[@]:-}"

  case "$cmd" in
    up) cmd_up ;;
    down) cmd_down ;;
    doctor) cmd_doctor ;;
    -h | --help | help | "") usage ;;
    *)
      err "unknown command: ${cmd}"
      usage
      return 2
      ;;
  esac
}

main "$@"
