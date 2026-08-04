#!/usr/bin/env bash
# infra/lab-smoke.sh — disposable-cluster lab smoke (US-ENV-4A).
#
# Boots via ./workshop, runs doctor, executes inventory-selected labs, asserts
# deterministic observations, cleans up between labs, and tears the cluster down.
# On failure, dumps diagnostics under LAB_SMOKE_ARTIFACTS.
#
# Modes:
#   pr-day1         Day-1 kind PR smoke (skips local-container labs)
#   schedule-day2   Day-2 kind labs (asserted drivers; fail-closed on deferred only)
#   schedule-day3   Day-3 kind labs (asserted drivers; fail-closed on deferred only)
#   lab <id>        single lab id (e.g. day-1/05-pod); cluster must already exist
#
# Env knobs:
#   LAB_SMOKE_NS                 working namespace (default: workshop-smoke)
#   LAB_SMOKE_ARTIFACTS          diagnostics directory
#   LAB_SMOKE_SKIP_BOOTSTRAP=1   skip ./workshop up
#   LAB_SMOKE_SKIP_TEARDOWN=1    skip ./workshop down
#   LAB_SMOKE_SKIP_IDEMPOTENCE=1 skip cheap bootstrap/profile re-run
#   LAB_SMOKE_SKIP_DOCTOR=1      skip ./workshop doctor
#   LAB_SMOKE_SKIP_PROFILE=1     skip profile install
#   LAB_SMOKE_DRIVER_STUB=1      stub drivers (unit tests; pr-day1 only —
#                                refused on schedule-day2/3)
#   LAB_SMOKE_FORCE_FAIL_LAB=id  force a lab failure (unit tests)
#   LAB_SMOKE_ALLOW_SCAFFOLD=1   permit exit 0 for schedule shards that only
#                                scaffolded — evidence Status stays `scaffold`,
#                                never `passed`

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# shellcheck source=versions.env disable=SC1091
. "$SCRIPT_DIR/versions.env"

LAB_SMOKE_NS="${LAB_SMOKE_NS:-workshop-smoke}"
LAB_SMOKE_ARTIFACTS="${LAB_SMOKE_ARTIFACTS:-$REPO_ROOT/docs/validation-evidence/last-smoke}"
LAB_SMOKE_INVENTORY="${LAB_SMOKE_INVENTORY:-$REPO_ROOT/infra/lab-inventory.json}"
export LAB_SMOKE_NS LAB_SMOKE_ARTIFACTS REPO_ROOT LAB_SMOKE_INVENTORY

# Runtime evidence fields (reset per selection run).
LAB_SMOKE_SCAFFOLD_COUNT=0
LAB_SMOKE_SCAFFOLD_LABS=""
LAB_SMOKE_PROFILE_USED="none"
LAB_SMOKE_ARCH="$(uname -m 2>/dev/null || echo unknown)"
LAB_SMOKE_TIMINGS=""

lab_smoke_say()  { printf '%s\n' "$*"; }
lab_smoke_ok()   { printf '[ OK ] %s\n' "$*"; }
lab_smoke_info() { printf '  %s\n' "$*"; }
lab_smoke_err()  { printf '[FAIL] %s\n' "$*" >&2; }

lab_smoke_usage() {
  cat <<EOF
Usage: infra/lab-smoke.sh <mode>

  pr-day1         bootstrap + doctor + Day-1 kind PR smoke + teardown
  schedule-day2   Day-2 shard (asserted per-lab drivers)
  schedule-day3   Day-3 shard (asserted per-lab drivers)
  lab <id>        run one inventory lab id against an existing cluster

Inventory: infra/lab-inventory.json (generated from docs/validation-matrix.md).
Local-container labs (S01/S02) are never selected for kind smoke.

Schedule shards never write Status:passed for scaffold-only drivers. Set
LAB_SMOKE_ALLOW_SCAFFOLD=1 for an explicit local/dispatch probe that still
records Status:scaffold (exit 0) without claiming a lab assertion pass.

LAB_SMOKE_DRIVER_STUB=1 is allowed for pr-day1 unit tests only. Schedule
shards refuse stub mode so it cannot paper-green with Status:passed.
EOF
}

