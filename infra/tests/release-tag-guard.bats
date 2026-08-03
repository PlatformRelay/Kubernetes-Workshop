#!/usr/bin/env bats
# Behaviour tests for scripts/release-tag-guard.sh (US-RELEASE-1).
# Same-commit republish must be idempotent; a tag/release pointing at a
# different commit must be refused. Workflow wiring assertions live here so
# the guard cannot be silently dropped from release.yml.

load helpers

setup() {
  setup_mocks
  SCRIPT="$ROOT/scripts/release-tag-guard.sh"
}

# --- pure decide mode ----------------------------------------------------------

@test "decide: empty existing → allow (new publication)" {
  run "$SCRIPT" decide "abcdef0123456789" ""
  [ "$status" -eq 0 ]
  [ "$output" = "allow" ]
}

@test "decide: same full SHA → idempotent OK" {
  run "$SCRIPT" decide \
    "abcdef0123456789abcdef0123456789abcdef01" \
    "abcdef0123456789abcdef0123456789abcdef01"
  [ "$status" -eq 0 ]
  [ "$output" = "idempotent" ]
}

@test "decide: same short/long SHA prefix → idempotent OK" {
  run "$SCRIPT" decide "abcdef0123456789" "abcdef0"
  [ "$status" -eq 0 ]
  [ "$output" = "idempotent" ]
}

@test "decide: different commit → refuse" {
  run "$SCRIPT" decide "abcdef0123456789" "deadbeefcafebabe"
  [ "$status" -eq 1 ]
  [ "$output" = "refuse" ]
}

@test "decide: missing intended SHA exits usage" {
  run "$SCRIPT" decide "" "abcdef0"
  [ "$status" -eq 2 ]
}

# --- check mode with mocked gh -------------------------------------------------

@test "check: no remote tag/release → allow (dry-run)" {
  stub_dir="$BATS_TEST_TMPDIR/bin"
  mkdir -p "$stub_dir"
  cat >"$stub_dir/gh" <<'EOF'
#!/usr/bin/env bash
# Simulate missing tag ref and missing release.
echo "Not Found" >&2
exit 1
EOF
  chmod +x "$stub_dir/gh"
  PATH="$stub_dir:$PATH" \
    run "$SCRIPT" check --dry-run "v9.9.9" "abcdef0123456789"
  [ "$status" -eq 0 ]
  [[ "$output" == *"allow"* ]]
}

@test "check: existing tag at same commit → idempotent OK" {
  stub_dir="$BATS_TEST_TMPDIR/bin"
  mkdir -p "$stub_dir"
  cat >"$stub_dir/gh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
args="$*"
if [[ "$args" == *"/git/ref/tags/"* ]]; then
  printf '%s\n' 'abcdef0123456789abcdef0123456789abcdef01'
  exit 0
fi
if [[ "$args" == *"/releases/tags/"* ]]; then
  echo "Not Found" >&2
  exit 1
fi
echo "unexpected gh invocation: $args" >&2
exit 99
EOF
  chmod +x "$stub_dir/gh"
  PATH="$stub_dir:$PATH" \
    run "$SCRIPT" check --dry-run "v1.2.0" "abcdef0123456789abcdef0123456789abcdef01"
  [ "$status" -eq 0 ]
  [[ "$output" == *"idempotent"* ]]
}

@test "check: existing tag at different commit → refuse" {
  stub_dir="$BATS_TEST_TMPDIR/bin"
  mkdir -p "$stub_dir"
  cat >"$stub_dir/gh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
args="$*"
if [[ "$args" == *"/git/ref/tags/"* ]]; then
  printf '%s\n' 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef'
  exit 0
fi
if [[ "$args" == *"/releases/tags/"* ]]; then
  echo "Not Found" >&2
  exit 1
fi
echo "unexpected gh invocation: $args" >&2
exit 99
EOF
  chmod +x "$stub_dir/gh"
  PATH="$stub_dir:$PATH" \
    run "$SCRIPT" check --dry-run "v1.2.0" "abcdef0123456789abcdef0123456789abcdef01"
  [ "$status" -eq 1 ]
  [[ "$output" == *"refuse"* ]]
}

@test "check: existing release target differs → refuse" {
  stub_dir="$BATS_TEST_TMPDIR/bin"
  mkdir -p "$stub_dir"
  cat >"$stub_dir/gh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
args="$*"
if [[ "$args" == *"/git/ref/tags/"* ]]; then
  printf '%s\n' 'abcdef0123456789abcdef0123456789abcdef01'
  exit 0
fi
if [[ "$args" == *"/releases/tags/"* ]]; then
  printf '%s\n' '1111111111111111111111111111111111111111'
  exit 0
fi
echo "unexpected gh invocation: $args" >&2
exit 99
EOF
  chmod +x "$stub_dir/gh"
  PATH="$stub_dir:$PATH" \
    run "$SCRIPT" check --dry-run "v1.2.0" "abcdef0123456789abcdef0123456789abcdef01"
  [ "$status" -eq 1 ]
  [[ "$output" == *"refuse"* ]]
}

# --- workflow wiring -----------------------------------------------------------

@test "release.yml runs release-tag-guard.sh before softprops publish" {
  wf="$ROOT/.github/workflows/release.yml"
  grep -q 'scripts/release-tag-guard.sh' "$wf"
  # Guard step must appear before action-gh-release in the publish job.
  guard_line="$(grep -n 'scripts/release-tag-guard.sh' "$wf" | head -1 | cut -d: -f1)"
  publish_line="$(grep -n 'action-gh-release' "$wf" | head -1 | cut -d: -f1)"
  [ -n "$guard_line" ]
  [ -n "$publish_line" ]
  [ "$guard_line" -lt "$publish_line" ]
}
