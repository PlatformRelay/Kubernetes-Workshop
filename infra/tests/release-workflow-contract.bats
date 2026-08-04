#!/usr/bin/env bats
# Workflow contract for .github/workflows/release.yml (US-RELEASE-1).
# Fails if publish is reordered before build, if write perms leak onto build,
# or if day-deck provenance/export wiring regresses while keeping compatibility
# full/3day artifacts.

load helpers

setup() {
  setup_mocks
  WF="$ROOT/.github/workflows/release.yml"
}

@test "release.yml exists and is parseable YAML" {
  [ -f "$WF" ]
  run python3 -c "import yaml,sys; yaml.safe_load(open(sys.argv[1]))" "$WF"
  [ "$status" -eq 0 ]
}

@test "publish job needs build (build-then-publish)" {
  run python3 -c "
import sys, yaml
wf = yaml.safe_load(open(sys.argv[1]))
needs = wf['jobs']['publish'].get('needs')
if isinstance(needs, str):
    out = needs
elif isinstance(needs, list):
    out = ','.join(needs)
else:
    out = ''
print(out)
assert 'build' in out.split(',')
" "$WF"
  [ "$status" -eq 0 ]
}

@test "top-level and build permissions are contents:read (no write leak)" {
  run python3 -c "
import sys, yaml
wf = yaml.safe_load(open(sys.argv[1]))
top = wf.get('permissions') or {}
assert top.get('contents') == 'read', top
build = (wf['jobs']['build'].get('permissions') or {})
assert build.get('contents') == 'read', build
assert build.get('contents') != 'write'
" "$WF"
  [ "$status" -eq 0 ]
}

@test "only publish job has contents:write" {
  run python3 -c "
import sys, yaml
wf = yaml.safe_load(open(sys.argv[1]))
for name, job in wf['jobs'].items():
    perms = job.get('permissions') or {}
    contents = perms.get('contents')
    if name == 'publish':
        assert contents == 'write', (name, perms)
    else:
        assert contents != 'write', (name, perms)
" "$WF"
  [ "$status" -eq 0 ]
}

@test "publish fails when artifact globs do not match" {
  grep -q 'fail_on_unmatched_files: true' "$WF"
}

@test "release exports Day 1/2/3 decks with provenance stamps" {
  # Live-delivery path: day decks must be exported/built under VITE stamps.
  grep -q 'slides-day-1.md' "$WF"
  grep -q 'slides-day-2.md' "$WF"
  grep -q 'slides-day-3.md' "$WF"
  # Provenance inject remains on export + build steps.
  grep -q 'VITE_WORKSHOP_VERSION' "$WF"
  grep -q 'VITE_WORKSHOP_SHA' "$WF"
}

@test "release keeps full + 3day compatibility artifacts" {
  grep -q 'slides.md' "$WF"
  grep -q 'slides-3day.md' "$WF"
  grep -q 'kubernetes-workshop-full-' "$WF"
  grep -q 'kubernetes-workshop-3day-' "$WF"
  grep -q 'kubernetes-workshop-day-1-' "$WF"
  grep -q 'kubernetes-workshop-day-2-' "$WF"
  grep -q 'kubernetes-workshop-day-3-' "$WF"
}

@test "release build validates decks before export (ARCH-005)" {
  grep -q 'pnpm decks:check' "$WF"
  grep -q 'pnpm run test:deck' "$WF"
}

@test "release jobs have explicit timeouts (REL-005)" {
  run python3 -c "
import sys, yaml
wf = yaml.safe_load(open(sys.argv[1]))
assert wf['jobs']['build'].get('timeout-minutes') == 60
assert wf['jobs']['publish'].get('timeout-minutes') == 15
" "$WF"
  [ "$status" -eq 0 ]
}
