#!/usr/bin/env bats
# US-GITOPS-CHOICE-D — flux add-on + argocd/flux mutual exclusion.
# Mocked kubectl only; no real cluster or remote manifest fetch.

load helpers

setup() {
  setup_mocks
  ROUTING_STUBS="$ROOT/infra/tests/routing-stubs"
  PATH="$ROUTING_STUBS:$ROOT/infra/tests/stubs:$PATH"
  export PATH
  chmod +x "$ROUTING_STUBS"/* "$ROOT"/infra/tests/stubs/* \
    "$ROOT/infra/addons/"*.sh "$ROOT/workshop" 2>/dev/null || true

  export WORKSHOP_NONINTERACTIVE=1
  export WORKSHOP_ADDON_SKIP_REMOTE=1
  unset MOCK_ROUTING_NAMESPACES MOCK_ROUTING_GATEWAYCLASSES MOCK_ROUTING_INGRESSCLASSES
  unset MOCK_ROUTING_PROFILE_MARKERS MOCK_ROUTING_HOSTPORTS MOCK_ROUTING_CRDS
  unset MOCK_ROUTING_TRANSITION MOCK_ADDON_MARKERS MOCK_ADDON_DEPLOYS
  : >"$BATS_TEST_TMPDIR/apply.log"
  export MOCK_ROUTING_APPLY_LOG="$BATS_TEST_TMPDIR/apply.log"
  export MOCK_ROUTING_STATE="$BATS_TEST_TMPDIR/routing.state"
  cat >"$MOCK_ROUTING_STATE" <<EOF
ROUTING_NS=''
ROUTING_MARKERS=''
ROUTING_GWC=''
ROUTING_IC=''
ROUTING_PORTS=''
ROUTING_CRDS=''
ADDON_MARKERS=''
ADDON_DEPLOYS=''
EOF
}

@test "flux pin is present in versions.env" {
  [ -n "${FLUX_VERSION:-}" ]
  echo "$FLUX_VERSION" | grep -Eq '^v[0-9]'
}

@test "preflight allows flux on an empty cluster" {
  run "$ROOT/infra/addons/gitops-preflight.sh" check flux
  [ "$status" -eq 0 ]
  echo "$output" | grep -qi "ok\|clear\|pass"
}

@test "preflight allows argocd on an empty cluster" {
  run "$ROOT/infra/addons/gitops-preflight.sh" check argocd
  [ "$status" -eq 0 ]
}

@test "preflight refuses flux when workshop Argo CD is installed" {
  export MOCK_ROUTING_NAMESPACES="argocd"
  export MOCK_ADDON_MARKERS="argocd:argocd"
  export MOCK_ADDON_DEPLOYS="argocd:argocd-server"

  run "$ROOT/infra/addons/gitops-preflight.sh" check flux
  [ "$status" -ne 0 ]
  echo "$output" | grep -qi "argocd"
  echo "$output" | grep -qi "transition\|teardown\|remediat"
  [ ! -s "$MOCK_ROUTING_APPLY_LOG" ]
}

@test "preflight refuses argocd when workshop Flux is installed" {
  export MOCK_ROUTING_NAMESPACES="flux-system"
  export MOCK_ADDON_MARKERS="flux-system:flux"
  export MOCK_ADDON_DEPLOYS="flux-system:source-controller"

  run "$ROOT/infra/addons/gitops-preflight.sh" check argocd
  [ "$status" -ne 0 ]
  echo "$output" | grep -qi "flux"
  echo "$output" | grep -qi "transition\|teardown\|remediat"
  [ ! -s "$MOCK_ROUTING_APPLY_LOG" ]
}

@test "preflight refuses flux when foreign Argo CD namespace exists" {
  export MOCK_ROUTING_NAMESPACES="argocd"
  export MOCK_ADDON_DEPLOYS="argocd:argocd-server"
  # No workshop marker → foreign.

  run "$ROOT/infra/addons/gitops-preflight.sh" check flux
  [ "$status" -ne 0 ]
  echo "$output" | grep -qi "foreign\|unowned\|not workshop"
  [ ! -s "$MOCK_ROUTING_APPLY_LOG" ]
}

@test "preflight refuses argocd when foreign Flux namespace exists" {
  export MOCK_ROUTING_NAMESPACES="flux-system"
  export MOCK_ADDON_DEPLOYS="flux-system:source-controller"

  run "$ROOT/infra/addons/gitops-preflight.sh" check argocd
  [ "$status" -ne 0 ]
  echo "$output" | grep -qi "foreign\|unowned\|not workshop"
  [ ! -s "$MOCK_ROUTING_APPLY_LOG" ]
}

@test "detect reports none on an empty cluster" {
  run "$ROOT/infra/addons/gitops-preflight.sh" detect
  [ "$status" -eq 0 ]
  echo "$output" | grep -qx "none"
}

@test "detect reports argocd when workshop marker is present" {
  export MOCK_ROUTING_NAMESPACES="argocd"
  export MOCK_ADDON_MARKERS="argocd:argocd"

  run "$ROOT/infra/addons/gitops-preflight.sh" detect
  [ "$status" -eq 0 ]
  echo "$output" | grep -qx "argocd"
}

@test "detect reports flux when workshop marker is present" {
  export MOCK_ROUTING_NAMESPACES="flux-system"
  export MOCK_ADDON_MARKERS="flux-system:flux"

  run "$ROOT/infra/addons/gitops-preflight.sh" detect
  [ "$status" -eq 0 ]
  echo "$output" | grep -qx "flux"
}

@test "detect reports conflict when both Argo CD and Flux namespaces exist" {
  export MOCK_ROUTING_NAMESPACES="argocd flux-system"
  export MOCK_ADDON_MARKERS="argocd:argocd flux-system:flux"

  run "$ROOT/infra/addons/gitops-preflight.sh" detect
  [ "$status" -eq 0 ]
  echo "$output" | grep -qx "conflict"
}

@test "flux install (skip-remote) succeeds when absent" {
  run "$ROOT/infra/addons/flux.sh" install
  [ "$status" -eq 0 ]
  echo "$output" | grep -qi "flux"
  echo "$output" | grep -qi "skip-remote\|installed\|workshop-owned\|idempotent\|ready"
}

@test "flux install is idempotent when already workshop-owned" {
  run "$ROOT/infra/addons/flux.sh" install
  [ "$status" -eq 0 ]
  : >"$MOCK_ROUTING_APPLY_LOG"

  run "$ROOT/infra/addons/flux.sh" install
  [ "$status" -eq 0 ]
  echo "$output" | grep -qi "already\|idempotent\|workshop-owned"
  [ ! -s "$MOCK_ROUTING_APPLY_LOG" ]
}

@test "flux install refuses while workshop Argo CD is active" {
  export MOCK_ROUTING_NAMESPACES="argocd"
  export MOCK_ADDON_MARKERS="argocd:argocd"
  export MOCK_ADDON_DEPLOYS="argocd:argocd-server"

  run "$ROOT/infra/addons/flux.sh" install
  [ "$status" -ne 0 ]
  echo "$output" | grep -qi "argocd\|mutual\|exclusive\|conflict\|transition"
  [ ! -s "$MOCK_ROUTING_APPLY_LOG" ]
}

@test "argocd install refuses while workshop Flux is active" {
  export MOCK_ROUTING_NAMESPACES="flux-system"
  export MOCK_ADDON_MARKERS="flux-system:flux"
  export MOCK_ADDON_DEPLOYS="flux-system:source-controller"

  run "$ROOT/infra/addons/argocd.sh" install
  [ "$status" -ne 0 ]
  echo "$output" | grep -qi "flux\|mutual\|exclusive\|conflict\|transition"
  [ ! -s "$MOCK_ROUTING_APPLY_LOG" ]
}

@test "flux install refuses foreign Deployment without workshop marker" {
  export MOCK_ROUTING_NAMESPACES="flux-system"
  export MOCK_ADDON_DEPLOYS="flux-system:source-controller"

  run "$ROOT/infra/addons/flux.sh" install
  [ "$status" -ne 0 ]
  echo "$output" | grep -qi "foreign\|unowned\|refusing"
  echo "$output" | grep -qi "remediat"
}

@test "flux teardown refuses foreign namespace" {
  export MOCK_ROUTING_NAMESPACES="flux-system"
  export MOCK_ADDON_DEPLOYS="flux-system:source-controller"

  run "$ROOT/infra/addons/flux.sh" uninstall
  [ "$status" -ne 0 ]
  echo "$output" | grep -qi "foreign\|unowned\|refusing"
}

@test "flux teardown removes workshop-owned addon" {
  run "$ROOT/infra/addons/flux.sh" install
  [ "$status" -eq 0 ]

  run "$ROOT/infra/addons/flux.sh" uninstall
  [ "$status" -eq 0 ]
  echo "$output" | grep -qi "removed\|torn\|teardown\|uninstall\|ok"
}

@test "transition Argo→Flux tears down Argo then installs Flux" {
  export MOCK_ROUTING_NAMESPACES="argocd"
  export MOCK_ADDON_MARKERS="argocd:argocd"
  export MOCK_ADDON_DEPLOYS="argocd:argocd-server"

  run "$ROOT/infra/addons/profile.sh" transition flux
  [ "$status" -eq 0 ]
  echo "$output" | grep -qi "flux"
  # shellcheck disable=SC1090
  . "$MOCK_ROUTING_STATE"
  echo "$ADDON_MARKERS" | grep -q "flux-system:flux"
  ! echo "$ADDON_MARKERS" | grep -q "argocd:argocd"
}

@test "transition Flux→Argo tears down Flux then installs Argo" {
  export MOCK_ROUTING_NAMESPACES="flux-system"
  export MOCK_ADDON_MARKERS="flux-system:flux"
  export MOCK_ADDON_DEPLOYS="flux-system:source-controller"

  run "$ROOT/infra/addons/profile.sh" transition argocd
  [ "$status" -eq 0 ]
  echo "$output" | grep -qi "argocd"
  # shellcheck disable=SC1090
  . "$MOCK_ROUTING_STATE"
  echo "$ADDON_MARKERS" | grep -q "argocd:argocd"
  ! echo "$ADDON_MARKERS" | grep -q "flux-system:flux"
}

@test "day-3 default composes argocd (not flux)" {
  run "$ROOT/infra/addons/profile.sh" check day-3
  [ "$status" -eq 0 ]
  echo "$output" | grep -qi "argocd\|argo"
  ! echo "$output" | grep -Eqi '(^|[[:space:]-])flux([[:space:]]|$)'
}

@test "day-3 --gitops flux composes flux instead of argocd" {
  run "$ROOT/infra/addons/profile.sh" check day-3 --gitops flux
  [ "$status" -eq 0 ]
  echo "$output" | grep -qi "flux"
  ! echo "$output" | grep -qi "argocd\|argo-cd\|argo "
}

@test "day-3 --gitops flux install succeeds (skip-remote) and is idempotent" {
  run "$ROOT/infra/addons/profile.sh" day-3 --gitops flux
  [ "$status" -eq 0 ]
  echo "$output" | grep -qi "flux"
  echo "$output" | grep -qi "cert-manager"
  echo "$output" | grep -qi "kube-prometheus\|prometheus"

  run "$ROOT/infra/addons/profile.sh" day-3 --gitops flux
  [ "$status" -eq 0 ]
  echo "$output" | grep -qi "already\|idempotent\|workshop-owned"
}

@test "day-3 --gitops flux refuses while Argo CD is installed" {
  export MOCK_ROUTING_NAMESPACES="argocd"
  export MOCK_ADDON_MARKERS="argocd:argocd"
  export MOCK_ADDON_DEPLOYS="argocd:argocd-server"

  run "$ROOT/infra/addons/profile.sh" day-3 --gitops flux
  [ "$status" -ne 0 ]
  echo "$output" | grep -qi "argocd\|mutual\|exclusive\|conflict\|transition"
}

@test "day-3 --gitops flux teardown removes flux composition" {
  run "$ROOT/infra/addons/profile.sh" day-3 --gitops flux
  [ "$status" -eq 0 ]

  run "$ROOT/infra/addons/profile.sh" day-3 --gitops flux --teardown
  [ "$status" -eq 0 ]
  # shellcheck disable=SC1090
  . "$MOCK_ROUTING_STATE"
  ! echo "$ADDON_MARKERS" | grep -q "flux-system:flux"
  ! echo "$ADDON_MARKERS" | grep -q "cert-manager:cert-manager"
  ! echo "$ADDON_MARKERS" | grep -q "monitoring:kube-prometheus"
}

# --- D-F1: day-3 teardown must remove what is actually installed ------------

@test "day-3 teardown without --gitops removes installed flux (auto-detect)" {
  run "$ROOT/infra/addons/profile.sh" day-3 --gitops flux
  [ "$status" -eq 0 ]

  run "$ROOT/infra/addons/profile.sh" day-3 --teardown
  [ "$status" -eq 0 ]
  # shellcheck disable=SC1090
  . "$MOCK_ROUTING_STATE"
  # NOTE: a non-final `! cmd` line doesn't fail a bats test (only final-line
  # negation does) — use grep -c for negative asserts.
  [ "$(echo "$ADDON_MARKERS" | grep -c "flux-system:flux")" -eq 0 ]
  [ "$(echo "$ADDON_MARKERS" | grep -c "cert-manager:cert-manager")" -eq 0 ]
  [ "$(echo "$ADDON_MARKERS" | grep -c "monitoring:kube-prometheus")" -eq 0 ]
}

@test "day-3 teardown without --gitops removes installed argocd (auto-detect)" {
  run "$ROOT/infra/addons/profile.sh" day-3
  [ "$status" -eq 0 ]

  run "$ROOT/infra/addons/profile.sh" day-3 --teardown
  [ "$status" -eq 0 ]
  # shellcheck disable=SC1090
  . "$MOCK_ROUTING_STATE"
  [ "$(echo "$ADDON_MARKERS" | grep -c "argocd:argocd")" -eq 0 ]
  [ "$(echo "$ADDON_MARKERS" | grep -c "cert-manager:cert-manager")" -eq 0 ]
  [ "$(echo "$ADDON_MARKERS" | grep -c "monitoring:kube-prometheus")" -eq 0 ]
}

@test "day-3 teardown --gitops argocd refuses when flux is installed" {
  export MOCK_ROUTING_NAMESPACES="flux-system"
  export MOCK_ADDON_MARKERS="flux-system:flux cert-manager:cert-manager monitoring:kube-prometheus"
  export MOCK_ADDON_DEPLOYS="flux-system:source-controller"

  run "$ROOT/infra/addons/profile.sh" day-3 --gitops argocd --teardown
  [ "$status" -ne 0 ]
  echo "$output" | grep -qi "flux"
  echo "$output" | grep -qi "contradict\|mismatch\|refus"
  echo "$output" | grep -qi "remediat"
  # Refusal happens before any component teardown — nothing removed.
  # shellcheck disable=SC1090
  . "$MOCK_ROUTING_STATE"
  echo "$ADDON_MARKERS" | grep -q "flux-system:flux"
  echo "$ADDON_MARKERS" | grep -q "cert-manager:cert-manager"
  echo "$ADDON_MARKERS" | grep -q "monitoring:kube-prometheus"
}

@test "day-3 teardown --gitops flux refuses when argocd is installed" {
  export MOCK_ROUTING_NAMESPACES="argocd"
  export MOCK_ADDON_MARKERS="argocd:argocd"
  export MOCK_ADDON_DEPLOYS="argocd:argocd-server"

  run "$ROOT/infra/addons/profile.sh" day-3 --gitops flux --teardown
  [ "$status" -ne 0 ]
  echo "$output" | grep -qi "argocd"
  echo "$output" | grep -qi "contradict\|mismatch\|refus"
  # shellcheck disable=SC1090
  . "$MOCK_ROUTING_STATE"
  echo "$ADDON_MARKERS" | grep -q "argocd:argocd"
}

@test "day-3 teardown refuses when both Argo CD and Flux are present" {
  export MOCK_ROUTING_NAMESPACES="argocd flux-system"
  export MOCK_ADDON_MARKERS="argocd:argocd flux-system:flux"

  run "$ROOT/infra/addons/profile.sh" day-3 --teardown
  [ "$status" -ne 0 ]
  echo "$output" | grep -qi "both\|conflict"
  echo "$output" | grep -qi "remediat"
}

@test "day-3 teardown skips foreign flux but removes shared components" {
  export MOCK_ROUTING_NAMESPACES="flux-system"
  export MOCK_ADDON_MARKERS="cert-manager:cert-manager monitoring:kube-prometheus"
  export MOCK_ADDON_DEPLOYS="flux-system:source-controller"

  run "$ROOT/infra/addons/profile.sh" day-3 --teardown
  [ "$status" -eq 0 ]
  echo "$output" | grep -qi "foreign\|unowned"
  # shellcheck disable=SC1090
  . "$MOCK_ROUTING_STATE"
  echo "$ADDON_DEPLOYS" | grep -q "flux-system:source-controller"
  [ "$(echo "$ADDON_MARKERS" | grep -c "cert-manager:cert-manager")" -eq 0 ]
  [ "$(echo "$ADDON_MARKERS" | grep -c "monitoring:kube-prometheus")" -eq 0 ]
}

@test "day-3 teardown on an empty cluster succeeds" {
  run "$ROOT/infra/addons/profile.sh" day-3 --teardown
  [ "$status" -eq 0 ]
}

# --- D-F2: transition refuse paths (gitops-preflight.sh) --------------------

@test "transition refuses when both Argo CD and Flux are present (conflict)" {
  export MOCK_ROUTING_NAMESPACES="argocd flux-system"
  export MOCK_ADDON_MARKERS="argocd:argocd flux-system:flux"

  run "$ROOT/infra/addons/profile.sh" transition flux
  [ "$status" -ne 0 ]
  echo "$output" | grep -qi "both"
  echo "$output" | grep -qi "remediat"
  [ ! -s "$MOCK_ROUTING_APPLY_LOG" ]
  # Neither stack was torn down.
  # shellcheck disable=SC1090
  . "$MOCK_ROUTING_STATE"
  echo "$ADDON_MARKERS" | grep -q "argocd:argocd"
  echo "$ADDON_MARKERS" | grep -q "flux-system:flux"
}

@test "transition to flux refuses foreign Argo CD (unowned namespace)" {
  export MOCK_ROUTING_NAMESPACES="argocd"
  export MOCK_ADDON_DEPLOYS="argocd:argocd-server"

  run "$ROOT/infra/addons/profile.sh" transition flux
  [ "$status" -ne 0 ]
  echo "$output" | grep -qi "foreign\|unowned"
  echo "$output" | grep -qi "remediat"
  [ ! -s "$MOCK_ROUTING_APPLY_LOG" ]
}

@test "transition to argocd refuses foreign Flux (unowned namespace)" {
  export MOCK_ROUTING_NAMESPACES="flux-system"
  export MOCK_ADDON_DEPLOYS="flux-system:source-controller"

  run "$ROOT/infra/addons/profile.sh" transition argocd
  [ "$status" -ne 0 ]
  echo "$output" | grep -qi "foreign\|unowned"
  echo "$output" | grep -qi "remediat"
  [ ! -s "$MOCK_ROUTING_APPLY_LOG" ]
}

@test "transition to flux refuses foreign Flux (unowned namespace, no adopt)" {
  export MOCK_ROUTING_NAMESPACES="flux-system"
  export MOCK_ADDON_DEPLOYS="flux-system:source-controller"

  run "$ROOT/infra/addons/profile.sh" transition flux
  [ "$status" -ne 0 ]
  echo "$output" | grep -qi "foreign\|unowned"
  [ ! -s "$MOCK_ROUTING_APPLY_LOG" ]
}

@test "profile help documents --gitops and argocd/flux mutex" {
  run "$ROOT/infra/addons/profile.sh" --help
  [ "$status" -eq 0 ]
  echo "$output" | grep -q -- "--gitops"
  echo "$output" | grep -qi "argocd\|flux"
  echo "$output" | grep -qi "exclusive\|mutual\|never\|one at a time\|transition"
}

@test "profile status reports flux when installed" {
  run "$ROOT/infra/addons/flux.sh" install
  [ "$status" -eq 0 ]

  run "$ROOT/infra/addons/profile.sh" status
  [ "$status" -eq 0 ]
  echo "$output" | grep -qi "addon=flux: installed"
}
