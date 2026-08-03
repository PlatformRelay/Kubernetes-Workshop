#!/usr/bin/env bash
# Literal dollar and backtick strings below are security regression payloads.
# shellcheck disable=SC2016
set -euo pipefail

if [ "${1:-}" != "--strict" ] || [ "$#" -ne 1 ]; then
  printf '%s\n' 'usage: verify.sh --strict' >&2
  exit 2
fi

evidence_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
scratch="$(mktemp -d "${TMPDIR:-/tmp}/workshop-runner-spike.XXXXXX")"
trap 'rm -rf -- "$scratch"' EXIT

for required in make mise; do
  command -v "$required" >/dev/null 2>&1 || {
    printf 'required runner/checker is missing: %s\n' "$required" >&2
    exit 1
  }
done

mise_path="$(command -v mise)"
export MISE_TRUSTED_CONFIG_PATHS="$scratch"

cp "$evidence_dir/Makefile" "$scratch/Makefile"
cp "$evidence_dir/Taskfile.yml" "$scratch/Taskfile.yml"
cp "$evidence_dir/mise.toml" "$scratch/mise.toml"
cp "$evidence_dir/mise.lock" "$scratch/mise.lock"
cp "$evidence_dir/runner.sh" "$scratch/runner.sh"
cp "$evidence_dir/args-from-file.sh" "$scratch/args-from-file.sh"
cp "$evidence_dir/tool-version.sh" "$scratch/tool-version.sh"
cp "$evidence_dir/workshop" "$scratch/workshop"
chmod +x "$scratch/args-from-file.sh" "$scratch/runner.sh" \
  "$scratch/tool-version.sh" "$scratch/workshop"
touch "$scratch/.ready"

(cd "$scratch" && "$mise_path" install --locked)

make_version="$(make --version | sed -n '1p')"
mise_version="$(mise --version 2>/dev/null | sed -n '1p')"
task_version="$(cd "$scratch" && "$mise_path" exec -- task --version)"

case "$make_version" in
  'GNU Make '*) ;;
  *) printf 'unexpected Make version: %s\n' "$make_version" >&2; exit 1 ;;
esac
case "$mise_version" in
  20[0-9][0-9].*) ;;
  *) printf 'unexpected mise version: %s\n' "$mise_version" >&2; exit 1 ;;
esac
[ "$task_version" = "3.52.0" ] || {
  printf 'expected Task 3.52.0, got %s\n' "$task_version" >&2
  exit 1
}

if env PATH=/usr/bin:/bin sh -c 'command -v kind >/dev/null 2>&1'; then
  printf '%s\n' 'kind unexpectedly exists on the restricted host PATH' >&2
  exit 1
fi

expected_help='commands: help up down doctor profile-observability args tool-version'
expected_profile=$'action=up noninteractive=1 args=\naction=addon-gateway-api noninteractive=1 args=\naction=addon-metrics-server noninteractive=1 args=\naction=doctor noninteractive=1 args='
expected_down='action=down noninteractive=1 args='
expected_args='action=args noninteractive=1 args=<alpha><beta gamma><*.md><$HOME><$(printf injected)><semi;colon><`printf injected`>'
expected_tool='tool=kind version=0.32.0 source=mise'

assert_exact() {
  local label="$1" expected="$2" actual="$3"
  if [ "$actual" != "$expected" ]; then
    printf 'FAIL: %s\nexpected:\n%s\nactual:\n%s\n' \
      "$label" "$expected" "$actual" >&2
    exit 1
  fi
  printf 'PASS: %s\n' "$label"
}

for runner in make task mise; do
  runner_command=(env PATH=/usr/bin:/bin MISE_BIN="$mise_path" \
    WORKSHOP_NONINTERACTIVE=1 "$scratch/workshop" --runner "$runner")

  assert_exact "$runner discovery" "$expected_help" \
    "$("${runner_command[@]}" help)"
  assert_exact "$runner profile order and noninteractive mode" "$expected_profile" \
    "$("${runner_command[@]}" profile-observability)"
  assert_exact "$runner down" "$expected_down" \
    "$("${runner_command[@]}" down)"
  assert_exact "$runner argument boundaries" "$expected_args" \
    "$("${runner_command[@]}" args alpha 'beta gamma' '*.md' '$HOME' \
      '$(printf injected)' 'semi;colon' '`printf injected`')"
  assert_exact "$runner mise-managed tool" "$expected_tool" \
    "$("${runner_command[@]}" tool-version)"
done

mv "$scratch/.ready" "$scratch/.ready.off"
for runner in make task mise; do
  if env PATH=/usr/bin:/bin MISE_BIN="$mise_path" \
    WORKSHOP_NONINTERACTIVE=1 "$scratch/workshop" --runner "$runner" \
    profile-observability >"$scratch/$runner-precondition.out" 2>&1; then
    printf 'FAIL: %s accepted a missing precondition\n' "$runner" >&2
    exit 1
  fi
  grep -Fq 'missing .ready' "$scratch/$runner-precondition.out" || {
    printf 'FAIL: %s did not explain its missing precondition\n' "$runner" >&2
    exit 1
  }
  printf 'PASS: %s rejected a missing precondition\n' "$runner"
done

(cd "$scratch" && "$mise_path" exec -- shellcheck \
  "$evidence_dir/args-from-file.sh" "$evidence_dir/runner.sh" \
  "$evidence_dir/tool-version.sh" "$evidence_dir/workshop" \
  "$evidence_dir/verify.sh")

printf 'versions: %s | Task %s | mise %s\n' \
  "$make_version" "$task_version" "$mise_version"
