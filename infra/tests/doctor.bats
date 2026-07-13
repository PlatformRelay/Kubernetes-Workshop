#!/usr/bin/env bats
# Unit tests for infra/doctor.sh, run against mocked binaries
# (infra/tests/stubs). No real cluster or container engine is touched.

load helpers

setup() {
  setup_mocks
  chmod +x "$ROOT"/infra/tests/stubs/* "$ROOT/infra/doctor.sh"
  export WORKSHOP_NONINTERACTIVE=1
}

@test "doctor passes when engine, cluster, nodes, and smoke Pod are green" {
  export MOCK_CLUSTER_EXISTS=1
  run "$ROOT/infra/doctor.sh"
  [ "$status" -eq 0 ]
  echo "$output" | grep -q "0 failed"
  # the smoke Pod must be cleaned up
  grep -q "kubectl.*delete pod" "$MOCK_LOG"
}

@test "doctor fails cleanly when the cluster is missing" {
  export MOCK_CLUSTER_EXISTS=0
  run "$ROOT/infra/doctor.sh"
  [ "$status" -ne 0 ]
  echo "$output" | grep -q "FAIL"
  echo "$output" | grep -q "make kind-up"
}

@test "doctor fails when no container engine is reachable" {
  export MOCK_CLUSTER_EXISTS=1
  export MOCK_ENGINE_UP=0
  run "$ROOT/infra/doctor.sh"
  [ "$status" -ne 0 ]
  echo "$output" | grep -q "FAIL"
}

@test "doctor warns but does not fail on a kind version mismatch" {
  export MOCK_CLUSTER_EXISTS=1
  export MOCK_KIND_VERSION=v0.20.0
  run "$ROOT/infra/doctor.sh"
  [ "$status" -eq 0 ]
  echo "$output" | grep -q "WARN"
}

@test "doctor fails when nodes are not Ready" {
  export MOCK_CLUSTER_EXISTS=1
  export MOCK_NODES_READY=0
  run "$ROOT/infra/doctor.sh"
  [ "$status" -ne 0 ]
  echo "$output" | grep -q "FAIL"
}

@test "doctor fails when the smoke Pod does not complete" {
  export MOCK_CLUSTER_EXISTS=1
  export MOCK_SMOKE_EXIT=1
  run "$ROOT/infra/doctor.sh"
  [ "$status" -ne 0 ]
  echo "$output" | grep -q "FAIL"
  # even a failed smoke Pod must be cleaned up
  grep -q "kubectl.*delete pod" "$MOCK_LOG"
}
