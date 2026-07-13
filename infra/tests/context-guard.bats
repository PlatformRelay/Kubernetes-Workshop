#!/usr/bin/env bats
# Unit tests for infra/context-guard.sh — the reusable kind-only safety guard
# that gates every destructive/offensive lab step (US-BETA-4). Run against a
# mocked kubectl (infra/tests/stubs); no real cluster or context is touched.
#
# The point of this suite is the NEGATIVE case: on a shared/prod context the
# guard must refuse AND the guarded offensive step must never run. We model a
# realistic "guard || abort; then attack" step in a temp script so the
# "no offensive kubectl call" assertion is real, not vacuously true.

load helpers

setup() {
  setup_mocks
  chmod +x "$ROOT"/infra/tests/stubs/* "$ROOT/infra/context-guard.sh"
}

# A minimal guarded offensive step, exactly as a lab composes it:
#   run the guard; if it refuses, abort BEFORE the attack; otherwise attack.
# The "attack" here is the same benign host-read S25 performs.
write_guarded_step() {
  cat > "$BATS_TEST_TMPDIR/guarded-step.sh" <<EOF
#!/usr/bin/env sh
"$ROOT/infra/context-guard.sh" || exit \$?
kubectl exec escape -- cat /host/etc/os-release
EOF
  chmod +x "$BATS_TEST_TMPDIR/guarded-step.sh"
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

@test "guarded step RUNS the offensive call on a kind- context" {
  export MOCK_KUBECTL_CONTEXT="kind-foo"
  write_guarded_step
  run "$BATS_TEST_TMPDIR/guarded-step.sh"
  [ "$status" -eq 0 ]
  # the gate opened, so the would-be offensive call was made
  grep -q "kubectl exec escape -- cat /host/etc/os-release" "$MOCK_LOG"
}

@test "guarded step REFUSES and makes NO offensive call on an EKS context" {
  export MOCK_KUBECTL_CONTEXT="arn:aws:eks:eu-central-1:123456789012:cluster/prod"
  write_guarded_step
  run "$BATS_TEST_TMPDIR/guarded-step.sh"
  [ "$status" -ne 0 ]
  # the guard's own read is expected and is NOT the offensive call:
  grep -q "kubectl config current-context" "$MOCK_LOG"
  # ...but the destructive step against the non-kind context must NEVER run:
  ! grep -q "kubectl exec" "$MOCK_LOG"
  ! grep -q "kubectl apply" "$MOCK_LOG"
}

@test "guarded step REFUSES and makes NO offensive call on a GKE context" {
  export MOCK_KUBECTL_CONTEXT="gke_my-project_europe-west1_prod"
  write_guarded_step
  run "$BATS_TEST_TMPDIR/guarded-step.sh"
  [ "$status" -ne 0 ]
  ! grep -q "kubectl exec" "$MOCK_LOG"
  ! grep -q "kubectl apply" "$MOCK_LOG"
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
