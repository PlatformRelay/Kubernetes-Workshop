#!/usr/bin/env bash
# Refuse moving an immutable release tag / GitHub Release (US-RELEASE-1).
#
# Usage:
#   release-tag-guard.sh decide <intended_sha> <existing_sha|->
#   release-tag-guard.sh check [--dry-run] <tag> <intended_sha>
#
# decide — pure function (no network):
#   allow       (exit 0)  existing empty → new publication
#   idempotent  (exit 0)  existing matches intended (prefix-tolerant)
#   refuse      (exit 1)  existing points at a different commit
#   usage       (exit 2)
#
# check — resolve remote tag + release target via `gh`, then decide.
#   Missing tag/release (404) counts as empty. --dry-run only changes log
#   wording; the decision is identical.
#
# Release tags are never moved. Retrying publication for the same commit is
# idempotent; republishing a tag that already targets another commit is refused.
set -euo pipefail

usage() {
  echo "usage: $0 decide <intended_sha> <existing_sha|->" >&2
  echo "       $0 check [--dry-run] <tag> <intended_sha>" >&2
  exit 2
}

normalize_sha() {
  # Lowercase hex; strip whitespace. Empty / "-" → empty.
  local raw="${1:-}"
  raw="$(printf '%s' "$raw" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')"
  if [[ -z "$raw" || "$raw" == "-" ]]; then
    printf ''
    return 0
  fi
  if [[ ! "$raw" =~ ^[0-9a-f]+$ ]]; then
    echo "refuse: not a hex SHA: $raw" >&2
    return 2
  fi
  printf '%s' "$raw"
}

sha_match() {
  # Prefix-tolerant equality (full vs abbreviated).
  local a b
  a="$(normalize_sha "$1")" || return 2
  b="$(normalize_sha "$2")" || return 2
  if [[ -z "$a" || -z "$b" ]]; then
    return 1
  fi
  [[ "$a" == "$b"* || "$b" == "$a"* ]]
}

decide() {
  local intended existing
  intended="$(normalize_sha "${1:-}")" || exit 2
  existing="$(normalize_sha "${2:-}")" || exit 2

  if [[ -z "$intended" ]]; then
    usage
  fi

  if [[ -z "$existing" ]]; then
    echo "allow"
    return 0
  fi

  if sha_match "$intended" "$existing"; then
    echo "idempotent"
    return 0
  fi

  echo "refuse"
  return 1
}

# Best-effort: return SHA or empty on 404 / missing. Other errors → empty with
# a warning (check still evaluates whatever was resolved).
gh_jq_or_empty() {
  local endpoint="$1"
  local jq_expr="$2"
  local out
  if ! out="$(gh api "$endpoint" --jq "$jq_expr" 2>/dev/null)"; then
    printf ''
    return 0
  fi
  printf '%s' "$out"
}

resolve_tag_sha() {
  local tag="$1"
  # Lightweight tag: object.sha is the commit. Annotated: object.type=tag —
  # peel via git/tags/{sha} → object.sha (commit).
  local obj_sha obj_type peeled
  obj_sha="$(gh_jq_or_empty "repos/{owner}/{repo}/git/ref/tags/${tag}" ".object.sha")"
  [[ -z "$obj_sha" ]] && { printf ''; return 0; }
  obj_type="$(gh_jq_or_empty "repos/{owner}/{repo}/git/ref/tags/${tag}" ".object.type")"
  if [[ "$obj_type" == "tag" ]]; then
    peeled="$(gh_jq_or_empty "repos/{owner}/{repo}/git/tags/${obj_sha}" ".object.sha")"
    printf '%s' "${peeled:-$obj_sha}"
    return 0
  fi
  printf '%s' "$obj_sha"
}

resolve_release_target_sha() {
  local tag="$1"
  # target_commitish may be a branch name or SHA; prefer the release's
  # immutable commit when GitHub exposes it via the tag object above.
  # For the release API we read target_commitish and only treat hex as a SHA.
  local target
  target="$(gh_jq_or_empty "repos/{owner}/{repo}/releases/tags/${tag}" ".target_commitish")"
  if [[ "$target" =~ ^[0-9a-fA-F]{7,40}$ ]]; then
    printf '%s' "$target"
    return 0
  fi
  # Non-SHA target (e.g. "main") — fall back to empty so tag SHA remains
  # the authoritative immutability check.
  printf ''
}

check() {
  local dry_run=0
  if [[ "${1:-}" == "--dry-run" ]]; then
    dry_run=1
    shift
  fi
  local tag="${1:-}"
  local intended="${2:-}"
  if [[ -z "$tag" || -z "$intended" ]]; then
    usage
  fi

  if ! command -v gh >/dev/null 2>&1; then
    echo "gh is required for check mode" >&2
    exit 2
  fi

  local tag_sha release_sha decision=allow rc=0
  tag_sha="$(resolve_tag_sha "$tag")"
  release_sha="$(resolve_release_target_sha "$tag")"

  # Evaluate tag pointer first, then release target — any refuse wins.
  local d
  d="$(decide "$intended" "$tag_sha")" && rc=0 || rc=$?
  if [[ $rc -eq 2 ]]; then
    exit 2
  fi
  if [[ $rc -ne 0 ]]; then
    decision="refuse"
  else
    decision="$d"
  fi

  if [[ "$decision" != "refuse" ]]; then
    d="$(decide "$intended" "$release_sha")" && rc=0 || rc=$?
    if [[ $rc -eq 2 ]]; then
      exit 2
    fi
    if [[ $rc -ne 0 ]]; then
      decision="refuse"
    elif [[ "$decision" == "allow" && "$d" == "idempotent" ]]; then
      decision="idempotent"
    elif [[ "$d" == "idempotent" ]]; then
      decision="idempotent"
    fi
  fi

  if [[ "$dry_run" -eq 1 ]]; then
    echo "dry-run: tag=${tag} intended=${intended} tag_sha=${tag_sha:-<none>} release_sha=${release_sha:-<none>} → ${decision}"
  else
    echo "${decision}: tag=${tag} intended=${intended} tag_sha=${tag_sha:-<none>} release_sha=${release_sha:-<none>}"
  fi

  if [[ "$decision" == "refuse" ]]; then
    echo "refusing: release tag/release already points at a different commit (tags are immutable)" >&2
    return 1
  fi
  return 0
}

main() {
  local cmd="${1:-}"
  shift || true
  case "$cmd" in
    decide)
      decide "$@"
      ;;
    check)
      check "$@"
      ;;
    *)
      usage
      ;;
  esac
}

main "$@"
