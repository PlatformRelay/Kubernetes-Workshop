#!/usr/bin/env bats
# Unit tests for infra/doctor.sh, run against mocked binaries
# (infra/tests/stubs). No real cluster or container engine is touched.

load helpers

setup() {
  setup_mocks
  chmod +x "$ROOT"/infra/tests/stubs/* "$ROOT/infra/doctor.sh"
  export WORKSHOP_NONINTERACTIVE=1
}

use_wsl2_kernel() {
  local os_bin="$BATS_TEST_TMPDIR/wsl2-bin"
  mkdir -p "$os_bin"
  cat > "$os_bin/uname" <<'EOF'
#!/usr/bin/env sh
case "${1:-}" in
  -s) echo Linux ;;
  -r) echo 5.15.167.4-microsoft-standard-WSL2 ;;
  -m) echo x86_64 ;;
  *) echo Linux ;;
esac
EOF
  chmod +x "$os_bin/uname"
  export PATH="$os_bin:$PATH"
  export WSL_DISTRO_NAME=Ubuntu
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

@test "doctor gives the Docker Desktop integration route when WSL2 has no engine" {
  export MOCK_CLUSTER_EXISTS=1
  export MOCK_ENGINE_UP=0
  use_wsl2_kernel

  run "$ROOT/infra/doctor.sh"

  [ "$status" -ne 0 ]
  echo "$output" | grep -q "Docker Desktop WSL integration"
  echo "$output" | grep -q "assigned cloud namespace"
}

@test "doctor does not print WSL2 guidance on normal Linux" {
  export MOCK_CLUSTER_EXISTS=1

  run "$ROOT/infra/doctor.sh"

  [ "$status" -eq 0 ]
  ! echo "$output" | grep -q "WSL integration"
  ! echo "$output" | grep -q "mounted Windows drive"
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
