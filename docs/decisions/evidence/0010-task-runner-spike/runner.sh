#!/usr/bin/env bash
set -euo pipefail

action="$1"
shift
printf 'action=%s noninteractive=%s args=' "$action" "${WORKSHOP_NONINTERACTIVE:-0}"
for argument in "$@"; do
  printf '<%s>' "$argument"
done
printf '\n'
