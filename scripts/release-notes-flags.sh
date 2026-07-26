#!/usr/bin/env bash
# Decide GitHub Release flags for a version tag (US-BETA-7).
#
# Usage:
#   release-notes-flags.sh <tag>
#
# Writes GitHub Actions output pairs to $GITHUB_OUTPUT (required):
#   prerelease=true|false
#   body_path=docs/beta-limitations.md   # when pre-release
#   body_path=                           # when stable
#
# A tag whose name contains `-` is treated as a semver pre-release
# (e.g. v0.2.0-beta.1, v1.0.0-rc.1). Called from .github/workflows/release.yml.
set -euo pipefail

tag="${1:-}"
if [[ -z "$tag" ]]; then
  echo "usage: $0 <tag>" >&2
  exit 2
fi

if [[ -z "${GITHUB_OUTPUT:-}" ]]; then
  echo "GITHUB_OUTPUT is unset; refuse to invent a sink" >&2
  exit 2
fi

if [[ "$tag" == *-* ]]; then
  {
    echo "prerelease=true"
    echo "body_path=docs/beta-limitations.md"
  } >>"$GITHUB_OUTPUT"
else
  {
    echo "prerelease=false"
    echo "body_path="
  } >>"$GITHUB_OUTPUT"
fi