lab_smoke_mark_scaffold() {
  local lab_id="$1"
  LAB_SMOKE_SCAFFOLD_COUNT=$((LAB_SMOKE_SCAFFOLD_COUNT + 1))
  if [ -n "$LAB_SMOKE_SCAFFOLD_LABS" ]; then
    LAB_SMOKE_SCAFFOLD_LABS="${LAB_SMOKE_SCAFFOLD_LABS} ${lab_id}"
  else
    LAB_SMOKE_SCAFFOLD_LABS="${lab_id}"
  fi
}

# Fail-closed only for explicitly deferred labs (not on schedule shards).
lab_smoke_lab_is_scaffold_only() {
  case "$1" in
    day-3/24-kubebuilder) return 0 ;;
    *) return 1 ;;
  esac
}

lab_smoke_record_timing() {
  local phase="$1" seconds="$2"
  LAB_SMOKE_TIMINGS="${LAB_SMOKE_TIMINGS}- ${phase}: ${seconds}s"$'\n'
}

# Put mise-pinned tools (kubectl, kind, jq) on PATH when available.
lab_smoke_activate_toolchain() {
  local mise_path=""
  if command -v mise >/dev/null 2>&1; then
    mise_path="$(command -v mise)"
  elif [ -n "${HOME:-}" ] && [ -x "$HOME/.local/bin/mise" ]; then
    mise_path="$HOME/.local/bin/mise"
    export PATH="$HOME/.local/bin:$PATH"
  fi
  if [ -n "$mise_path" ]; then
    # shellcheck disable=SC1091
    eval "$("$mise_path" activate bash)" || true
    ( cd "$REPO_ROOT" && "$mise_path" trust >/dev/null 2>&1 ) || true
  fi
}

lab_smoke_require_tools() {
  local missing=0
  command -v jq >/dev/null 2>&1 || {
    lab_smoke_err "jq is required to read ${LAB_SMOKE_INVENTORY}"
    missing=1
  }
  if [ "${LAB_SMOKE_DRIVER_STUB:-0}" != "1" ] && [ "${LAB_SMOKE_SKIP_BOOTSTRAP:-0}" != "1" ]; then
    command -v kubectl >/dev/null 2>&1 || {
      lab_smoke_err "kubectl is required on PATH (activate mise or run via ./workshop toolchain)"
      missing=1
    }
  fi
  return "$missing"
}

lab_smoke_selected_ids() {
  local selection="$1"
  local query=""
  case "$selection" in
    pr-day1) query='.labs[] | select(.prSmoke == true) | .id' ;;
    schedule-day2) query='.labs[] | select(.day == 2 and .scheduleSmoke == true) | .id' ;;
    schedule-day3) query='.labs[] | select(.day == 3 and .scheduleSmoke == true) | .id' ;;
    all-kind)
      query='.labs[] | select(.automationTier == "kind-cluster" or .automationTier == "kind-addon") | .id'
      ;;
    *)
      lab_smoke_err "unknown selection '${selection}'"
      return 2
      ;;
  esac
  if [ ! -f "$LAB_SMOKE_INVENTORY" ]; then
    lab_smoke_err "missing inventory: ${LAB_SMOKE_INVENTORY}"
    return 1
  fi
  jq -r "$query" "$LAB_SMOKE_INVENTORY"
}

lab_smoke_selection_or_die() {
  local selection="$1"
  local out
  if ! out="$(lab_smoke_selected_ids "$selection")"; then
    lab_smoke_err "failed to select labs for ${selection}"
    return 1
  fi
  if [ -z "$(printf '%s' "$out" | tr -d '[:space:]')" ]; then
    lab_smoke_err "no labs selected for ${selection} (refusing empty smoke)"
    return 1
  fi
  printf '%s\n' "$out"
}

