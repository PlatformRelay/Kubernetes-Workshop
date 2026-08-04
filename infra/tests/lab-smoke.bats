#!/usr/bin/env bats
# US-ENV-4A — disposable-cluster lab smoke orchestration (mocked; no real kind).

load helpers

setup() {
  setup_mocks
  chmod +x "$ROOT"/infra/tests/stubs/* "$ROOT/infra/bootstrap.sh" "$ROOT/workshop" \
    "$ROOT/infra/lab-smoke.sh" "$ROOT/infra/lab-smoke-drivers.sh" 2>/dev/null || true
  export WORKSHOP_NONINTERACTIVE=1
  export WORKSHOP_ASSUME_YES=1
  export MOCK_ENGINE_UP=1
  export MOCK_CLUSTER_EXISTS=1
  export LAB_SMOKE_SKIP_REMOTE_PROFILE=1
  export LAB_SMOKE_ARTIFACTS="$BATS_TEST_TMPDIR/artifacts"
  mkdir -p "$LAB_SMOKE_ARTIFACTS"
}

@test "lab-smoke --help documents modes" {
  run "$ROOT/infra/lab-smoke.sh" --help
  [ "$status" -eq 0 ]
  echo "$output" | grep -q "pr-day1"
  echo "$output" | grep -q "schedule-day2"
  echo "$output" | grep -q "schedule-day3"
}

@test "pr-day1 selection skips local-container labs" {
  run "$ROOT/infra/lab-smoke.sh" --list pr-day1
  [ "$status" -eq 0 ]
  echo "$output" | grep -q 'day-1/05-pod'
  echo "$output" | grep -q 'day-1/08-ingress'
  ! echo "$output" | grep -q 'day-1/01-containers'
  ! echo "$output" | grep -q 'day-1/02-container-security'
}

@test "pr-day1 orchestration boots, doctors, smokes, tears down" {
  export LAB_SMOKE_DRIVER_STUB=1
  run "$ROOT/infra/lab-smoke.sh" pr-day1
  [ "$status" -eq 0 ]
  echo "$output" | grep -q 'bootstrap'
  echo "$output" | grep -q 'doctor'
  echo "$output" | grep -q 'day-1/05-pod'
  echo "$output" | grep -q 'teardown\|Deleting\|kind-down\|down'
  # Idempotence: bootstrap/up ran, and a second profile/bootstrap pass is noted.
  echo "$output" | grep -qi 'idempoten'
}

@test "failure preserves diagnostics under LAB_SMOKE_ARTIFACTS" {
  export LAB_SMOKE_DRIVER_STUB=1
  export LAB_SMOKE_FORCE_FAIL_LAB=day-1/05-pod
  export LAB_SMOKE_SKIP_TEARDOWN=1
  run "$ROOT/infra/lab-smoke.sh" pr-day1
  [ "$status" -ne 0 ]
  [ -d "$LAB_SMOKE_ARTIFACTS" ]
  # At least one diagnostic file should exist after failure.
  local count
  count="$(find "$LAB_SMOKE_ARTIFACTS" -type f | wc -l | tr -d ' ')"
  [ "$count" -ge 1 ]
}

@test "pr-day1 fails closed when selection yields no labs" {
  export LAB_SMOKE_DRIVER_STUB=1
  export LAB_SMOKE_SKIP_BOOTSTRAP=1
  export LAB_SMOKE_SKIP_IDEMPOTENCE=1
  export LAB_SMOKE_SKIP_TEARDOWN=1
  # Point at an empty inventory so selection cannot silently succeed.
  export LAB_SMOKE_INVENTORY="$BATS_TEST_TMPDIR/empty-inventory.json"
  cat >"$LAB_SMOKE_INVENTORY" <<'EOF'
{ "schemaVersion": 1, "labs": [] }
EOF
  run "$ROOT/infra/lab-smoke.sh" pr-day1
  [ "$status" -ne 0 ]
  echo "$output" | grep -qi 'no labs\|empty\|selection'
}

@test "schedule-day2 selection is day-2 kind labs only" {
  run "$ROOT/infra/lab-smoke.sh" --list schedule-day2
  [ "$status" -eq 0 ]
  echo "$output" | grep -q 'day-2/09-gateway-api'
  ! echo "$output" | grep -q 'day-1/'
  ! echo "$output" | grep -q 'day-3/'
}

@test "schedule-day2 refuses DRIVER_STUB (no Status passed)" {
  export LAB_SMOKE_DRIVER_STUB=1
  export LAB_SMOKE_SKIP_BOOTSTRAP=1
  export LAB_SMOKE_SKIP_IDEMPOTENCE=1
  export LAB_SMOKE_SKIP_TEARDOWN=1
  export LAB_SMOKE_SKIP_DOCTOR=1
  export LAB_SMOKE_SKIP_PROFILE=1
  run "$ROOT/infra/lab-smoke.sh" schedule-day2
  [ "$status" -ne 0 ]
  echo "$output" | grep -qi 'DRIVER_STUB\|not allowed\|refused'
  # Early refuse must not write evidence (vacuous !passed if file missing).
  [ ! -f "$LAB_SMOKE_ARTIFACTS/summary-schedule-day2.md" ]
}

@test "schedule-day3 refuses DRIVER_STUB (no Status passed)" {
  export LAB_SMOKE_DRIVER_STUB=1
  export LAB_SMOKE_SKIP_BOOTSTRAP=1
  export LAB_SMOKE_SKIP_IDEMPOTENCE=1
  export LAB_SMOKE_SKIP_TEARDOWN=1
  export LAB_SMOKE_SKIP_DOCTOR=1
  export LAB_SMOKE_SKIP_PROFILE=1
  run "$ROOT/infra/lab-smoke.sh" schedule-day3
  [ "$status" -ne 0 ]
  echo "$output" | grep -qi 'DRIVER_STUB\|not allowed\|refused'
  # Early refuse must not write evidence (vacuous !passed if file missing).
  [ ! -f "$LAB_SMOKE_ARTIFACTS/summary-schedule-day3.md" ]
}

@test "lab_smoke_lab_is_scaffold_only marks only deferred kubebuilder" {
  run bash -c '
    # shellcheck source=/dev/null
    . "$ROOT/infra/lab-smoke.sh"
    lab_smoke_lab_is_scaffold_only day-3/24-kubebuilder
  '
  [ "$status" -eq 0 ]

  run bash -c '
    # shellcheck source=/dev/null
    . "$ROOT/infra/lab-smoke.sh"
    lab_smoke_lab_is_scaffold_only day-2/09-gateway-api
  '
  [ "$status" -eq 1 ]

  run bash -c '
    # shellcheck source=/dev/null
    . "$ROOT/infra/lab-smoke.sh"
    lab_smoke_lab_is_scaffold_only day-3/21-gitops
  '
  [ "$status" -eq 1 ]
}

@test "schedule-day2 inventory labs are not scaffold-only" {
  run "$ROOT/infra/lab-smoke.sh" --list schedule-day2
  [ "$status" -eq 0 ]
  while IFS= read -r id; do
    [ -n "$id" ] || continue
    run bash -c '
      # shellcheck source=/dev/null
      . "$ROOT/infra/lab-smoke.sh"
      lab_smoke_lab_is_scaffold_only "$1"
    ' _ "$id"
    [ "$status" -eq 1 ]
  done <<<"$output"
}

@test "schedule-day3 inventory labs are not scaffold-only" {
  run "$ROOT/infra/lab-smoke.sh" --list schedule-day3
  [ "$status" -eq 0 ]
  while IFS= read -r id; do
    [ -n "$id" ] || continue
    run bash -c '
      # shellcheck source=/dev/null
      . "$ROOT/infra/lab-smoke.sh"
      lab_smoke_lab_is_scaffold_only "$1"
    ' _ "$id"
    [ "$status" -eq 1 ]
  done <<<"$output"
}

@test "pr-day1 evidence records architecture and profile" {
  export LAB_SMOKE_DRIVER_STUB=1
  export LAB_SMOKE_SKIP_TEARDOWN=1
  run "$ROOT/infra/lab-smoke.sh" pr-day1
  [ "$status" -eq 0 ]
  [ -f "$LAB_SMOKE_ARTIFACTS/summary-pr-day1.md" ]
  grep -Eq 'Architecture: `(x86_64|amd64|arm64|aarch64|unknown)`' "$LAB_SMOKE_ARTIFACTS/summary-pr-day1.md"
  grep -Eq 'Profile: `(day-1|bare|none|stub:day-1)`' "$LAB_SMOKE_ARTIFACTS/summary-pr-day1.md"
}

@test "day-1 ingress driver asserts HTTP Host curls (REL-001)" {
  grep -q 'lab_smoke_assert_http_host' "$ROOT/infra/lab-smoke-drivers.sh"
  grep -q 'web.example.com' "$ROOT/infra/lab-smoke-drivers.sh"
  grep -q 'web2.example.com' "$ROOT/infra/lab-smoke-drivers.sh"
  grep -q 'Host:' "$ROOT/infra/lab-smoke-drivers.sh"
}

@test "failed finish surfaces teardown failure instead of swallowing it (REL-002)" {
  # Source-level: must not use teardown || true on the failure path.
  ! grep -nE 'lab_smoke_teardown \|\| true' "$ROOT/infra/lab-smoke.sh"
  grep -q 'teardown also failed after lab failure' "$ROOT/infra/lab-smoke.sh"
}
