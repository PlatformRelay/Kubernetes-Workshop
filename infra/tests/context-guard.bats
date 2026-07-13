#!/usr/bin/env bats
# Unit tests for infra/context-guard.sh — the reusable kind-only safety guard
# that gates every destructive/offensive lab step (US-BETA-4). Run against a
# mocked kubectl (infra/tests/stubs); no real cluster or context is touched.
#
# The point of this suite is the NEGATIVE case: on a shared/prod context the
# guard must refuse AND the guarded mutating step must never run. We model the
# guarded steps in the shape the lab actually uses (S25 Steps 1/2/3) so the
# "no mutating kubectl call" assertion is real, not vacuously true — it covers
# every verb the lab issues against the current context: exec, apply, label,
# delete.

load helpers

setup() {
  setup_mocks
  chmod +x "$ROOT"/infra/tests/stubs/* "$ROOT/infra/context-guard.sh"
}

# Compose a guarded step exactly as a lab does: run the guard, abort BEFORE the
# mutating call if it refuses, otherwise issue it. $1 is the mutating kubectl
# argument string (verb + args) — e.g. the real S25 payloads.
write_guarded_step() {
  cat > "$BATS_TEST_TMPDIR/guarded-step.sh" <<EOF
#!/usr/bin/env sh
"$ROOT/infra/context-guard.sh" || exit \$?
kubectl $1
EOF
  chmod +x "$BATS_TEST_TMPDIR/guarded-step.sh"
}

# Allowlist-style assertion (F3): after a refused step, the ONLY kubectl call in
# the log must be the guard's own `config current-context` read. Any other verb
# (exec/apply/label/delete/run/cp/…) means a mutating step slipped the gate.
assert_only_guard_read_in_log() {
  # every logged kubectl line, minus the guard's own read, must be empty
  local leaked
  leaked="$(grep '^kubectl ' "$MOCK_LOG" | grep -v '^kubectl config current-context$' || true)"
  [ -z "$leaked" ] || {
    echo "leaked mutating call(s) past the guard:" >&2
    echo "$leaked" >&2
    return 1
  }
}

@test "guard allows a kind- context (exits 0)" {
  export MOCK_KUBECTL_CONTEXT="kind-foo"
  run "$ROOT/infra/context-guard.sh"
  [ "$status" -eq 0 ]
  echo "$output" | grep -q "OK: current context is 'kind-foo'"
}

@test "guard refuses an EKS (arn:aws:...) context (non-zero + clear message)" {
  export MOCK_KUBECTL_CONTEXT="arn:aws:eks:eu-central-1:123456789012:cluster/prod"
  run "$ROOT/infra/context-guard.sh"
  [ "$status" -ne 0 ]
  echo "$output" | grep -q "REFUSING"
}

@test "guard refuses a GKE (gke_...) context (non-zero + clear message)" {
  export MOCK_KUBECTL_CONTEXT="gke_my-project_europe-west1_prod"
  run "$ROOT/infra/context-guard.sh"
  [ "$status" -ne 0 ]
  echo "$output" | grep -q "REFUSING"
}

@test "guarded step RUNS the mutating call on a kind- context" {
  export MOCK_KUBECTL_CONTEXT="kind-foo"
  write_guarded_step "apply -f pod-escape.yaml"
  run "$BATS_TEST_TMPDIR/guarded-step.sh"
  [ "$status" -eq 0 ]
  # the gate opened, so the mutating call was made (proves the assertion below
  # is non-vacuous: this exact call CAN reach the log)
  grep -q "kubectl apply -f pod-escape.yaml" "$MOCK_LOG"
}

# --- Negative cases: every mutating verb the lab uses, on both shared/prod
#     context shapes the AC names (arn:… and gke_…). Each asserts non-zero exit
#     AND that ONLY the guard's read reached the log (F3 allowlist). ---

# Step 2/4 — the offensive host read / escape Pod apply
@test "EKS: guarded 'exec' (Step 2 escape read) refuses, no mutating call" {
  export MOCK_KUBECTL_CONTEXT="arn:aws:eks:eu-central-1:123456789012:cluster/prod"
  write_guarded_step "exec escape -- cat /host/etc/os-release"
  run "$BATS_TEST_TMPDIR/guarded-step.sh"
  [ "$status" -ne 0 ]
  grep -q "kubectl config current-context" "$MOCK_LOG"   # the guard's own read is expected
  assert_only_guard_read_in_log
}

@test "GKE: guarded 'apply' (Step 2/3 escape Pod) refuses, no mutating call" {
  export MOCK_KUBECTL_CONTEXT="gke_my-project_europe-west1_prod"
  write_guarded_step "apply -f pod-escape.yaml"
  run "$BATS_TEST_TMPDIR/guarded-step.sh"
  [ "$status" -ne 0 ]
  assert_only_guard_read_in_log
}

# Step 1 — the security-posture downgrade (enforce=privileged)
@test "EKS: guarded 'label …enforce=privileged' (Step 1) refuses, no mutating call" {
  export MOCK_KUBECTL_CONTEXT="arn:aws:eks:eu-central-1:123456789012:cluster/prod"
  write_guarded_step "label --overwrite namespace escape pod-security.kubernetes.io/enforce=privileged"
  run "$BATS_TEST_TMPDIR/guarded-step.sh"
  [ "$status" -ne 0 ]
  assert_only_guard_read_in_log
}

# Step 3 — delete then re-apply the escape Pod
@test "GKE: guarded 'delete' (Step 3) refuses, no mutating call" {
  export MOCK_KUBECTL_CONTEXT="gke_my-project_europe-west1_prod"
  write_guarded_step "delete -f pod-escape.yaml"
  run "$BATS_TEST_TMPDIR/guarded-step.sh"
  [ "$status" -ne 0 ]
  assert_only_guard_read_in_log
}

@test "EKS: guarded 'label …enforce=restricted' (Step 3) refuses, no mutating call" {
  export MOCK_KUBECTL_CONTEXT="arn:aws:eks:eu-central-1:123456789012:cluster/prod"
  write_guarded_step "label --overwrite namespace escape pod-security.kubernetes.io/enforce=restricted"
  run "$BATS_TEST_TMPDIR/guarded-step.sh"
  [ "$status" -ne 0 ]
  assert_only_guard_read_in_log
}

@test "S25's inline guard IS the shared snippet (byte-identical body)" {
  # Extract the heredoc body between `cat > context-check.sh <<'EOF'` and the
  # closing `EOF`, and assert it matches the canonical infra/context-guard.sh.
  lab="$ROOT/labs/day-3/25-pod-escape.md"
  awk "/cat > context-check.sh <<'EOF'/{f=1;next} f&&/^EOF\$/{f=0} f" "$lab" \
    > "$BATS_TEST_TMPDIR/lab-guard.sh"
  run diff -u "$ROOT/infra/context-guard.sh" "$BATS_TEST_TMPDIR/lab-guard.sh"
  [ "$status" -eq 0 ]
}
