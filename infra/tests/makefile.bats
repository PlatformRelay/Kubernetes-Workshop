#!/usr/bin/env bats
# Unit tests for the root Makefile verbs, run against mocked binaries
# (infra/tests/stubs). No real cluster or container engine is touched.

load helpers

setup() {
  setup_mocks
  chmod +x "$ROOT"/infra/tests/stubs/*
}

@test "kind-up creates the cluster with the pinned node image and config" {
  export MOCK_CLUSTER_EXISTS=0
  run make -C "$ROOT" kind-up
  [ "$status" -eq 0 ]
  grep -q -- "kind create cluster --name ${WORKSHOP_CLUSTER_NAME} --config infra/kind/cluster.yaml --image ${KIND_NODE_IMAGE}" "$MOCK_LOG"
}

@test "kind-up is idempotent when the cluster already exists" {
  export MOCK_CLUSTER_EXISTS=1
  run make -C "$ROOT" kind-up
  [ "$status" -eq 0 ]
  echo "$output" | grep -qi "already exists"
  ! grep -q "kind create" "$MOCK_LOG"
}

@test "kind-down deletes the cluster by name" {
  export MOCK_CLUSTER_EXISTS=1
  run make -C "$ROOT" kind-down
  [ "$status" -eq 0 ]
  grep -q -- "kind delete cluster --name ${WORKSHOP_CLUSTER_NAME}" "$MOCK_LOG"
}

@test "kind-down is idempotent when no cluster exists" {
  export MOCK_CLUSTER_EXISTS=0
  run make -C "$ROOT" kind-down
  [ "$status" -eq 0 ]
  echo "$output" | grep -qi "no cluster"
  ! grep -q "kind delete" "$MOCK_LOG"
}

@test "doctor verb runs infra/doctor.sh" {
  export MOCK_CLUSTER_EXISTS=1
  run make -C "$ROOT" doctor
  [ "$status" -eq 0 ]
  echo "$output" | grep -q "doctor:"
}

@test "help is the default goal and lists the verbs" {
  run make -C "$ROOT"
  [ "$status" -eq 0 ]
  echo "$output" | grep -q "kind-up"
  echo "$output" | grep -q "kind-down"
  echo "$output" | grep -q "doctor"
}
