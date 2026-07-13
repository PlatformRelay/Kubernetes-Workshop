#!/usr/bin/env bats
# Unit tests for infra/bootstrap.sh (the ./workshop entrypoint), run against
# mocked binaries (infra/tests/stubs). No real cluster, engine, or tool install
# is touched. These exercise the NON-INTERACTIVE / mocked contract only — a real
# `./workshop up` boot and the gum interactive UX are owed a manual smoke.

load helpers

setup() {
  setup_mocks
  chmod +x "$ROOT"/infra/tests/stubs/* "$ROOT/infra/bootstrap.sh" "$ROOT/workshop"
  # Every test runs the non-interactive path by default: no gum, sane defaults.
  export WORKSHOP_NONINTERACTIVE=1
  # A reachable engine + an existing cluster is the green baseline; individual
  # tests override these.
  export MOCK_ENGINE_UP=1
  export MOCK_CLUSTER_EXISTS=1
}

# --- usage / dispatch --------------------------------------------------------

@test "no subcommand prints usage" {
  run "$ROOT/workshop"
  [ "$status" -eq 0 ]
  echo "$output" | grep -q "Usage: ./workshop"
  echo "$output" | grep -q "up"
  echo "$output" | grep -q "down"
  echo "$output" | grep -q "doctor"
}

@test "--help prints usage" {
  run "$ROOT/workshop" --help
  [ "$status" -eq 0 ]
  echo "$output" | grep -q "Usage: ./workshop"
}

@test "an unknown subcommand exits non-zero and shows usage" {
  run "$ROOT/workshop" frobnicate
  [ "$status" -ne 0 ]
  echo "$output" | grep -qi "unknown command"
  echo "$output" | grep -q "Usage: ./workshop"
}

@test "the ./workshop wrapper delegates to infra/bootstrap.sh (same behaviour)" {
  run "$ROOT/workshop" doctor
  [ "$status" -eq 0 ]
  run "$ROOT/infra/bootstrap.sh" doctor
  [ "$status" -eq 0 ]
}

# --- up: happy path ----------------------------------------------------------

@test "up runs preflight, installs tools, creates the cluster, then doctor" {
  export MOCK_CLUSTER_EXISTS=0   # up should create it
  run "$ROOT/workshop" up
  [ "$status" -eq 0 ]
  # engine probed, tools installed (locked), cluster created, doctor ran.
  grep -q "docker info" "$MOCK_LOG"
  grep -q -- "mise install --locked" "$MOCK_LOG"
  grep -q -- "kind create cluster" "$MOCK_LOG"
  echo "$output" | grep -q "doctor:"
  echo "$output" | grep -q "environment is ready"
}

@test "up installs the pinned toolchain with --locked (verifies against mise.lock)" {
  run "$ROOT/workshop" up
  [ "$status" -eq 0 ]
  grep -q -- "mise install --locked" "$MOCK_LOG"
}

# --- engine probe: preference order Docker -> Podman -------------------------

@test "engine probe prefers docker when it is reachable" {
  run "$ROOT/workshop" up
  [ "$status" -eq 0 ]
  grep -q "docker info" "$MOCK_LOG"
  # docker satisfied the probe, so podman info is never called.
  ! grep -q "podman info" "$MOCK_LOG"
}

@test "engine probe falls back to podman when docker is down" {
  export MOCK_DOCKER_UP=0   # docker present but unreachable
  export MOCK_PODMAN_UP=1
  run "$ROOT/workshop" up
  [ "$status" -eq 0 ]
  grep -q "docker info" "$MOCK_LOG"    # tried docker first
  grep -q "podman info" "$MOCK_LOG"    # then fell through to podman
}

@test "up fails clearly when no container engine is reachable" {
  export MOCK_ENGINE_UP=0
  run "$ROOT/workshop" up
  [ "$status" -ne 0 ]
  echo "$output" | grep -qi "no reachable container engine"
  # never got as far as creating a cluster
  ! grep -q "kind create cluster" "$MOCK_LOG"
}

# --- non-interactive contract: no prompts, no gum ----------------------------

@test "non-interactive up never invokes gum" {
  export MOCK_CLUSTER_EXISTS=0
  run "$ROOT/workshop" up
  [ "$status" -eq 0 ]
  ! grep -q "^gum " "$MOCK_LOG"
}

@test "CI=true is treated as non-interactive even without WORKSHOP_NONINTERACTIVE" {
  unset WORKSHOP_NONINTERACTIVE
  export CI=true
  export MOCK_CLUSTER_EXISTS=0
  run "$ROOT/workshop" up
  [ "$status" -eq 0 ]
  ! grep -q "^gum " "$MOCK_LOG"
}

# --- doctor verdict pass/fail ------------------------------------------------

@test "doctor reports pass when the environment is green" {
  run "$ROOT/workshop" doctor
  [ "$status" -eq 0 ]
  echo "$output" | grep -q "0 failed"
}

@test "doctor reports failure when the cluster is missing" {
  export MOCK_CLUSTER_EXISTS=0
  run "$ROOT/workshop" doctor
  [ "$status" -ne 0 ]
  echo "$output" | grep -q "FAIL"
}

# --- down: requires confirmation --------------------------------------------

@test "down under non-interactive takes the default and deletes the cluster" {
  run "$ROOT/workshop" down
  [ "$status" -eq 0 ]
  grep -q -- "kind delete cluster" "$MOCK_LOG"
  ! grep -q "^gum " "$MOCK_LOG"
}

@test "down asks gum to confirm on an interactive run and deletes on accept" {
  unset WORKSHOP_NONINTERACTIVE
  unset CI
  export MOCK_GUM_CONFIRM_EXIT=0   # user accepted
  run "$ROOT/workshop" down
  [ "$status" -eq 0 ]
  grep -q "^gum confirm" "$MOCK_LOG"       # the guard was actually reached
  grep -q -- "kind delete cluster" "$MOCK_LOG"
}

@test "down aborts (no delete) when the confirmation is declined" {
  unset WORKSHOP_NONINTERACTIVE
  unset CI
  export MOCK_GUM_CONFIRM_EXIT=1   # user answered 'no'
  run "$ROOT/workshop" down
  [ "$status" -eq 0 ]
  grep -q "^gum confirm" "$MOCK_LOG"       # the guard was reached
  echo "$output" | grep -qi "aborted"
  ! grep -q -- "kind delete cluster" "$MOCK_LOG"
}

@test "down --yes bypasses a declining prompt and deletes" {
  unset WORKSHOP_NONINTERACTIVE
  unset CI
  export MOCK_GUM_CONFIRM_EXIT=1   # would decline IF the prompt were reached
  run "$ROOT/workshop" down --yes
  [ "$status" -eq 0 ]
  grep -q -- "kind delete cluster" "$MOCK_LOG"   # --yes short-circuits the prompt
  ! grep -q "^gum confirm" "$MOCK_LOG"           # prompt never reached
}