lab_smoke_ensure_ns() {
  local phase=""
  if kubectl get ns "$LAB_SMOKE_NS" >/dev/null 2>&1; then
    phase="$(kubectl get ns "$LAB_SMOKE_NS" -o jsonpath='{.status.phase}' 2>/dev/null || true)"
    if [ "$phase" = "Terminating" ]; then
      lab_smoke_info "waiting for ${LAB_SMOKE_NS} to finish terminating"
      if ! kubectl wait --for=delete "namespace/${LAB_SMOKE_NS}" --timeout=180s >/dev/null 2>&1; then
        kubectl delete namespace "$LAB_SMOKE_NS" --force --grace-period=0 >/dev/null 2>&1 || true
        kubectl wait --for=delete "namespace/${LAB_SMOKE_NS}" --timeout=120s >/dev/null 2>&1 || true
      fi
    fi
  fi
  kubectl get ns "$LAB_SMOKE_NS" >/dev/null 2>&1 \
    || kubectl create namespace "$LAB_SMOKE_NS"
  export NS="$LAB_SMOKE_NS"
}

lab_smoke_assert_ns_clean() {
  local leftovers
  leftovers="$(
    kubectl get deploy,sts,ds,job,cronjob,pod,svc,ingress,cm,secret,pvc \
      -n "$LAB_SMOKE_NS" -o name 2>/dev/null \
      | grep -Ev '^(secret/default-token|secret/.*-token-|secret/.*-dockercfg|configmap/kube-root-ca\.crt)' \
      || true
  )"
  if [ -n "$leftovers" ]; then
    lab_smoke_err "namespace ${LAB_SMOKE_NS} not clean after lab:"
    printf '%s\n' "$leftovers" >&2
    return 1
  fi
  return 0
}

lab_smoke_dump_diagnostics() {
  local lab_id="${1:-unknown}"
  local dest="$LAB_SMOKE_ARTIFACTS/${lab_id//\//_}"
  mkdir -p "$dest"
  lab_smoke_say "preserving diagnostics under $dest"
  {
    echo "lab=$lab_id"
    echo "ns=$LAB_SMOKE_NS"
    echo "arch=$LAB_SMOKE_ARCH"
    echo "profile=$LAB_SMOKE_PROFILE_USED"
    echo "date=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "commit=$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || echo unknown)"
    echo "kubectl=$(kubectl version --client 2>/dev/null || true)"
  } >"$dest/meta.txt" || true
  kubectl get nodes -o wide >"$dest/nodes.txt" 2>&1 || true
  kubectl get events -A --sort-by=.lastTimestamp >"$dest/events.txt" 2>&1 || true
  kubectl get all,ingress,cm,secret,pvc -n "$LAB_SMOKE_NS" -o wide >"$dest/ns.txt" 2>&1 || true
  kubectl describe nodes >"$dest/describe-nodes.txt" 2>&1 || true
  kubectl get pods -A -o wide >"$dest/pods-all.txt" 2>&1 || true
}

# shellcheck source=lab-smoke-drivers.sh disable=SC1091
. "$SCRIPT_DIR/lab-smoke-drivers.sh"

lab_smoke_run_lab() {
  local lab_id="$1" t0 t1
  lab_smoke_say "==> smoke ${lab_id}"
  if [ "${LAB_SMOKE_FORCE_FAIL_LAB:-}" = "$lab_id" ]; then
    lab_smoke_err "forced failure for ${lab_id}"
    lab_smoke_dump_diagnostics "$lab_id"
    return 1
  fi
  if [ "${LAB_SMOKE_DRIVER_STUB:-0}" = "1" ]; then
    lab_smoke_ok "stub driver ${lab_id}"
    return 0
  fi
  if lab_smoke_lab_is_scaffold_only "$lab_id"; then
    lab_smoke_driver_scaffold "$lab_id"
    return 0
  fi
  t0="$(date +%s)"
  lab_smoke_ensure_ns
  "lab_smoke_driver_${lab_id//[-\/]/_}" || {
    lab_smoke_dump_diagnostics "$lab_id"
    return 1
  }
  lab_smoke_assert_ns_clean || {
    lab_smoke_dump_diagnostics "$lab_id"
    return 1
  }
  t1="$(date +%s)"
  lab_smoke_record_timing "lab ${lab_id}" "$((t1 - t0))"
  lab_smoke_ok "${lab_id}"
}

