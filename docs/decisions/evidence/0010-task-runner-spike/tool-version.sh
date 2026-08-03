#!/usr/bin/env bash
set -euo pipefail

kind_path="$(command -v kind)"
case "$kind_path" in
  */mise/installs/kind/0.32.0/kind) ;;
  *)
    printf 'unexpected kind path: %s\n' "$kind_path" >&2
    exit 1
    ;;
esac

case "$(kind version)" in
  'kind v0.32.0 '*) ;;
  *)
    printf '%s\n' 'unexpected kind version' >&2
    exit 1
    ;;
esac

printf '%s\n' 'tool=kind version=0.32.0 source=mise'
