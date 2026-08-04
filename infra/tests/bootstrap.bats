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

run_workshop_in_pty() {
  if [ "$(uname -s)" = "Darwin" ]; then
    run script -q -e /dev/null "$ROOT/workshop" "$@"
  else
    local command="$ROOT/workshop"
    local arg
    for arg in "$@"; do
      command="$command $arg"
    done
    run script -q -e -c "$command" /dev/null
  fi
}

use_wsl_kernel() {
  local generation="$1" os_bin="$BATS_TEST_TMPDIR/wsl-${1}-bin"
  mkdir -p "$os_bin"
  if [ "$generation" = "2" ]; then
    export MOCK_WSL_KERNEL_RELEASE=5.15.167.4-microsoft-standard-WSL2
  elif [ "$generation" = "1" ]; then
    export MOCK_WSL_KERNEL_RELEASE=4.4.0-19041-Microsoft
  else
    export MOCK_WSL_KERNEL_RELEASE=6.8.0-generic
  fi
  cat > "$os_bin/uname" <<'EOF'
#!/usr/bin/env sh
case "${1:-}" in
  -s) echo Linux ;;
  -r) echo "${MOCK_WSL_KERNEL_RELEASE:?}" ;;
  -m) echo x86_64 ;;
  *) echo Linux ;;
esac
EOF
  chmod +x "$os_bin/uname"
  export PATH="$os_bin:$PATH"
  export WSL_DISTRO_NAME=Ubuntu
}

# --- usage / dispatch --------------------------------------------------------

