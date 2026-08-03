#!/usr/bin/env bash
set -euo pipefail

evidence_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
scratch="$(mktemp -d "${TMPDIR:-/tmp}/workshop-runner-spike.XXXXXX")"
trap 'rm -rf -- "$scratch"' EXIT

cp "$evidence_dir/Makefile" "$scratch/Makefile"
cp "$evidence_dir/Taskfile.yml" "$scratch/Taskfile.yml"
cp "$evidence_dir/mise.toml" "$scratch/mise.toml"
cp "$evidence_dir/runner.sh" "$scratch/runner.sh"
chmod +x "$scratch/runner.sh"
touch "$scratch/.ready"

cd "$scratch"

make help
WORKSHOP_NONINTERACTIVE=1 make profile
WORKSHOP_NONINTERACTIVE=1 make down
make args ARGS='alpha "beta gamma"'

if command -v task >/dev/null 2>&1; then
  task --list
  WORKSHOP_NONINTERACTIVE=1 task profile
  WORKSHOP_NONINTERACTIVE=1 task down
  task args -- alpha 'beta gamma'
else
  printf '%s\n' 'SKIP: task is not installed'
fi

if command -v mise >/dev/null 2>&1; then
  export MISE_TRUSTED_CONFIG_PATHS="$scratch"
  mise tasks
  WORKSHOP_NONINTERACTIVE=1 mise run profile
  WORKSHOP_NONINTERACTIVE=1 mise run down
  mise run args -- alpha 'beta gamma'
else
  printf '%s\n' 'SKIP: mise is not installed'
fi

mv .ready .ready.off
for runner in make task mise; do
  command -v "$runner" >/dev/null 2>&1 || continue
  if [ "$runner" = "mise" ]; then
    command=(mise run up)
  else
    command=("$runner" up)
  fi
  if "${command[@]}" >"$runner-precondition.out" 2>&1; then
    printf 'FAIL: %s accepted a missing precondition\n' "$runner" >&2
    exit 1
  fi
  printf 'PASS: %s rejected a missing precondition\n' "$runner"
done

shellcheck "$evidence_dir/runner.sh" "$evidence_dir/verify.sh"
