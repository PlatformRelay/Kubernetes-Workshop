#!/usr/bin/env bash
# kind cluster create/delete without requiring GNU Make (ARCH-002 / ADR 0010).
# Makefile kind-up/kind-down are thin wrappers around this script.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../versions.env disable=SC1091
source "${SCRIPT_DIR}/../versions.env"

REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
CONFIG="${REPO_ROOT}/infra/kind/cluster.yaml"

usage() {
  echo "usage: $0 up|down" >&2
  exit 2
}

[ "${#}" -eq 1 ] || usage

case "$1" in
  up)
    if kind get clusters 2>/dev/null | grep -qx "${WORKSHOP_CLUSTER_NAME}"; then
      echo "kind cluster '${WORKSHOP_CLUSTER_NAME}' already exists — nothing to do"
    else
      kind create cluster \
        --name "${WORKSHOP_CLUSTER_NAME}" \
        --config "${CONFIG}" \
        --image "${KIND_NODE_IMAGE}"
    fi
    ;;
  down)
    if kind get clusters 2>/dev/null | grep -qx "${WORKSHOP_CLUSTER_NAME}"; then
      kind delete cluster --name "${WORKSHOP_CLUSTER_NAME}"
    else
      echo "no cluster '${WORKSHOP_CLUSTER_NAME}' — nothing to do"
    fi
    ;;
  *)
    usage
    ;;
esac