lab_smoke_bootstrap() {
  local t0 t1
  if [ "${LAB_SMOKE_SKIP_BOOTSTRAP:-0}" = "1" ]; then
    lab_smoke_info "skip bootstrap"
    return 0
  fi
  lab_smoke_say "==> bootstrap (./workshop up)"
  t0="$(date +%s)"
  ( cd "$REPO_ROOT" && ./workshop up )
  t1="$(date +%s)"
  lab_smoke_record_timing "bootstrap" "$((t1 - t0))"
}

lab_smoke_doctor() {
  local t0 t1
  if [ "${LAB_SMOKE_SKIP_DOCTOR:-0}" = "1" ]; then
    lab_smoke_info "skip doctor"
    return 0
  fi
  lab_smoke_say "==> doctor"
  t0="$(date +%s)"
  ( cd "$REPO_ROOT" && ./workshop doctor )
  t1="$(date +%s)"
  lab_smoke_record_timing "doctor" "$((t1 - t0))"
}

lab_smoke_idempotence() {
  local t0 t1
  if [ "${LAB_SMOKE_SKIP_IDEMPOTENCE:-0}" = "1" ]; then
    return 0
  fi
  lab_smoke_say "==> idempotence (./workshop up again)"
  t0="$(date +%s)"
  ( cd "$REPO_ROOT" && ./workshop up )
  t1="$(date +%s)"
  lab_smoke_record_timing "idempotence-bootstrap" "$((t1 - t0))"
  lab_smoke_ok "bootstrap idempotent"
}

lab_smoke_maybe_profile() {
  local selection="$1" need_profile="" t0 t1
  case "$selection" in
    pr-day1) need_profile=day-1 ;;
    schedule-day2) need_profile=day-2 ;;
    schedule-day3) need_profile=day-3 ;;
    *)
      LAB_SMOKE_PROFILE_USED="none"
      return 0
      ;;
  esac
  if [ "${LAB_SMOKE_SKIP_PROFILE:-0}" = "1" ]; then
    LAB_SMOKE_PROFILE_USED="none"
    lab_smoke_info "skip profile ${need_profile}"
    return 0
  fi
  if [ "${LAB_SMOKE_DRIVER_STUB:-0}" = "1" ]; then
    LAB_SMOKE_PROFILE_USED="stub:${need_profile}"
    lab_smoke_ok "stub profile ${need_profile}"
    return 0
  fi
  if [ "${LAB_SMOKE_SKIP_REMOTE_PROFILE:-0}" = "1" ]; then
    export WORKSHOP_ADDON_SKIP_REMOTE=1
  fi
  lab_smoke_say "==> profile ${need_profile}"
  t0="$(date +%s)"
  ( cd "$REPO_ROOT" && ./workshop profile "$need_profile" )
  # Cheap idempotence for the profile install.
  ( cd "$REPO_ROOT" && ./workshop profile "$need_profile" )
  t1="$(date +%s)"
  LAB_SMOKE_PROFILE_USED="${need_profile}"
  lab_smoke_record_timing "profile ${need_profile}" "$((t1 - t0))"
  lab_smoke_ok "profile ${need_profile} idempotent"
}

