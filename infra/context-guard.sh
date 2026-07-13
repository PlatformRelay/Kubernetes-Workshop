#!/usr/bin/env sh
# Refuse to run offensive steps anywhere but a kind cluster you own.
ctx="$(kubectl config current-context 2>/dev/null)"
case "$ctx" in
  kind-*)
    echo "OK: current context is '$ctx' (a kind cluster) — safe to proceed."
    ;;
  *)
    echo "REFUSING: current context is '$ctx', which is NOT a kind- context." >&2
    echo "This lab performs a container escape and must run ONLY in a throwaway kind cluster." >&2
    exit 1
    ;;
esac
