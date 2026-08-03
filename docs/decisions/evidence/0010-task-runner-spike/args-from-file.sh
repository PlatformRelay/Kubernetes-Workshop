#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  printf '%s\n' 'usage: args-from-file.sh <nul-delimited-file>' >&2
  exit 2
fi

arguments=()
while IFS= read -r -d '' argument; do
  arguments+=("$argument")
done <"$1"

exec ./runner.sh args "${arguments[@]}"