lab_smoke_teardown() {
  local t0 t1
  if [ "${LAB_SMOKE_SKIP_TEARDOWN:-0}" = "1" ]; then
    lab_smoke_info "skip teardown"
    return 0
  fi
  lab_smoke_say "==> teardown (./workshop down --yes)"
  t0="$(date +%s)"
  ( cd "$REPO_ROOT" && ./workshop down --yes )
  t1="$(date +%s)"
  lab_smoke_record_timing "teardown" "$((t1 - t0))"
}

lab_smoke_write_evidence_stub() {
  local selection="$1" status="$2"
  local dest="$LAB_SMOKE_ARTIFACTS/summary-${selection}.md"
  local scaffold_note="" timings_block
  mkdir -p "$LAB_SMOKE_ARTIFACTS"
  if [ "$LAB_SMOKE_SCAFFOLD_COUNT" -gt 0 ]; then
    scaffold_note="- Scaffold labs (${LAB_SMOKE_SCAFFOLD_COUNT}): \`${LAB_SMOKE_SCAFFOLD_LABS}\`
- Note: scaffold means **no per-lab assertion** — this is not a kind-smoke claim."
  fi
  if [ -n "$LAB_SMOKE_TIMINGS" ]; then
    timings_block="$LAB_SMOKE_TIMINGS"
  else
    timings_block='- (none recorded)'
  fi
  cat >"$dest" <<EOF
# Lab smoke evidence — ${selection}

- Status: \`${status}\`
- UTC: $(date -u +%Y-%m-%dT%H:%M:%SZ)
- Commit: \`$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || echo unknown)\`
- Architecture: \`${LAB_SMOKE_ARCH}\`
- Profile: \`${LAB_SMOKE_PROFILE_USED}\`
- Kubernetes pin: \`${KIND_NODE_IMAGE}\`
- Namespace: \`${LAB_SMOKE_NS}\`
${scaffold_note}

## Wall-clock timings

${timings_block}

This file records an **automation** run. It does **not** upgrade rows in
\`docs/validation-matrix.md\` to \`kind-smoke\` and does **not** claim pedagogical
validation (US-BETA-6). Promote matrix state only after a maintainer records a
real end-to-end result. \`Status:passed\` is reserved for asserted lab drivers;
scaffold-only shards must use \`Status:scaffold\`.
EOF
}

lab_smoke_finish() {
  local selection="$1" lab_rc="$2"
  local status exit_rc

  if [ "$lab_rc" -ne 0 ]; then
    status="failed"
    exit_rc="$lab_rc"
  elif [ "$LAB_SMOKE_SCAFFOLD_COUNT" -gt 0 ]; then
    # Never paper-green unasserted labs.
    status="scaffold"
    if [ "${LAB_SMOKE_ALLOW_SCAFFOLD:-0}" = "1" ]; then
      exit_rc=0
      lab_smoke_info "ALLOW_SCAFFOLD=1 — exiting 0 with Status:scaffold (not passed)"
    else
      exit_rc=78
      lab_smoke_err "scaffold-only shard refused Status:passed (set LAB_SMOKE_ALLOW_SCAFFOLD=1 for explicit probe)"
    fi
  else
    status="passed"
    exit_rc=0
  fi

  lab_smoke_write_evidence_stub "$selection" "$status"

  if [ "$lab_rc" -ne 0 ]; then
    lab_smoke_err "lab-smoke ${selection} failed — diagnostics kept"
    if ! lab_smoke_teardown; then
      lab_smoke_err "teardown also failed after lab failure — cluster may still be running; run: ./workshop down --yes"
      # Prefer the original lab failure code; surface teardown via logs (REL-002).
    fi
  else
    if ! lab_smoke_teardown; then
      lab_smoke_err "teardown failed — cluster may still be running; run: ./workshop down --yes"
      return 1
    fi
    if [ "$exit_rc" -eq 0 ] && [ "$status" = "passed" ]; then
      lab_smoke_ok "lab-smoke ${selection} complete"
    elif [ "$status" = "scaffold" ]; then
      lab_smoke_info "lab-smoke ${selection} finished as scaffold (not a green lab assertion)"
    fi
  fi
  return "$exit_rc"
}

lab_smoke_refuse_stub_on_schedule() {
  local selection="$1"
  case "$selection" in
    schedule-day2 | schedule-day3)
      if [ "${LAB_SMOKE_DRIVER_STUB:-0}" = "1" ]; then
        lab_smoke_err "LAB_SMOKE_DRIVER_STUB=1 is not allowed on ${selection} (refused — cannot paper-green schedule shards; stub is pr-day1 unit tests only)"
        return 1
      fi
      ;;
  esac
  return 0
}

lab_smoke_run_selection() {
  local selection="$1"
  local id rc=0 labs_file t_all0 t_all1
  mkdir -p "$LAB_SMOKE_ARTIFACTS"
  export WORKSHOP_NONINTERACTIVE=1
  export WORKSHOP_ASSUME_YES=1

  # Fail closed before any stub drivers / evidence Status:passed.
  lab_smoke_refuse_stub_on_schedule "$selection" || return 1

  LAB_SMOKE_SCAFFOLD_COUNT=0
  LAB_SMOKE_SCAFFOLD_LABS=""
  LAB_SMOKE_PROFILE_USED="none"
  LAB_SMOKE_ARCH="$(uname -m 2>/dev/null || echo unknown)"
  LAB_SMOKE_TIMINGS=""
  t_all0="$(date +%s)"

  lab_smoke_activate_toolchain
  lab_smoke_require_tools || return 1

  labs_file="$(mktemp "${TMPDIR:-/tmp}/lab-smoke-ids.XXXXXX")"
  if ! lab_smoke_selection_or_die "$selection" >"$labs_file"; then
    rm -f "$labs_file"
    return 1
  fi

  lab_smoke_bootstrap
  lab_smoke_doctor
  lab_smoke_idempotence
  # Re-activate after bootstrap in case PATH was not inherited by doctor helpers.
  lab_smoke_activate_toolchain
  if ! lab_smoke_require_tools; then
    rm -f "$labs_file"
    return 1
  fi
  lab_smoke_maybe_profile "$selection"

  while IFS= read -r id; do
    [ -n "$id" ] || continue
    if ! lab_smoke_run_lab "$id"; then
      rc=1
      break
    fi
  done <"$labs_file"
  rm -f "$labs_file"

  t_all1="$(date +%s)"
  lab_smoke_record_timing "wall-clock total" "$((t_all1 - t_all0))"

  lab_smoke_finish "$selection" "$rc"
}

lab_smoke_main() {
  local mode="${1:-}"
  case "$mode" in
    -h | --help | help | "")
      lab_smoke_usage
      return 0
      ;;
    --list)
      local selection="${2:-}"
      [ -n "$selection" ] || {
        lab_smoke_err "usage: infra/lab-smoke.sh --list <pr-day1|schedule-day2|schedule-day3>"
        return 2
      }
      lab_smoke_activate_toolchain
      command -v jq >/dev/null 2>&1 || {
        lab_smoke_err "jq is required for --list"
        return 1
      }
      lab_smoke_selection_or_die "$selection"
      ;;
    pr-day1 | schedule-day2 | schedule-day3)
      lab_smoke_run_selection "$mode"
      ;;
    lab)
      local lab_id="${2:-}"
      [ -n "$lab_id" ] || {
        lab_smoke_err "usage: infra/lab-smoke.sh lab <id>"
        return 2
      }
      lab_smoke_activate_toolchain
      LAB_SMOKE_ARCH="$(uname -m 2>/dev/null || echo unknown)"
      lab_smoke_run_lab "$lab_id"
      ;;
    *)
      lab_smoke_err "unknown mode: ${mode}"
      lab_smoke_usage
      return 2
      ;;
  esac
}

# Allow bats to source helpers without executing main.
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  lab_smoke_main "$@"
fi
