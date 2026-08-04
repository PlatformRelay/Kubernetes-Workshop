#!/usr/bin/env bats
# Behaviour tests for scripts/release-notes-flags.sh — the tag→prerelease /
# body_path decision used by .github/workflows/release.yml (US-BETA-7).
# Deleting the pre-release branch in the script (or un-wiring the workflow)
# must turn these red.

load helpers

setup() {
  setup_mocks
  SCRIPT="$ROOT/scripts/release-notes-flags.sh"
}

# --- script behaviour ----------------------------------------------------------

@test "v0.2.0-beta.1 → prerelease=true and beta-limitations body_path" {
  out="$BATS_TEST_TMPDIR/github_output"
  : > "$out"
  GITHUB_OUTPUT="$out" run "$SCRIPT" "v0.2.0-beta.1"
  [ "$status" -eq 0 ]
  grep -qx 'prerelease=true' "$out"
  grep -qx 'body_path=docs/beta-limitations.md' "$out"
}

@test "v1.0.0-rc.1 → prerelease=true (any semver pre-release hyphen)" {
  out="$BATS_TEST_TMPDIR/github_output"
  : > "$out"
  GITHUB_OUTPUT="$out" run "$SCRIPT" "v1.0.0-rc.1"
  [ "$status" -eq 0 ]
  grep -qx 'prerelease=true' "$out"
  grep -qx 'body_path=docs/beta-limitations.md' "$out"
}

@test "v0.2.0 → prerelease=false and empty body_path" {
  out="$BATS_TEST_TMPDIR/github_output"
  : > "$out"
  GITHUB_OUTPUT="$out" run "$SCRIPT" "v0.2.0"
  [ "$status" -eq 0 ]
  grep -qx 'prerelease=false' "$out"
  grep -qx 'body_path=' "$out"
}

@test "missing tag argument exits non-zero" {
  run "$SCRIPT"
  [ "$status" -ne 0 ]
}

# --- workflow wiring (fails if the script is bypassed) -------------------------

@test "release.yml invokes scripts/release-notes-flags.sh for the notes step" {
  wf="$ROOT/.github/workflows/release.yml"
  grep -q 'scripts/release-notes-flags.sh' "$wf"
  grep -q 'id: notes' "$wf"
  grep -q 'steps.notes.outputs.prerelease' "$wf"
  grep -q 'steps.notes.outputs.body_path' "$wf"
  grep -q 'generate_release_notes: true' "$wf"
}

@test "docs/beta-limitations.md exists for body_path" {
  [ -f "$ROOT/docs/beta-limitations.md" ]
  grep -qi 'known limitations' "$ROOT/docs/beta-limitations.md"
  grep -qi 's24' "$ROOT/docs/beta-limitations.md"
  grep -qi 'deferred stub' "$ROOT/docs/beta-limitations.md"
}