@test "no subcommand prints usage" {
  run "$ROOT/workshop"
  [ "$status" -eq 0 ]
  echo "$output" | grep -q "Usage: ./workshop"
  echo "$output" | grep -q "up"
  echo "$output" | grep -q "down"
  echo "$output" | grep -q "doctor"
  echo "$output" | grep -q "profile"
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

@test "up fails before cluster creation when the managed tool install fails" {
  export MOCK_MISE_EXIT=23

  run "$ROOT/workshop" up

  [ "$status" -ne 0 ]
  echo "$output" | grep -q "mise install failed"
  ! grep -q -- "kind create cluster" "$MOCK_LOG"
}

@test "up uses the mise tool environment when managed tools are absent from the host PATH" {
  # Reproduce a fresh Ubuntu install: mise itself is reachable and successfully
  # installs the lockfile, but kind/kubectl are only exposed by `mise exec`.
  # No shell restart or activation hook should be required before cluster-up or
  # doctor can use those managed binaries.
  local host_bin="$BATS_TEST_TMPDIR/host-bin"
  local managed_bin="$BATS_TEST_TMPDIR/managed-bin"
  local runner_bin="$BATS_TEST_TMPDIR/runner-bin"
  mkdir -p "$host_bin" "$managed_bin" "$runner_bin"
  ln -s "$ROOT/infra/tests/stubs/docker" "$host_bin/docker"
  ln -s "$ROOT/infra/tests/stubs/podman" "$host_bin/podman"
  ln -s "$ROOT/infra/tests/stubs/mise" "$host_bin/mise"
  ln -s "$ROOT/infra/tests/stubs/kind" "$managed_bin/kind"
  ln -s "$ROOT/infra/tests/stubs/kubectl" "$managed_bin/kubectl"
  # Match ubuntu-latest, which currently exposes an unmanaged kubectl globally.
  ln -s "$ROOT/infra/tests/stubs/kubectl" "$runner_bin/kubectl"

  export PATH="$runner_bin:$PATH"
  [ "$(command -v kubectl)" = "$runner_bin/kubectl" ]
  create_isolated_host_path "$host_bin" \
    bash env sh dirname head uname grep nproc awk make rm
  export PATH="$host_bin"
  export MOCK_MISE_EXEC_PATH="$managed_bin"
  export MOCK_REQUIRE_MISE_EXEC=1
  export MOCK_CLUSTER_EXISTS=0
  [ -z "$(command -v kind 2>/dev/null || true)" ]
  [ -z "$(command -v kubectl 2>/dev/null || true)" ]

  run "$ROOT/workshop" up

  [ "$status" -eq 0 ]
  grep -q -- "mise install --locked" "$MOCK_LOG"
  grep -q -- "mise exec -- env $ROOT/infra/kind/cluster.sh up" "$MOCK_LOG"
  grep -q -- "mise exec -- env WORKSHOP_NONINTERACTIVE=1 $ROOT/infra/doctor.sh" "$MOCK_LOG"
  grep -q -- "kind create cluster" "$MOCK_LOG"
  echo "$output" | grep -q "environment is ready"
  echo "$output" | grep -q "Before running lab commands in this shell"
  echo "$output" | grep -q "activate"
}

@test "up creates the cluster without GNU Make on PATH (ARCH-002)" {
  local host_bin="$BATS_TEST_TMPDIR/host-bin"
  local managed_bin="$BATS_TEST_TMPDIR/managed-bin"
  mkdir -p "$host_bin" "$managed_bin"
  ln -s "$ROOT/infra/tests/stubs/docker" "$host_bin/docker"
  ln -s "$ROOT/infra/tests/stubs/podman" "$host_bin/podman"
  ln -s "$ROOT/infra/tests/stubs/mise" "$host_bin/mise"
  ln -s "$ROOT/infra/tests/stubs/kind" "$managed_bin/kind"
  ln -s "$ROOT/infra/tests/stubs/kubectl" "$managed_bin/kubectl"

  # Intentionally omit `make` from the host tools list.
  create_isolated_host_path "$host_bin" \
    bash env sh dirname head uname grep nproc awk rm
  export PATH="$host_bin"
  export MOCK_MISE_EXEC_PATH="$managed_bin"
  export MOCK_REQUIRE_MISE_EXEC=1
  export MOCK_CLUSTER_EXISTS=0
  [ -z "$(command -v make 2>/dev/null || true)" ]

  run "$ROOT/workshop" up

  [ "$status" -eq 0 ]
  grep -q -- "mise exec -- env $ROOT/infra/kind/cluster.sh up" "$MOCK_LOG"
  grep -q -- "kind create cluster" "$MOCK_LOG"
  ! grep -q -- "make -C" "$MOCK_LOG"
  echo "$output" | grep -q "environment is ready"
}

@test "up reuses a default mise install that the parent shell has not added to PATH" {
  local host_bin="$BATS_TEST_TMPDIR/host-bin"
  local managed_bin="$BATS_TEST_TMPDIR/managed-bin"
  mkdir -p "$host_bin" "$managed_bin" "$BATS_TEST_TMPDIR/home/.local/bin"
  ln -s "$ROOT/infra/tests/stubs/docker" "$host_bin/docker"
  ln -s "$ROOT/infra/tests/stubs/podman" "$host_bin/podman"
  ln -s "$ROOT/infra/tests/stubs/mise" "$BATS_TEST_TMPDIR/home/.local/bin/mise"
  ln -s "$ROOT/infra/tests/stubs/kind" "$managed_bin/kind"
  ln -s "$ROOT/infra/tests/stubs/kubectl" "$managed_bin/kubectl"

  create_isolated_host_path "$host_bin" \
    bash env sh dirname head uname grep nproc awk make rm
  export HOME="$BATS_TEST_TMPDIR/home"
  export PATH="$host_bin"
  export MOCK_MISE_EXEC_PATH="$managed_bin"
  export MOCK_REQUIRE_MISE_EXEC=1
  export MOCK_CLUSTER_EXISTS=0
  [ -z "$(command -v mise 2>/dev/null || true)" ]

  run "$ROOT/workshop" up

  [ "$status" -eq 0 ]
  grep -q -- "mise install --locked" "$MOCK_LOG"
  grep -q -- "mise exec -- env $ROOT/infra/kind/cluster.sh up" "$MOCK_LOG"
  echo "$output" | grep -q "environment is ready"
}

@test "up waits a bounded time for all kind nodes before running doctor" {
  export MOCK_CLUSTER_EXISTS=0

  run "$ROOT/workshop" up

  [ "$status" -eq 0 ]
  grep -q -- "kubectl --context kind-workshop wait --for=condition=Ready nodes --all --timeout=180s" "$MOCK_LOG"
}

@test "up fails honestly when kind nodes do not become Ready before the timeout" {
  export MOCK_CLUSTER_EXISTS=0
  export MOCK_NODES_WAIT_EXIT=1

  run "$ROOT/workshop" up

  [ "$status" -ne 0 ]
  echo "$output" | grep -q "nodes did not become Ready within 180s"
  grep -q -- "kind create cluster" "$MOCK_LOG"
  ! echo "$output" | grep -q "Running doctor"
  ! echo "$output" | grep -q "environment is ready"
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
  export MOCK_CLUSTER_EXISTS=0
  run "$ROOT/workshop" up
  [ "$status" -eq 0 ]
  grep -q "docker info" "$MOCK_LOG"    # tried docker first
  grep -q "podman info" "$MOCK_LOG"    # then fell through to podman
}

@test "the chosen engine is propagated to kind (podman -> KIND_EXPERIMENTAL_PROVIDER)" {
  # docker CLI present but daemon down, podman up: probe picks podman, and kind
  # MUST be pinned to podman rather than re-detecting dead docker.
  export MOCK_DOCKER_UP=0
  export MOCK_PODMAN_UP=1
  export MOCK_CLUSTER_EXISTS=0
  run "$ROOT/workshop" up
  [ "$status" -eq 0 ]
  grep -q "^kind-provider podman" "$MOCK_LOG"
}

@test "the docker (default) path sets no kind provider override" {
  export MOCK_ENGINE_UP=1   # docker reachable — the default engine
  export MOCK_CLUSTER_EXISTS=0
  run "$ROOT/workshop" up
  [ "$status" -eq 0 ]
  # kind's own default is docker, so no KIND_EXPERIMENTAL_PROVIDER is injected.
  ! grep -q "^kind-provider" "$MOCK_LOG"
}

@test "up fails clearly when no container engine is reachable" {
  export MOCK_ENGINE_UP=0
  run "$ROOT/workshop" up
  [ "$status" -ne 0 ]
  echo "$output" | grep -qi "no reachable container engine"
  # never got as far as creating a cluster
  ! grep -q "kind create cluster" "$MOCK_LOG"
}

# --- Windows / WSL2 diagnostics ---------------------------------------------

@test "native Windows shells are rejected with the supported WSL2 route" {
  local os_bin="$BATS_TEST_TMPDIR/windows-bin"
  mkdir -p "$os_bin"
  cat > "$os_bin/uname" <<'EOF'
#!/usr/bin/env sh
echo MINGW64_NT-10.0
EOF
  chmod +x "$os_bin/uname"
  export PATH="$os_bin:$PATH"

  run "$ROOT/workshop" up

  [ "$status" -ne 0 ]
  echo "$output" | grep -q "native Windows"
  echo "$output" | grep -q "wsl --install"
  ! grep -q "docker info" "$MOCK_LOG"
}

@test "WSL2 reports an actionable Docker Desktop integration failure" {
  use_wsl_kernel 2
  export MOCK_ENGINE_UP=0

  run "$ROOT/workshop" up

  [ "$status" -ne 0 ]
  echo "$output" | grep -q "Docker Desktop WSL integration"
  echo "$output" | grep -q "Settings.*Resources.*WSL integration"
  echo "$output" | grep -q "assigned cloud namespace"
}

@test "WSL2 warns when the repository is on a mounted Windows drive" {
  use_wsl_kernel 2

  run bash -c 'source "$1"; check_checkout wsl2 /mnt/c/Users/learner/kubernetes-workshop' _ \
    "$ROOT/infra/bootstrap.sh"

  [ "$status" -eq 0 ]
  echo "$output" | grep -q "mounted Windows drive"
  echo "$output" | grep -q 'mkdir -p .*/src'
}

@test "WSL1 is rejected instead of being treated as WSL2" {
  use_wsl_kernel 1

  run "$ROOT/workshop" up

  [ "$status" -ne 0 ]
  echo "$output" | grep -q "WSL1 is not supported"
  echo "$output" | grep -q "wsl --set-version Ubuntu 2"
  echo "$output" | grep -q "wsl --list --verbose"
  ! grep -q "docker info" "$MOCK_LOG"
}

@test "WSL2 requires kernel evidence and does not trust environment variables alone" {
  use_wsl_kernel ambiguous

  run bash -c 'source "$1"; workshop_detect_os' _ "$ROOT/infra/platform-checks.sh"

  [ "$status" -eq 0 ]
  [ "$output" = "wsl1" ]
}

@test "bootstrap rejects CRLF in the sourced platform helper before sourcing it" {
  local checkout="$BATS_TEST_TMPDIR/helper-crlf-checkout"
  mkdir -p "$checkout/infra"
  cp "$ROOT/infra/bootstrap.sh" "$checkout/infra/bootstrap.sh"
  cp "$ROOT/infra/versions.env" "$checkout/infra/versions.env"
  awk '{ printf "%s\r\n", $0 }' "$ROOT/infra/platform-checks.sh" > \
    "$checkout/infra/platform-checks.sh"
  chmod +x "$checkout/infra/bootstrap.sh"

  run bash "$checkout/infra/bootstrap.sh" --help

  [ "$status" -ne 0 ]
  echo "$output" | grep -q "CRLF line endings in required source file"
  echo "$output" | grep -q "infra/platform-checks.sh"
  ! echo "$output" | grep -q "command not found"
}

@test "checkout diagnostics reject CRLF in executable scripts" {
  local checkout="$BATS_TEST_TMPDIR/crlf-checkout"
  mkdir -p "$checkout/infra"
  printf '#!/usr/bin/env bash\r\necho workshop\r\n' > "$checkout/workshop"
  printf '#!/usr/bin/env bash\necho bootstrap\n' > "$checkout/infra/bootstrap.sh"
  printf '#!/usr/bin/env bash\necho doctor\n' > "$checkout/infra/doctor.sh"
  chmod +x "$checkout/workshop" "$checkout/infra/bootstrap.sh" "$checkout/infra/doctor.sh"

  run bash -c 'source "$1"; check_checkout linux "$2"' _ \
    "$ROOT/infra/bootstrap.sh" "$checkout"

  [ "$status" -ne 0 ]
  echo "$output" | grep -q "CRLF line endings"
  echo "$output" | grep -q "git config core.autocrlf input"
}

@test "checkout diagnostics reject missing executable bits" {
  local checkout="$BATS_TEST_TMPDIR/mode-checkout"
  mkdir -p "$checkout/infra"
  printf '#!/usr/bin/env bash\necho workshop\n' > "$checkout/workshop"
  printf '#!/usr/bin/env bash\necho bootstrap\n' > "$checkout/infra/bootstrap.sh"
  printf '#!/usr/bin/env bash\necho doctor\n' > "$checkout/infra/doctor.sh"
  chmod +x "$checkout/infra/bootstrap.sh" "$checkout/infra/doctor.sh"
  chmod -x "$checkout/workshop"

  run bash -c 'source "$1"; check_checkout linux "$2"' _ \
    "$ROOT/infra/bootstrap.sh" "$checkout"

  [ "$status" -ne 0 ]
  echo "$output" | grep -q "not executable"
  echo "$output" | grep -q "chmod +x workshop infra/bootstrap.sh infra/doctor.sh"
}

@test "normal Linux checkout has no WSL2 warnings" {
  run bash -c 'source "$1"; check_checkout linux "$2"' _ \
    "$ROOT/infra/bootstrap.sh" "$ROOT"

  [ "$status" -eq 0 ]
  ! echo "$output" | grep -q "mounted Windows drive"
  ! echo "$output" | grep -q "WSL integration"
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

@test "interactive up runs mise-managed cluster and readiness commands through gum" {
  unset WORKSHOP_NONINTERACTIVE
  unset CI
  export MOCK_CLUSTER_EXISTS=0

  run_workshop_in_pty up

  [ "$status" -eq 0 ]
  grep -q -- "gum spin --title Creating the kind cluster" "$MOCK_LOG"
  grep -q -- "mise exec -- env $ROOT/infra/kind/cluster.sh up" "$MOCK_LOG"
  grep -q -- "gum spin --title Waiting for all kind nodes to become Ready" "$MOCK_LOG"
  grep -q -- "mise exec -- kubectl --context kind-workshop wait" "$MOCK_LOG"
}

@test "interactive down runs the mise-managed delete command through gum" {
  unset WORKSHOP_NONINTERACTIVE
  unset CI

  run_workshop_in_pty down --yes

  [ "$status" -eq 0 ]
  grep -q -- "gum spin --title Deleting the kind cluster" "$MOCK_LOG"
  grep -q -- "mise exec -- $ROOT/infra/kind/cluster.sh down" "$MOCK_LOG"
  grep -q -- "kind delete cluster" "$MOCK_LOG"
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
