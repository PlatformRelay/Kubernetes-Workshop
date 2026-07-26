#!/usr/bin/env bats
# Behaviour tests for scripts/workshop-provenance.mjs (US-BETA-8) and the
# release.yml wiring that injects VITE_WORKSHOP_VERSION / VITE_WORKSHOP_SHA.
# Deleting the env inject from the workflow (or the resolver) must turn these red.

load helpers

setup() {
  setup_mocks
  SCRIPT="$ROOT/scripts/workshop-provenance.mjs"
  TEST="$ROOT/scripts/workshop-provenance.test.mjs"
}

# --- pure resolver (node:test) -------------------------------------------------

@test "workshop-provenance unit tests pass" {
  run node --test "$TEST"
  [ "$status" -eq 0 ]
}

# --- workflow wiring (fails if env inject is bypassed) -------------------------

@test "release.yml exports VITE_WORKSHOP_VERSION and VITE_WORKSHOP_SHA for export+build" {
  wf="$ROOT/.github/workflows/release.yml"
  grep -q 'VITE_WORKSHOP_VERSION' "$wf"
  grep -q 'VITE_WORKSHOP_SHA' "$wf"
  grep -q 'github.ref_name' "$wf"
  grep -q 'github.sha' "$wf"
}

@test "vite.config stamps provenance into the Vite client env" {
  cfg="$ROOT/vite.config.mjs"
  [ -f "$cfg" ]
  grep -q 'workshop-provenance' "$cfg"
  grep -q 'VITE_WORKSHOP_VERSION' "$cfg"
  grep -q 'VITE_WORKSHOP_SHA' "$cfg"
}

@test "global-bottom.vue renders the provenance label" {
  gb="$ROOT/global-bottom.vue"
  grep -q 'VITE_WORKSHOP_VERSION' "$gb"
  grep -q 'VITE_WORKSHOP_SHA' "$gb"
  grep -q 'kw-global-provenance' "$gb"
}

@test "resolver module exists and exports resolveProvenance" {
  [ -f "$SCRIPT" ]
  run node --input-type=module -e "
    import { resolveProvenance } from 'file://$SCRIPT'
    const p = resolveProvenance({})
    if (p.label !== 'dev · unversioned') process.exit(1)
  "
  [ "$status" -eq 0 ]
}
